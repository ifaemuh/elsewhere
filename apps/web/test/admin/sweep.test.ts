import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { message: string } | null };
interface Query { table: string; filters: [string, unknown[]][]; range?: [number, number]; orderedBy?: string; selected?: string }

const queries: Query[] = [];
const rowsFor = new Map<string, unknown[]>();
const start = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));

function client() {
  return {
    from: (table: string) => {
      const query: Query = { table, filters: [] };
      const q: Record<string, unknown> = {};
      for (const op of ['eq', 'neq', 'lt', 'gte', 'is']) q[op] = (...args: unknown[]) => (query.filters.push([op, args]), q);
      q.select = (columns: string) => ((query.selected = columns), q);
      q.order = (column: string) => ((query.orderedBy = column), q);
      q.range = (from: number, to: number) => {
        query.range = [from, to];
        queries.push(query);
        const all = rowsFor.get(table) ?? [];
        return Promise.resolve<Result>({ data: all.slice(from, to + 1), error: null });
      };
      return q;
    },
  };
}

vi.mock('workflow/api', () => ({ start }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: client }));
vi.mock('@/workflows/incident', () => ({ incidentWorkflow: 'incident' }));
vi.mock('@/workflows/intake', () => ({ intakeWorkflow: 'intake' }));

import { stuckIncidents, stuckMessages, sweepStuckWork } from '@/lib/admin/sweep';

const now = new Date('2026-11-03T12:00:00Z');
const hourAgo = '2026-11-03T11:00:00.000Z';
const incident = (id: string, kinds: string[], over: Record<string, unknown> = {}) => ({ id, trip_id: 't1', event_type: 'delay', status: 'open', detected_at: '2026-11-03T09:00:00Z', incident_events: kinds.map((kind) => ({ kind })), playbooks: [], ...over });

beforeEach(() => {
  queries.length = 0;
  rowsFor.clear();
  start.mockReset().mockResolvedValue(undefined);
});

describe('stuckIncidents', () => {
  it('asks for open incidents detected over an hour ago, and drops the ones the group was told about', async () => {
    rowsFor.set('incidents', [incident('never', ['detected', 'alerted']), incident('told', ['detected', 'notified']), incident('fresh', [])]);
    const found = await stuckIncidents(client() as never, now);
    expect(found.map((i) => i.id)).toEqual(['never', 'fresh']);
    expect(found[0]).not.toHaveProperty('incident_events');
    expect(found[0]).not.toHaveProperty('playbooks');
    expect(queries[0].orderedBy).toBe('id');
    expect(queries[0].filters).toEqual([
      ['neq', ['status', 'resolved']],
      ['lt', ['detected_at', hourAgo]],
    ]);
  });

  it('narrows to one incident for the manual button', async () => {
    await stuckIncidents(client() as never, now, 'i9');
    expect(queries[0].filters).toContainEqual(['eq', ['id', 'i9']]);
  });

  it('can limit itself to the last 14 days, as the cron does', async () => {
    await stuckIncidents(client() as never, now, undefined, { sinceDays: 14 });
    expect(queries[0].filters).toContainEqual(['gte', ['detected_at', '2026-10-20T12:00:00.000Z']]);
  });

  it('can leave out incidents that are waiting rather than stuck: needs_answer, or a held playbook', async () => {
    rowsFor.set('incidents', [incident('stuck', []), incident('held', [], { playbooks: [{ held_for_review: false }, { held_for_review: true }] }), incident('released', [], { playbooks: [{ held_for_review: false }] })]);
    const found = await stuckIncidents(client() as never, now, undefined, { excludeWaiting: true });
    expect(found.map((i) => i.id)).toEqual(['stuck', 'released']);
    expect(queries[0].filters).toContainEqual(['neq', ['status', 'needs_answer']]);
    // Without the option the same rows all come back.
    queries.length = 0;
    expect(await stuckIncidents(client() as never, now)).toHaveLength(3);
    expect(queries[0].filters).not.toContainEqual(['neq', ['status', 'needs_answer']]);
  });

  it('pages past 1,000 rows', async () => {
    rowsFor.set('incidents', Array.from({ length: 1500 }, (_, i) => incident(`i${i}`, [])));
    expect(await stuckIncidents(client() as never, now)).toHaveLength(1500);
    expect(queries.map((q) => q.range)).toEqual([[0, 999], [1000, 1999]]);
  });
});

