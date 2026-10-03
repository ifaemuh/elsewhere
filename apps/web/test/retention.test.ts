import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data?: unknown; error?: { message: string } | null };
interface Op { table: string; op: string; payload?: unknown; filters: [string, unknown][]; range?: [number, number] }

const ops: Op[] = [];
const tables = new Map<string, unknown[]>();
const failures = new Map<string, string>();
const listed: string[] = [];
const removeInbound = vi.hoisted(() => vi.fn(async (_paths: string[]) => undefined));

function client() {
  return {
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
        order: () => q,
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
  it('deletes documents 30 days after the member’s last trip, unless kept', () => {
    const plan = retentionPlan({
      now,
      trips: [
        { id: 'old', end_date: '2026-12-01' },
        { id: 'future', end_date: '2027-03-01' },
      ],
      members: [
        { trip_id: 'old', user_id: 'gone' },
        { trip_id: 'old', user_id: 'keeper' },
        { trip_id: 'old', user_id: 'traveling-again' },
        { trip_id: 'future', user_id: 'traveling-again' },
      ],
      documents: [
        { user_id: 'gone', keep_on_profile: false },
        { user_id: 'keeper', keep_on_profile: true },
        { user_id: 'traveling-again', keep_on_profile: false },
      ],
      inbound: [],
    });
    expect(plan.deleteDocumentsFor).toEqual(['gone']);
  });

  it('purges raw inbound after 30 days and bookings a year after the trip', () => {
    const plan = retentionPlan({
      now,
      trips: [
        { id: 'ancient', end_date: '2025-12-31' },
        { id: 'recent', end_date: '2026-12-31' },
      ],
      members: [],
      documents: [],
      inbound: [
        { id: 'm1', storage_path: 't/m1/email.json', received_at: '2026-12-15T00:00:00Z' },
        { id: 'm2', storage_path: 't/m2/email.json', received_at: '2027-01-20T00:00:00Z' },
        { id: 'm3', storage_path: null, received_at: '2026-11-01T00:00:00Z' },
      ],
    });
    expect(plan.purgeInbound).toEqual([{ id: 'm1', storage_path: 't/m1/email.json' }]);
    expect(plan.deleteBookingsForTrips).toEqual(['ancient']);
  });

  it('never deletes for a trip with no end date, or documents of a user on no trip', () => {
    const plan = retentionPlan({
      now,
      trips: [{ id: 'open', end_date: null }],
      members: [{ trip_id: 'open', user_id: 'u1' }],
      documents: [
        { user_id: 'u1', keep_on_profile: false },
        { user_id: 'nobody', keep_on_profile: false },
      ],
      inbound: [],
    });
    expect(plan).toEqual({ deleteDocumentsFor: [], purgeInbound: [], deleteBookingsForTrips: [] });
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
    listed.length = 0;
    tables.clear();
    failures.clear();
    removeInbound.mockClear();
    tables.set('trips', [
      { id: 'old', end_date: '2026-12-01' },
      { id: 'ancient', end_date: '2025-12-31' },
    ]);
    tables.set('trip_members', [
      { trip_id: 'old', user_id: 'gone' },
      { trip_id: 'old', user_id: 'keeper' },
    ]);
    tables.set('member_documents', [
      { user_id: 'gone', keep_on_profile: false },
      { user_id: 'keeper', keep_on_profile: true },
    ]);
    tables.set('inbound_messages', [{ id: 'm1', storage_path: 't/m1/email.json', received_at: '2026-12-15T00:00:00Z' }]);
  });

  it('deletes by the plan: documents not kept, the whole email folder then its path, old bookings', async () => {
    const plan = await runRetention(now);
    expect(plan.deleteDocumentsFor).toEqual(['gone']);
    const deleted = ops.find((o) => o.table === 'member_documents' && o.op === 'delete')!;
    expect(deleted.filters).toEqual([['user_id', ['gone']], ['keep_on_profile', false]]);
    expect(removeInbound).toHaveBeenCalledWith(['t/m1/email.json', 't/m1/0-ticket.pdf']);
    expect(ops.find((o) => o.table === 'inbound_messages' && o.op === 'update')).toMatchObject({ payload: { storage_path: null }, filters: [['id', 'm1']] });
    expect(ops.find((o) => o.table === 'bookings' && o.op === 'delete')?.filters).toEqual([['trip_id', ['ancient']]]);
  });

  it('reads every 1,000-row page of each table before planning', async () => {
    tables.set('trips', Array.from({ length: 2500 }, (_, i) => ({ id: `t${i}`, end_date: '2027-06-01' })));
    await runRetention(now);
    expect(ops.filter((o) => o.table === 'trips').map((o) => o.range)).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('deletes nothing when a table cannot be read completely', async () => {
    failures.set('trip_members.select', 'timeout');
    await expect(runRetention(now)).rejects.toThrow('timeout');
    expect(ops.filter((o) => o.op !== 'select')).toEqual([]);
    expect(removeInbound).not.toHaveBeenCalled();
  });

  it('checks every delete: reports a failed one, yet still runs the other parts', async () => {
    failures.set('member_documents.delete', 'rls says no');
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
