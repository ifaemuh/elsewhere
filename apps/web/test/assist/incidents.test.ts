import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { message: string } | null };
interface Op {
  table: string;
  op: 'insert' | 'update';
  payload: Record<string, unknown>;
  filters: unknown[][];
}
const selects: Record<string, Result> = {};
const ops: Op[] = [];

function from(table: string) {
  const filters: unknown[][] = [];
  const q: Record<string, unknown> = {};
  const result = (): Result => selects[table] ?? { data: null, error: null };
  // A query awaited as a list reads `table[]`, so one table can serve a single row and a list.
  const list = (): Result => selects[`${table}[]`] ?? result();
  const write = (op: Op['op']) => (payload: Record<string, unknown>) => {
    ops.push({ table, op, payload, filters });
    return Object.assign(Object.create(q) as object, { then: (resolve: (v: Result) => void) => resolve({ data: null, error: null }) });
  };
  const chain = (name: string) => (...args: unknown[]) => (filters.push([name, ...args]), q);
  Object.assign(q, {
    select: chain('select'),
    eq: chain('eq'),
    neq: chain('neq'),
    in: chain('in'),
    order: chain('order'),
    limit: chain('limit'),
    insert: (payload: Record<string, unknown>) => {
      ops.push({ table, op: 'insert', payload, filters });
      return Object.assign(Object.create(q) as object, {
        select: () => ({ single: async () => ({ data: { id: 'pb-new' }, error: null }) }),
        then: (resolve: (v: Result) => void) => resolve({ data: null, error: null }),
      });
    },
    update: write('update'),
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (v: Result) => void) => resolve(list()),
  });
  return q;
}

const queueNotifications = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
const generatePlaybook = vi.hoisted(() => vi.fn());
vi.mock('@/lib/notify/queue', () => ({ queueNotifications }));
vi.mock('@/lib/flights/aeroapi', () => ({ aeroApi: async () => ({ airport: async () => null }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));
vi.mock('@/lib/assist/playbook', () => ({ generatePlaybook }));
vi.mock('@/lib/rules/library', () => ({ getLibrary: () => ({ rules: [] }) }));

import { askPlanner, notifyAffected, recordAnswer, releaseHeldPlaybooks, savePlaybook, unnotifiedIncidentIds } from '@/lib/assist/incidents';

const question = { fact: 'passenger.accepted_alternative', prompt: 'Did anyone accept?', options: [] };
const writes = (table: string, op: Op['op']) => ops.filter((o) => o.table === table && o.op === op).map((o) => o.payload);

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test';
  for (const key of Object.keys(selects)) delete selects[key];
  ops.length = 0;
  queueNotifications.mockClear();
  generatePlaybook.mockReset();
});

describe('recordAnswer', () => {
  beforeEach(() => {
    selects.incidents = { data: { facts: { 'event.cause': 'unknown' } }, error: null };
  });

  it('keeps the raw answer in the event and sets the fact it decides', async () => {
    await recordAnswer('inc', { fact: 'passenger.accepted_alternative', value: 'false' });
    expect(writes('incidents', 'update')).toEqual([{ facts: { 'event.cause': 'unknown', 'passenger.accepted_alternative': false }, status: 'open', pending_question: null }]);
    expect(writes('incident_events', 'insert')).toEqual([{ incident_id: 'inc', kind: 'answered', detail: { fact: 'passenger.accepted_alternative', value: 'false' } }]);
  });

  it('stores the “mixed” answer raw, and leaves the fact unset', async () => {
    await recordAnswer('inc', { fact: 'passenger.accepted_alternative', value: 'mixed' });
    expect(writes('incidents', 'update')[0]).toMatchObject({ facts: { 'event.cause': 'unknown' } });
    expect(writes('incident_events', 'insert')[0]).toMatchObject({ detail: { fact: 'passenger.accepted_alternative', value: 'mixed' } });
  });

  it('records an answer off the list as rejected, without failing the run or setting a fact', async () => {
    await recordAnswer('inc', { fact: 'passenger.accepted_alternative', value: 'perhaps' });
    expect(writes('incidents', 'update')[0]).toMatchObject({ facts: { 'event.cause': 'unknown' }, status: 'open' });
    expect(writes('incident_events', 'insert')[0]).toMatchObject({ detail: { value: 'perhaps', rejected: true } });
  });

  it('records that no answer came', async () => {
    await recordAnswer('inc', null);
    expect(writes('incident_events', 'insert')).toEqual([{ incident_id: 'inc', kind: 'answered', detail: { timed_out: true } }]);
  });
});

describe('askPlanner', () => {
  it('asks the planner once and records that it asked', async () => {
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: { trip_id: 't1', trips: { name: 'Lisbon 2026' } }, error: null };
    selects.trip_members = { data: { user_id: 'planner-1' }, error: null };
    await askPlanner('inc', question);
    expect(writes('incidents', 'update')).toEqual([{ status: 'needs_answer', pending_question: question }]);
    expect(queueNotifications).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['planner-1'], template: 'incident_question', urgent: true }));
    expect(writes('incident_events', 'insert')).toEqual([{ incident_id: 'inc', kind: 'question_asked', detail: { fact: question.fact } }]);
  });

  it('does not ask, or text the planner, again on a retry', async () => {
    selects.incident_events = { data: [{ detail: { fact: question.fact } }], error: null };
    await askPlanner('inc', question);
    expect(ops).toEqual([]);
    expect(queueNotifications).not.toHaveBeenCalled();
  });
});

