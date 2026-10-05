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
/** Tables whose next insert fails once. */
const failInsert = new Set<string>();

function from(table: string) {
  const filters: unknown[][] = [];
  const q: Record<string, unknown> = {};
  const result = (): Result => selects[table] ?? { data: null, error: null };
  // A query awaited as a list reads `table[]`, so one table can serve a single row and a list.
  const list = (): Result => {
    const found = selects[`${table}[]`] ?? result();
    // Honour `gt` filters on rows that carry the column, as the database would.
    const gts = filters.filter((f) => f[0] === 'gt');
    if (!Array.isArray(found.data) || gts.length === 0) return found;
    return { ...found, data: found.data.filter((row: Record<string, unknown>) => gts.every(([, column, value]) => row[column as string] === undefined || String(row[column as string]) > String(value))) };
  };
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
    gt: chain('gt'),
    order: chain('order'),
    limit: chain('limit'),
    insert: (payload: Record<string, unknown>) => {
      const failed = failInsert.delete(table);
      if (!failed) ops.push({ table, op: 'insert', payload, filters });
      const outcome: Result = failed ? { data: null, error: { message: `${table} insert failed` } } : { data: null, error: null };
      return Object.assign(Object.create(q) as object, {
        select: () => ({ single: async () => ({ data: { id: 'pb-new' }, error: null }) }),
        then: (resolve: (v: Result) => void) => resolve(outcome),
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
const flushDue = vi.hoisted(() => vi.fn(async () => 0));
vi.mock('@/lib/notify/queue', () => ({ queueNotifications, flushDue }));
vi.mock('@/lib/flights/aeroapi', () => ({ aeroApi: async () => ({ airport: async () => null }) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));
vi.mock('@/lib/assist/playbook', () => ({ generatePlaybook }));
vi.mock('@/lib/rules/library', () => ({ getLibrary: () => ({ rules: [] }) }));

import { alertAffected, askPlanner, notifyAffected, recordAnswer, releaseHeldPlaybooks, requestReview, savePlaybook, unnotifiedIncidentIds } from '@/lib/assist/incidents';

const question = { fact: 'passenger.accepted_alternative', prompt: 'Did anyone accept?', options: [] };
const members = [
  { user_id: 'u1', role: 'member' },
  { user_id: 'u2', role: 'member' },
  { user_id: 'planner-1', role: 'planner' },
];
const writes = (table: string, op: Op['op']) => ops.filter((o) => o.table === table && o.op === op).map((o) => o.payload);

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test';
  for (const key of Object.keys(selects)) delete selects[key];
  selects['trip_members[]'] = { data: members, error: null };
  ops.length = 0;
  failInsert.clear();
  queueNotifications.mockReset().mockResolvedValue(undefined);
  flushDue.mockClear();
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

  it('texts the planner once when the event insert fails and the step is retried', async () => {
    const queued: { id: string }[] = [];
    selects.notifications = { data: queued, error: null };
    queueNotifications.mockImplementation(async () => void queued.push({ id: 'n1' }));
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: { trip_id: 't1', trips: { name: 'Lisbon 2026' } }, error: null };
    selects.trip_members = { data: { user_id: 'planner-1' }, error: null };
    failInsert.add('incident_events');
    await expect(askPlanner('inc', question)).rejects.toThrow('incident_events insert failed');
    await askPlanner('inc', question);
    expect(queueNotifications).toHaveBeenCalledTimes(1);
    expect(flushDue).toHaveBeenCalledTimes(1);
    expect(writes('incident_events', 'insert')).toHaveLength(1);
  });

  it('asks a different question after an earlier one was texted, even though its row exists', async () => {
    const other = { fact: 'event.cause', prompt: 'Did the airline say why?', options: [] };
    // Fact A was texted at 10:00 and its event written; the run failed; the restarted run asks fact B.
    selects.notifications = { data: [{ id: 'nA', created_at: '2026-11-01T10:00:00Z' }], error: null };
    selects.incident_events = { data: [{ created_at: '2026-11-01T10:00:01Z', detail: { fact: question.fact } }], error: null };
    selects.incidents = { data: { trip_id: 't1', trips: { name: 'Lisbon 2026' } }, error: null };
    selects.trip_members = { data: { user_id: 'planner-1' }, error: null };
    await askPlanner('inc', other);
    expect(queueNotifications).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(queueNotifications.mock.calls[0][0])).toContain('Did the airline say why?');
    expect(writes('incident_events', 'insert')).toEqual([{ incident_id: 'inc', kind: 'question_asked', detail: { fact: 'event.cause' } }]);
  });

  it('counts any queued question text when no question was ever recorded', async () => {
    selects.notifications = { data: [{ id: 'n1', created_at: '2026-11-01T10:00:00Z' }], error: null };
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: { trip_id: 't1', trips: { name: 'Lisbon 2026' } }, error: null };
    selects.trip_members = { data: { user_id: 'planner-1' }, error: null };
    await askPlanner('inc', question);
    expect(queueNotifications).not.toHaveBeenCalled();
    expect(flushDue).toHaveBeenCalledTimes(1);
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

  it('drafts a new playbook after a newer answer, and the newer one is the one saved', async () => {
    assessmentRows();
    selects.playbooks = { data: { id: 'pb-old', held_for_review: false, created_at: '2026-11-01T12:00:00Z' }, error: null };
    // An answer arrived after that playbook was drafted.
    selects.incident_events = { data: [{ created_at: '2026-11-01T12:30:00Z', detail: {} }], error: null };
    expect(await savePlaybook('inc')).toEqual({ playbookId: 'pb-new', held: false });
    expect(generatePlaybook).toHaveBeenCalledTimes(1);
    expect(writes('playbooks', 'insert')).toHaveLength(1);
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
    expect(writes('incident_events', 'insert')).toEqual([{ incident_id: 'inc', kind: 'notified', detail: { users: 2, planner_only: false } }]);
  });

  it('sends the alert only once when the event insert fails and the step is retried', async () => {
    const queued: { id: string }[] = [];
    selects.notifications = { data: queued, error: null };
    queueNotifications.mockImplementation(async () => void queued.push({ id: 'n1' }));
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: incident, error: null };
    failInsert.add('incident_events');
    await expect(notifyAffected('inc')).rejects.toThrow('incident_events insert failed');
    expect(flushDue).not.toHaveBeenCalled();
    await notifyAffected('inc');
    expect(queueNotifications).toHaveBeenCalledTimes(1);
    // The retry sends what the crashed attempt left queued, instead of leaving it for the cron.
    expect(flushDue).toHaveBeenCalledTimes(1);
    expect(writes('incident_events', 'insert')).toEqual([{ incident_id: 'inc', kind: 'notified', detail: { users: 2, planner_only: false } }]);
  });

  it('queues the alert exactly once when delivery throws after the rows were queued', async () => {
    const queued: { id: string }[] = [];
    selects.notifications = { data: queued, error: null };
    // queueNotifications inserts the rows, then flushDue throws.
    queueNotifications.mockImplementationOnce(async () => {
      queued.push({ id: 'n1' });
      throw new Error('flush failed');
    });
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: incident, error: null };
    await expect(notifyAffected('inc')).rejects.toThrow('flush failed');
    await notifyAffected('inc');
    expect(queueNotifications).toHaveBeenCalledTimes(1);
    expect(writes('incident_events', 'insert')).toHaveLength(1);
  });

  it('keeps the database error when the incident cannot be read', async () => {
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: null, error: { message: 'connection reset' } };
    await expect(notifyAffected('inc')).rejects.toThrow(/could not be read: connection reset/);
  });

  it('sends nothing when the incident was already notified', async () => {
    selects.incident_events = { data: [{ detail: {} }], error: null };
    selects.incidents = { data: incident, error: null };
    await notifyAffected('inc');
    expect(queueNotifications).not.toHaveBeenCalled();
    expect(ops).toEqual([]);
  });
});

