import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: { message: string } | null };
interface Op { table: string; op: string; payload?: unknown; filters: [string, unknown][]; range?: [number, number]; orderedBy?: string }
const rpcs: { name: string; args: unknown }[] = [];
let rpcResult: { data: unknown; error: { message: string } | null } = { data: 0, error: null };

const ops: Op[] = [];
const tables = new Map<string, unknown[]>();
const failures = new Map<string, string>();
const listed: string[] = [];
const removeInbound = vi.hoisted(() => vi.fn(async (_paths: string[]) => undefined));

function client() {
  return {
    rpc: async (name: string, args: unknown) => (rpcs.push({ name, args }), rpcResult),
    storage: {
      from: () => ({
        list: async (prefix: string) => {
          listed.push(prefix);
          return { data: [{ name: 'email.json' }, { name: '0-ticket.pdf' }], error: null };
        },
      }),
    },
    from: (table: string) => {
      const op: Op = { table, op: 'select', filters: [] };
      const run = (): Result => {
        ops.push(op);
        const failure = failures.get(`${table}.${op.op}`);
        if (failure) return { data: null, error: { message: failure } };
        if (op.op !== 'select') return { error: null };
        const rows = tables.get(table) ?? [];
        return { data: op.range ? rows.slice(op.range[0], op.range[1] + 1) : rows, error: null };
      };
      const q: Record<string, unknown> = {
        select: () => q,
        not: () => q,
        order: (column: string) => ((op.orderedBy = column), q),
        range: (from: number, to: number) => ((op.range = [from, to]), q),
        update: (p: unknown) => ((op.op = 'update'), (op.payload = p), q),
        delete: () => ((op.op = 'delete'), q),
        in: (k: string, v: unknown) => (op.filters.push([k, v]), q),
        eq: (k: string, v: unknown) => (op.filters.push([k, v]), q),
        then: (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(run()).then(ok, bad),
      };
      return q;
    },
  };
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: client }));
vi.mock('@/lib/intake/storage', () => ({ removeInbound }));

import { inboundObjects, retentionPlan, runRetention, selectAll } from '@/lib/retention';

const now = new Date('2027-01-31T00:00:00Z');

describe('retentionPlan', () => {
  it('purges raw inbound after 30 days', () => {
    const plan = retentionPlan({
      now,
      trips: [],
      inbound: [
        { id: 'm1', storage_path: 't/m1/email.json', received_at: '2026-12-15T00:00:00Z' },
        { id: 'm2', storage_path: 't/m2/email.json', received_at: '2027-01-20T00:00:00Z' },
        { id: 'm3', storage_path: null, received_at: '2026-11-01T00:00:00Z' },
      ],
    });
    expect(plan.purgeInbound).toEqual([{ id: 'm1', storage_path: 't/m1/email.json' }]);
  });

  it('deletes bookings one calendar year after the trip’s end, else its start; a trip with neither date is never purged', () => {
    const plan = retentionPlan({
      now: new Date('2027-03-01T00:00:00Z'),
      trips: [
        { id: 'ancient', start_date: '2025-12-20', end_date: '2025-12-31' },
        { id: 'just-over', start_date: '2026-02-20', end_date: '2026-02-28' },
        { id: 'not-yet', start_date: '2026-03-01', end_date: '2026-03-02' },
        { id: 'start-only-old', start_date: '2025-06-01', end_date: null },
        { id: 'start-only-recent', start_date: '2026-09-01', end_date: null },
        { id: 'undated', start_date: null, end_date: null },
      ],
      inbound: [],
    });
    expect(plan.deleteBookingsForTrips).toEqual(['ancient', 'just-over', 'start-only-old']);
  });

  it('uses calendar years, not 365 days, across a leap year', () => {
    // 2028-02-29 + 1 year is 2029-03-01 (Feb 29 rolls over); 365 days later would be 2029-02-28.
    const trips = [{ id: 'leap', start_date: '2028-02-20', end_date: '2028-02-29' }];
    expect(retentionPlan({ now: new Date('2029-02-28T23:59:59Z'), trips, inbound: [] }).deleteBookingsForTrips).toEqual([]);
    expect(retentionPlan({ now: new Date('2029-03-02T00:00:00Z'), trips, inbound: [] }).deleteBookingsForTrips).toEqual(['leap']);
  });
});

describe('inboundObjects', () => {
  beforeEach(() => (listed.length = 0));

  it('removes an email folder whole, but a screenshot alone', async () => {
    const admin = {
      storage: {
        from: () => ({
          list: async (prefix: string) => {
            listed.push(prefix);
            return { data: [{ name: 'email.json' }, { name: '0-ticket.pdf' }] };
          },
        }),
      },
    };
    expect(await inboundObjects(admin, 't/m1/email.json')).toEqual(['t/m1/email.json', 't/m1/0-ticket.pdf']);
    expect(await inboundObjects(admin, 't/screenshots/abc.png')).toEqual(['t/screenshots/abc.png']);
    expect(listed).toEqual(['t/m1']);
  });

  it('throws when the listing fails, so the attachments are not forgotten', async () => {
    const admin = { storage: { from: () => ({ list: async () => ({ data: null, error: { message: 'storage down' } }) }) } };
    await expect(inboundObjects(admin, 't/m1/email.json')).rejects.toThrow('storage down');
  });
});