describe('stuckMessages', () => {
  it('asks for received, never-claimed mail older than an hour', async () => {
    rowsFor.set('inbound_messages', [{ id: 'm1' }]);
    expect(await stuckMessages(client() as never, now)).toEqual([{ id: 'm1' }]);
    expect(queries[0].orderedBy).toBe('id');
    expect(queries[0].filters).toEqual([
      ['eq', ['status', 'received']],
      ['is', ['claimed_by', null]],
      ['lt', ['received_at', hourAgo]],
    ]);
  });

  it('narrows to one message for the manual button', async () => {
    await stuckMessages(client() as never, now, 'm9');
    expect(queries[0].filters).toContainEqual(['eq', ['id', 'm9']]);
  });
});

describe('sweepStuckWork', () => {
  const none = { started: 0, failed: [], skipped: 0 };

  it('starts the incident and intake runs it finds, from the last 14 days only', async () => {
    rowsFor.set('incidents', [incident('i1', []), incident('i2', [])]);
    rowsFor.set('inbound_messages', [{ id: 'm1', received_at: '2026-11-03T08:00:00Z' }]);
    const result = await sweepStuckWork(now);
    expect(result).toEqual({ incidents: { started: 2, failed: [], skipped: 0 }, messages: { started: 1, failed: [], skipped: 0 } });
    expect(start.mock.calls).toEqual([['incident', ['i1']], ['incident', ['i2']], ['intake', ['m1']]]);
    expect(queries.find((q) => q.table === 'incidents')!.filters).toContainEqual(['gte', ['detected_at', '2026-10-20T12:00:00.000Z']]);
  });

  it('starts at most 25 of each kind, oldest first, and reports the rest as skipped', async () => {
    rowsFor.set(
      'incidents',
      Array.from({ length: 30 }, (_, i) => incident(`i${String(i).padStart(2, '0')}`, [], { detected_at: `2026-11-02T${String(23 - (i % 24)).padStart(2, '0')}:00:00Z` })),
    );
    rowsFor.set('inbound_messages', Array.from({ length: 27 }, (_, i) => ({ id: `m${i}`, received_at: `2026-11-03T0${i % 9}:00:00Z` })));
    const result = await sweepStuckWork(now);
    expect(result.incidents).toEqual({ started: 25, failed: [], skipped: 5 });
    expect(result.messages).toEqual({ started: 25, failed: [], skipped: 2 });
    const incidentStarts = start.mock.calls.filter((c) => c[0] === 'incident').map((c) => (c[1] as string[])[0]);
    const detected = (id: string) => (rowsFor.get('incidents') as { id: string; detected_at: string }[]).find((r) => r.id === id)!.detected_at;
    expect([...incidentStarts].map(detected)).toEqual([...incidentStarts].map(detected).sort());
    const skippedIds = (rowsFor.get('incidents') as { id: string }[]).map((r) => r.id).filter((id) => !incidentStarts.includes(id));
    const newestStarted = detected(incidentStarts.at(-1)!);
    for (const id of skippedIds) expect(detected(id) >= newestStarted).toBe(true);
  });

  it('isolates failures: one start that throws does not stop the rest', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rowsFor.set('incidents', [incident('i1', []), incident('i2', [])]);
    rowsFor.set('inbound_messages', [{ id: 'm1', received_at: '2026-11-03T08:00:00Z' }, { id: 'm2', received_at: '2026-11-03T09:00:00Z' }]);
    start.mockImplementation(async (_workflow, args) => {
      if ((args as string[])[0] === 'i1' || (args as string[])[0] === 'm1') throw new Error('queue down');
    });
    const result = await sweepStuckWork(now);
    expect(result).toEqual({ incidents: { started: 1, failed: ['i1'], skipped: 0 }, messages: { started: 1, failed: ['m1'], skipped: 0 } });
    expect(start).toHaveBeenCalledTimes(4);
    error.mockRestore();
  });

  it('does nothing when nothing is stuck', async () => {
    expect(await sweepStuckWork(now)).toEqual({ incidents: none, messages: none });
    expect(start).not.toHaveBeenCalled();
  });
});