describe('alertAffected (the early heads-up)', () => {
  const incident = (over: Record<string, unknown> = {}) => ({
    trip_id: 't1',
    event_type: 'cancellation',
    delay_minutes: null,
    affected_user_ids: ['u1', 'u2'],
    booking_segments: { carrier_iata: 'TP', flight_number: '204', origin_iata: 'LIS', departure_local: '2026-11-03T18:15' },
    trips: { name: 'Lisbon 2026' },
    ...over,
  });
  const sent = () => queueNotifications.mock.calls.map((c) => c[0] as { userIds: string[]; template: string; rendered: { subject: string; text: string; sms: string }; urgent: boolean });

  it('tells the people on the booking what happened, without claiming anything is owed', async () => {
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: incident(), error: null };
    await alertAffected('inc');
    const [notice] = sent();
    expect(notice).toMatchObject({ userIds: ['u1', 'u2'], template: 'incident_alert', urgent: true });
    expect(notice.rendered.text).toContain('TP 204 from LIS on Nov 3 was cancelled.');
    expect(notice.rendered.text).toContain('https://elsewhere.test/trips/t1/incidents/inc');
    expect(writes('incident_events', 'insert')).toEqual([{ incident_id: 'inc', kind: 'alerted', detail: { users: 2, planner_only: false } }]);
  });

  it('uses factual words for a delay, a diversion and a schedule change', async () => {
    selects.incident_events = { data: [], error: null };
    for (const over of [{ event_type: 'delay', delay_minutes: 200 }, { event_type: 'delay', delay_minutes: null }, { event_type: 'schedule_change' }]) {
      queueNotifications.mockClear();
      selects.incidents = { data: incident(over), error: null };
      await alertAffected('inc');
      const { rendered } = sent()[0];
      expect(`${rendered.subject} ${rendered.text} ${rendered.sms}`).not.toMatch(/owed|will get|compensation|refund|entitled/i);
    }
  });

  it('sends once when the event insert fails and the step is retried, and not at all for a second run', async () => {
    const queued: { id: string }[] = [];
    selects.notifications = { data: queued, error: null };
    queueNotifications.mockImplementation(async () => void queued.push({ id: 'n1' }));
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: incident(), error: null };
    failInsert.add('incident_events');
    await expect(alertAffected('inc')).rejects.toThrow('incident_events insert failed');
    await alertAffected('inc');
    expect(queueNotifications).toHaveBeenCalledTimes(1);
    expect(flushDue).toHaveBeenCalledTimes(1);
    // A second run finds the alerted event.
    selects.incident_events = { data: [{ detail: {} }], error: null };
    await alertAffected('inc');
    expect(queueNotifications).toHaveBeenCalledTimes(1);
  });

  it('goes to the planner, with the link to add who is flying, when nobody is on the booking', async () => {
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: incident({ affected_user_ids: [] }), error: null };
    selects['trip_members[]'] = { data: [{ user_id: 'planner-1', role: 'planner' }], error: null };
    await alertAffected('inc');
    const [notice] = sent();
    expect(notice.userIds).toEqual(['planner-1']);
    expect(notice.rendered.text).toContain("Nobody is on this booking yet. Add who's flying: https://elsewhere.test/trips/t1/bookings");
    expect(writes('incident_events', 'insert')[0]).toMatchObject({ kind: 'alerted', detail: { users: 1, planner_only: true } });
  });

  it('sends the plan-ready notice to the planner too, and never records notified without a recipient', async () => {
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: incident({ affected_user_ids: [] }), error: null };
    selects['trip_members[]'] = { data: [{ user_id: 'planner-1', role: 'planner' }], error: null };
    await notifyAffected('inc');
    const [notice] = sent();
    expect(notice).toMatchObject({ userIds: ['planner-1'], template: 'incident' });
    expect(notice.rendered.text).toContain("Nobody is on this booking yet. Add who's flying: https://elsewhere.test/trips/t1/bookings");

    queueNotifications.mockClear();
    ops.length = 0;
    selects['trip_members[]'] = { data: [], error: null };
    await expect(notifyAffected('inc')).rejects.toThrow(/nobody to notify/);
    expect(queueNotifications).not.toHaveBeenCalled();
    expect(writes('incident_events', 'insert')).toEqual([]);
  });
});