describe('savePlaybook', () => {
  const assessmentRows = () => {
    selects.playbooks = { data: null, error: null };
    selects.incidents = {
      data: { id: 'inc', trip_id: 't1', segment_id: 's1', event_type: 'cancellation', delay_minutes: null, detected_at: '2026-11-01T12:00:00Z', facts: {}, raw_payload: {}, affected_user_ids: ['u1'], trips: { name: 'Lisbon', pass_status: 'active', hand_run: false } },
      error: null,
    };
    selects.booking_segments = {
      data: { booking_id: 'b1', flight_number: '204', departure_local: '2026-11-03T18:15', distance_km: null, last_status: null, last_status_at: null, carrier_iata: 'TP', operator_iata: 'TP', origin_iata: 'EWR', destination_iata: 'LIS', origin_country: 'US', destination_country: 'PT', scheduled_out: null, scheduled_in: null },
      error: null,
    };
    selects['booking_segments[]'] = { data: [], error: null };
    selects.bookings = { data: { booked_via: null, booked_at: null, confirmation_code: null }, error: null };
    selects.incident_events = { data: [], error: null };
    generatePlaybook.mockResolvedValue({ playbook: { summary: 's' }, model: 'template', citationCheckPassed: true, rulesCited: [] });
  };

  it('saves a playbook the group can see, and marks the incident ready', async () => {
    assessmentRows();
    expect(await savePlaybook('inc')).toEqual({ playbookId: 'pb-new', held: false });
    expect(writes('playbooks', 'insert')[0]).toMatchObject({ incident_id: 'inc', held_for_review: false, citation_check_passed: true, model: 'template' });
    expect(writes('incidents', 'update')).toEqual([{ status: 'playbook_ready' }]);
    expect(writes('incident_events', 'insert')[0]).toMatchObject({ kind: 'playbook_generated', detail: { held: false } });
  });

  it('saves a hand-run trip’s playbook held, and does not mark the incident ready', async () => {
    assessmentRows();
    (selects.incidents.data as { trips: { hand_run: boolean } }).trips.hand_run = true;
    expect(await savePlaybook('inc')).toEqual({ playbookId: 'pb-new', held: true });
    expect(writes('playbooks', 'insert')[0]).toMatchObject({ held_for_review: true });
    expect(writes('incidents', 'update')).toEqual([]);
  });

  it('reuses the playbook a retried step already saved, instead of generating another', async () => {
    selects.playbooks = { data: { id: 'pb-old', held_for_review: true }, error: null };
    expect(await savePlaybook('inc')).toEqual({ playbookId: 'pb-old', held: true });
    expect(generatePlaybook).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });

  it('hands the generator only verified rules', async () => {
    assessmentRows();
    await savePlaybook('inc');
    const input = generatePlaybook.mock.calls[0][0] as { applying: { status: string }[] };
    expect(input.applying.every((rule) => rule.status === 'verified')).toBe(true);
  });
});

describe('releaseHeldPlaybooks', () => {
  it('shows only the held playbooks and marks an unresolved incident ready', async () => {
    await releaseHeldPlaybooks('inc');
    const [release, ready] = ops;
    expect(release).toMatchObject({ table: 'playbooks', payload: { held_for_review: false } });
    expect(release.filters).toEqual(expect.arrayContaining([['eq', 'incident_id', 'inc'], ['eq', 'held_for_review', true]]));
    expect(ready).toMatchObject({ table: 'incidents', payload: { status: 'playbook_ready' } });
    expect(ready.filters).toEqual(expect.arrayContaining([['neq', 'status', 'resolved']]));
  });
});

describe('notifyAffected', () => {
  const incident = { trip_id: 't1', event_type: 'cancellation', delay_minutes: null, affected_user_ids: ['u1', 'u2'], booking_segments: { carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', departure_local: '2026-11-03T18:15' }, trips: { name: 'Lisbon 2026' } };

  it('alerts the people on the booking, then records that it did', async () => {
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: incident, error: null };
    await notifyAffected('inc');
    expect(queueNotifications).toHaveBeenCalledWith(expect.objectContaining({ userIds: ['u1', 'u2'], tripId: 't1', template: 'incident', urgent: true, relatedEntityId: 'inc' }));
    expect(JSON.stringify(queueNotifications.mock.calls[0][0])).toContain('TP 204 from EWR on Nov 3 was cancelled.');
    expect(writes('incident_events', 'insert')).toEqual([{ incident_id: 'inc', kind: 'notified', detail: { users: 2 } }]);
  });

  it('sends nothing when the incident was already notified', async () => {
    selects.incident_events = { data: [{ detail: {} }], error: null };
    selects.incidents = { data: incident, error: null };
    await notifyAffected('inc');
    expect(queueNotifications).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });
});

describe('unnotifiedIncidentIds', () => {
  it('lists open incidents with no notified event', async () => {
    selects.incidents = {
      data: [
        { id: 'new', incident_events: [{ kind: 'detected' }] },
        { id: 'asked', incident_events: [{ kind: 'detected' }, { kind: 'question_asked' }] },
        { id: 'done', incident_events: [{ kind: 'detected' }, { kind: 'notified' }] },
        { id: 'bare', incident_events: null },
      ],
      error: null,
    };
    expect(await unnotifiedIncidentIds('seg')).toEqual(['new', 'asked', 'bare']);
  });
});
