import { beforeEach, describe, expect, it, vi } from 'vitest';

type Err = { code?: string; message: string } | null;
const TRIP = '11111111-1111-4111-8111-111111111111';
const KEY = '99999999-9999-4999-8999-999999999999';
const PAT = '00000000-0000-4000-8000-00000000000a';
const SAM = '00000000-0000-4000-8000-00000000000b';
const JO = '00000000-0000-4000-8000-00000000000c';
const STRANGER = '00000000-0000-4000-8000-0000000000ff';

const state = {
  userId: PAT,
  isMember: true,
  isPlanner: false,
  members: [PAT, SAM, JO],
  expenses: [] as unknown[],
  settlements: [] as unknown[],
  insertError: null as Err,
  settleError: null as Err,
  settleResult: 'recorded',
};
const log: { table: string; row: Record<string, unknown> }[] = [];
const rpc = vi.fn(async (name: string, _args?: unknown) => {
  if (name === 'record_settlement') return { data: state.settleError ? null : state.settleResult, error: state.settleError };
  return { data: name === 'is_trip_member' ? state.isMember : name === 'is_trip_planner' ? state.isPlanner : null, error: null };
});

function table(name: string) {
  let inserted = false;
  const q: Record<string, unknown> = {};
  const resolve = () => {
    if (inserted) return { data: null, error: state.insertError };
    if (name === 'trip_members') return { data: state.members.map((user_id) => ({ user_id })), error: null };
    if (name === 'expenses') return { data: state.expenses, error: null };
    if (name === 'settlements') return { data: state.settlements, error: null };
    return { data: null, error: null };
  };
  q.select = () => q;
  q.eq = () => q;
  q.insert = (row: Record<string, unknown>) => {
    inserted = true;
    log.push({ table: name, row });
    return q;
  };
  q.then = (ok: (r: unknown) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve()).then(ok, bad);
  return q;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc, from: table }) }));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: state.userId }) }));
const revalidatePath = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath }));

import { addExpense, markSettled } from '@/app/trips/[id]/money/actions';

function form(values: Record<string, string | string[]> = {}) {
  const data = new FormData();
  const all = { key: KEY, description: 'Airport hotel', amount: '$186.40', splitWith: [PAT, SAM, JO], ...values };
  for (const [k, v] of Object.entries(all)) for (const item of Array.isArray(v) ? v : [v]) data.append(k, item);
  return data;
}
const add = (f = form()) => addExpense(TRIP, { error: null }, f);
const wrote = (t: string) => log.filter((l) => l.table === t);

// Pat paid 300.00 for three, so Sam and Jo each owe Pat 100.00.
const PAT_PAID = { payer_user_id: PAT, amount_cents: 30000, split: { kind: 'equal', user_ids: [PAT, SAM, JO] } };

beforeEach(() => {
  log.length = 0;
  rpc.mockClear();
  revalidatePath.mockClear();
  Object.assign(state, { userId: PAT, isMember: true, isPlanner: false, members: [PAT, SAM, JO], expenses: [PAT_PAID], settlements: [], insertError: null, settleError: null, settleResult: 'recorded' });
});