describe('selectAll', () => {
  it('reads past the 1,000-row page that PostgREST returns', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
    const pages: [number, number][] = [];
    const all = await selectAll(async (from, to) => {
      pages.push([from, to]);
      return { data: rows.slice(from, to + 1), error: null };
    });
    expect(all).toHaveLength(2500);
    expect(pages).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('asks for one more page when the rows fill a page exactly, then stops on the empty one', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    const pages: number[] = [];
    const all = await selectAll(async (from, to) => (pages.push(from), { data: rows.slice(from, to + 1), error: null }));
    expect(all).toHaveLength(1000);
    expect(pages).toEqual([0, 1000]);
  });

  it('throws on an error instead of acting on a partial list', async () => {
    await expect(selectAll(async () => ({ data: null, error: { message: 'timeout' } }))).rejects.toThrow('timeout');
  });

  it('throws on an error on a later page', async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ id: i }));
    await expect(selectAll(async (from) => (from === 0 ? { data: rows, error: null } : { data: null, error: { message: 'page 2 failed' } }))).rejects.toThrow('page 2 failed');
  });
});

describe('runRetention', () => {
  beforeEach(() => {
    ops.length = 0;
    rpcs.length = 0;
    listed.length = 0;
    tables.clear();
    failures.clear();
    rpcResult = { data: 3, error: null };
    removeInbound.mockClear();
    tables.set('trips', [
      { id: 'old', start_date: '2026-11-20', end_date: '2026-12-01' },
      { id: 'ancient', start_date: '2025-12-20', end_date: '2025-12-31' },
    ]);
    tables.set('inbound_messages', [{ id: 'm1', storage_path: 't/m1/email.json', received_at: '2026-12-15T00:00:00Z' }]);
  });

  it('purges documents with the SQL function, and reports how many', async () => {
    const result = await runRetention(now);
    expect(rpcs).toEqual([{ name: 'purge_member_documents', args: { p_now: now.toISOString() } }]);
    expect(result.documentsDeleted).toBe(3);
    // Documents are no longer read into memory: no trip_members or member_documents queries.
    expect(ops.some((o) => o.table === 'member_documents' || o.table === 'trip_members')).toBe(false);
  });

  it('removes the whole email folder, then forgets its path, then deletes old bookings', async () => {
    const result = await runRetention(now);
    expect(result.purgeInbound).toEqual([{ id: 'm1', storage_path: 't/m1/email.json' }]);
    expect(removeInbound).toHaveBeenCalledWith(['t/m1/email.json', 't/m1/0-ticket.pdf']);
    expect(ops.find((o) => o.table === 'inbound_messages' && o.op === 'update')).toMatchObject({ payload: { storage_path: null }, filters: [['id', 'm1']] });
    expect(ops.find((o) => o.table === 'bookings' && o.op === 'delete')?.filters).toEqual([['trip_id', ['ancient']]]);
  });

  it('pages every table in a stable order, 1,000 rows at a time', async () => {
    tables.set('trips', Array.from({ length: 2500 }, (_, i) => ({ id: `t${i}`, start_date: '2027-06-01', end_date: '2027-06-08' })));
    await runRetention(now);
    const reads = ops.filter((o) => o.op === 'select');
    expect(reads.filter((o) => o.table === 'trips').map((o) => o.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(reads.length).toBeGreaterThan(0);
    for (const read of reads) expect(read.orderedBy).toBe('id');
  });

  it('deletes bookings in batches of 100 trips and checks every batch', async () => {
    tables.set('trips', Array.from({ length: 250 }, (_, i) => ({ id: `t${i}`, start_date: '2020-01-01', end_date: '2020-01-08' })));
    await runRetention(now);
    const batches = ops.filter((o) => o.table === 'bookings' && o.op === 'delete').map((o) => (o.filters[0][1] as string[]).length);
    expect(batches).toEqual([100, 100, 50]);
  });

  it('keeps going after a failed batch and reports it', async () => {
    tables.set('trips', Array.from({ length: 150 }, (_, i) => ({ id: `t${i}`, start_date: '2020-01-01', end_date: '2020-01-08' })));
    failures.set('bookings.delete', 'fk');
    await expect(runRetention(now)).rejects.toThrow(/bookings: fk.*bookings: fk/);
    expect(ops.filter((o) => o.table === 'bookings' && o.op === 'delete')).toHaveLength(2);
  });

  it('deletes nothing when a table cannot be read completely', async () => {
    failures.set('trips.select', 'timeout');
    await expect(runRetention(now)).rejects.toThrow('timeout');
    expect(ops.filter((o) => o.op !== 'select')).toEqual([]);
    expect(rpcs).toEqual([]);
    expect(removeInbound).not.toHaveBeenCalled();
  });

  it('checks the document purge: a failed function is reported, yet the other parts still run', async () => {
    rpcResult = { data: null, error: { message: 'rls says no' } };
    await expect(runRetention(now)).rejects.toThrow(/documents: rls says no/);
    expect(removeInbound).toHaveBeenCalled();
    expect(ops.some((o) => o.table === 'bookings' && o.op === 'delete')).toBe(true);
  });

  it('keeps the storage path when removing the objects fails, so tomorrow retries it', async () => {
    removeInbound.mockRejectedValueOnce(new Error('inbound delete failed: boom'));
    await expect(runRetention(now)).rejects.toThrow(/inbound m1: inbound delete failed: boom/);
    expect(ops.some((o) => o.table === 'inbound_messages' && o.op === 'update')).toBe(false);
  });

  it('reports a failed path update and a failed booking delete', async () => {
    failures.set('inbound_messages.update', 'locked');
    failures.set('bookings.delete', 'fk');
    await expect(runRetention(now)).rejects.toThrow(/inbound m1: locked.*bookings: fk/);
  });
});
