import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { message: string } | null };
interface Query { table: string; filters: [string, unknown[]][]; range?: [number, number] }

const queries: Query[] = [];
const rowsFor = new Map<string, unknown[]>();
const start = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => undefined));

function client() {
  return {
    from: (table: string) => {
      const query: Query = { table, filters: [] };
      const q: Record<string, unknown> = {};
      for (const op of ['eq', 'neq', 'lt', 'is']) q[op] = (...args: unknown[]) => (query.filters.push([op, args]), q);
      q.select = () => q;
      q.order = () => q;
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
const incident = (id: string, kinds: string[]) => ({ id, trip_id: 't1', event_type: 'delay', status: 'open', detected_at: '2026-11-03T09:00:00Z', incident_events: kinds.map((kind) => ({ kind })) });

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
    expect(queries[0].filters).toEqual([
      ['neq', ['status', 'resolved']],
      ['lt', ['detected_at', hourAgo]],
    ]);
  });

  it('narrows to one incident for the manual button', async () => {
    await stuckIncidents(client() as never, now, 'i9');
    expect(queries[0].filters).toContainEqual(['eq', ['id', 'i9']]);
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
  it('starts the incident and intake runs it finds', async () => {
    rowsFor.set('incidents', [incident('i1', []), incident('i2', [])]);
    rowsFor.set('inbound_messages', [{ id: 'm1' }]);
    const result = await sweepStuckWork(now);
    expect(result).toEqual({ incidents: { started: 2, failed: [] }, messages: { started: 1, failed: [] } });
    expect(start.mock.calls).toEqual([['incident', ['i1']], ['incident', ['i2']], ['intake', ['m1']]]);
  });

  it('isolates failures: one start that throws does not stop the rest', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    rowsFor.set('incidents', [incident('i1', []), incident('i2', [])]);
    rowsFor.set('inbound_messages', [{ id: 'm1' }, { id: 'm2' }]);
    start.mockImplementation(async (_workflow, args) => {
      if ((args as string[])[0] === 'i1' || (args as string[])[0] === 'm1') throw new Error('queue down');
    });
    const result = await sweepStuckWork(now);
    expect(result).toEqual({ incidents: { started: 1, failed: ['i1'] }, messages: { started: 1, failed: ['m1'] } });
    expect(start).toHaveBeenCalledTimes(4);
    error.mockRestore();
  });

  it('does nothing when nothing is stuck', async () => {
    expect(await sweepStuckWork(now)).toEqual({ incidents: { started: 0, failed: [] }, messages: { started: 0, failed: [] } });
    expect(start).not.toHaveBeenCalled();
  });
});