describe('people who left the trip', () => {
  const incident = {
    trip_id: 't1',
    event_type: 'cancellation',
    delay_minutes: null,
    affected_user_ids: ['u1', 'gone'],
    booking_segments: { carrier_iata: 'TP', flight_number: '204', origin_iata: 'LIS', departure_local: '2026-11-03T18:15' },
    trips: { name: 'Lisbon 2026' },
  };
  beforeEach(() => {
    selects.incident_events = { data: [], error: null };
    selects.incidents = { data: incident, error: null };
  });

  it('tells only the assigned people who are still members, in both notices', async () => {
    await alertAffected('inc');
    await notifyAffected('inc');
    expect(queueNotifications.mock.calls.map((c) => (c[0] as { userIds: string[] }).userIds)).toEqual([['u1'], ['u1']]);
  });

  it('falls back to the planner when everyone assigned has left', async () => {
    selects.incidents = { data: { ...incident, affected_user_ids: ['gone', 'gone-too'] }, error: null };
    await alertAffected('inc');
    await notifyAffected('inc');
    for (const call of queueNotifications.mock.calls) {
      const input = call[0] as { userIds: string[]; rendered: { text: string } };
      expect(input.userIds).toEqual(['planner-1']);
      expect(input.rendered.text).toContain('Nobody is on this booking yet');
    }
    expect(queueNotifications).toHaveBeenCalledTimes(2);
  });
});

describe('requestReview', () => {
  beforeEach(() => {
    process.env.ADMIN_EMAILS = 'founder@example.test';
    selects.profiles = { data: [{ id: 'admin-1' }], error: null };
    selects.incidents = { data: { trips: { name: 'Lisbon 2026' } }, error: null };
  });

  it('emails the admins once, across a retry and a second run', async () => {
    const queued: { id: string }[] = [];
    selects.notifications = { data: queued, error: null };
    queueNotifications.mockImplementation(async () => void queued.push({ id: 'n1' }));
    await requestReview('inc');
    await requestReview('inc');
    await requestReview('inc');
    expect(queueNotifications).toHaveBeenCalledTimes(1);
    expect(queueNotifications).toHaveBeenCalledWith(expect.objectContaining({ template: 'review_hold', userIds: ['admin-1'] }));
    expect(flushDue).toHaveBeenCalledTimes(2);
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