describe('addExpense', () => {
  it('records the caller as payer, in integer cents, with an equal split and the form key', async () => {
    expect(await add()).toEqual({ error: null });
    expect(wrote('expenses')).toEqual([
      { table: 'expenses', row: { trip_id: TRIP, payer_user_id: PAT, amount_cents: 18640, description: 'Airport hotel', split: { kind: 'equal', user_ids: [PAT, SAM, JO] }, created_by: PAT, client_key: KEY } },
    ]);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('ignores a payer the form tries to name', async () => {
    await add(form({ payer_user_id: SAM, payer: SAM }));
    expect(wrote('expenses')[0].row.payer_user_id).toBe(PAT);
  });

  it('refuses a non-member before reading or writing anything else', async () => {
    state.isMember = false;
    expect((await add()).error).toMatch(/Only people on this trip/);
    expect(log).toHaveLength(0);
  });

  it('refuses a caller who is not in the member list even if the membership check passed', async () => {
    state.members = [SAM, JO];
    expect((await add()).error).toMatch(/Only people on this trip/);
    expect(log).toHaveLength(0);
  });

  it('refuses a split that includes a stranger, or someone from another trip', async () => {
    expect((await add(form({ splitWith: [PAT, STRANGER] }))).error).toMatch(/must be on this trip/);
    expect(log).toHaveLength(0);
  });

  it.each(['', '0', '-20', '0.00', '1e3', 'abc', '100000.01', '1.999', 'NaN'])('rejects the amount %j', async (amount) => {
    expect((await add(form({ amount }))).error).toBeTruthy();
    expect(log).toHaveLength(0);
  });

  it('rejects a missing description, an overlong one, an empty split and a bad key', async () => {
    expect((await add(form({ description: '  ' }))).error).toBeTruthy();
    expect((await add(form({ description: 'x'.repeat(201) }))).error).toBeTruthy();
    expect((await add(form({ splitWith: [] }))).error).toMatch(/who shares/);
    expect((await add(form({ key: 'not-a-uuid' }))).error).toMatch(/Reload/);
    expect(log).toHaveLength(0);
  });

  it('counts a repeated person once', async () => {
    await add(form({ splitWith: [PAT, PAT, SAM] }));
    expect(wrote('expenses')[0].row.split).toEqual({ kind: 'equal', user_ids: [PAT, SAM] });
  });

  it('takes exact amounts only when they add up to the total', async () => {
    const exact = (a: string, b: string) => form({ amount: '$100.00', splitWith: [], [`share:${PAT}`]: a, [`share:${SAM}`]: b });
    expect(await add(exact('$70.00', '$30.00'))).toEqual({ error: null });
    expect(wrote('expenses')[0].row.split).toEqual({ kind: 'shares', shares: { [PAT]: 7000, [SAM]: 3000 } });
    log.length = 0;
    expect((await add(exact('$70.00', '$29.99'))).error).toMatch(/add up/);
    expect((await add(exact('$70.00', '$30.01'))).error).toMatch(/add up/);
    expect((await add(form({ amount: '$100.00', [`share:${STRANGER}`]: '$100.00' }))).error).toMatch(/exact amount/);
    expect((await add(exact('-$70.00', '$170.00'))).error).toMatch(/exact amount/);
    expect(log).toHaveLength(0);
  });

  it('treats a double submit (unique violation on the key) as the first one succeeding, without an error', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value violates unique constraint' };
    expect(await add()).toEqual({ error: null });
  });

  it('reports any other database failure', async () => {
    state.insertError = { code: '23514', message: 'split includes someone who is not on this trip' };
    expect((await add()).error).toMatch(/could not add/);
  });
});

describe('markSettled', () => {
  const settle = (from = SAM, to = PAT, cents = 10000, key = KEY) => markSettled(TRIP, from, to, cents, key, { error: null });
  const STALE = "Already settled, or the amounts changed. We've refreshed the totals.";

  it('calls record_settlement with exactly the arguments, and writes nothing directly', async () => {
    state.userId = SAM;
    expect(await settle()).toEqual({ error: null });
    expect(rpc).toHaveBeenCalledWith('record_settlement', { p_trip_id: TRIP, p_from: SAM, p_to: PAT, p_amount_cents: 10000, p_client_key: KEY });
    expect(log).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('refuses a non-member before calling the function', async () => {
    state.isMember = false;
    expect((await settle()).error).toMatch(/people on this trip/);
    expect(rpc).not.toHaveBeenCalledWith('record_settlement', expect.anything());
  });

  it.each([0, -100, 1.5, NaN, Infinity, 10_000_001])('refuses the amount %s without calling the function', async (cents) => {
    expect((await settle(SAM, PAT, cents)).error).toBeTruthy();
    expect(rpc).not.toHaveBeenCalledWith('record_settlement', expect.anything());
  });

  it('refuses the same person on both sides and a bad key', async () => {
    expect((await settle(PAT, PAT)).error).toMatch(/two different/);
    expect((await settle(SAM, PAT, 100, 'nope')).error).toMatch(/Reload/);
    expect(rpc).not.toHaveBeenCalledWith('record_settlement', expect.anything());
  });

  it('tells the user, and refreshes, when the debt is gone or the amount changed', async () => {
    state.settleError = { code: '22023', message: 'more than is owed' };
    expect(await settle()).toEqual({ error: STALE });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it('maps a refusal from the function to a clear message', async () => {
    state.settleError = { code: '42501', message: 'only the two people involved, or the planner, can mark this paid' };
    expect((await settle()).error).toMatch(/two people involved, or the planner/);
  });

  it('treats a double click as one payment, with no error', async () => {
    state.settleResult = 'duplicate';
    expect(await settle()).toEqual({ error: null });
  });

  it('reports other database failures', async () => {
    state.settleError = { code: 'XX000', message: 'boom' };
    expect((await settle()).error).toMatch(/could not mark/);
  });
});
