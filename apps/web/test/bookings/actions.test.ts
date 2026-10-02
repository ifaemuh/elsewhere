import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { message: string; code?: string } | null };
type Stored = Result | ((call: { filters: [string, unknown][] }) => Result);
interface Call { client: 'user' | 'admin'; table: string; op: string; payload?: unknown; filters: [string, unknown][] }

const calls: Call[] = [];
const order: string[] = [];
const results = new Map<string, Stored>();
const rpcResults = new Map<string, Result>();
const roles = { member: true, planner: true };
const rpc = vi.fn(async (name: string, _args: Record<string, unknown>): Promise<Result> => {
  if (name === 'is_trip_member') return { data: roles.member, error: null };
  if (name === 'is_trip_planner') return { data: roles.planner, error: null };
  return rpcResults.get(name) ?? { data: null, error: null };
});

function client(who: 'user' | 'admin') {
  return {
    rpc,
    storage: undefined,
    from: (table: string) => {
      const call: Call = { client: who, table, op: 'select', filters: [] };
      const resolve = (single: boolean): Result => {
        calls.push(call);
        order.push(`${who}.${table}.${call.op}${call.payload && (call.payload as { status?: string }).status ? `:${(call.payload as { status: string }).status}` : ''}`);
        const stored = results.get(`${who}.${table}.${call.op}`);
        const r = typeof stored === 'function' ? stored(call) : (stored ?? { data: call.op === 'select' ? [] : null, error: null });
        if (single && Array.isArray(r.data)) return { data: r.data[0] ?? null, error: r.error };
        return r;
      };
      const q: Record<string, unknown> = {
        select: () => q,
        insert: (p: unknown) => ((call.op = 'insert'), (call.payload = p), q),
        update: (p: unknown) => ((call.op = 'update'), (call.payload = p), q),
        delete: () => ((call.op = 'delete'), q),
        eq: (k: string, v: unknown) => (call.filters.push([k, v]), q),
        in: (k: string, v: unknown) => (call.filters.push([k, v]), q),
        neq: (k: string, v: unknown) => (call.filters.push([`!${k}`, v]), q),
        maybeSingle: async () => resolve(true),
        single: async () => resolve(true),
        then: (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(resolve(false)).then(ok, bad),
      };
      return q;
    },
  };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client('user') }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => client('admin') }));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: 'user-1', email: 'pat@example.test' }) }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));
const putInbound = vi.hoisted(() => vi.fn(async (p: string) => p));
vi.mock('@/lib/intake/storage', () => ({ putInbound }));
const start = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('workflow/api', () => ({ start }));
vi.mock('@/workflows/intake', () => ({ intakeWorkflow: 'intake' }));
vi.mock('@/workflows/confirm-bookings', () => ({ confirmBookingsWorkflow: 'confirm' }));

import { addManualFlight, confirmBooking, correctFlight, toggleAssignment, uploadScreenshot } from '@/app/trips/[id]/bookings/actions';

const TRIP = '11111111-1111-1111-1111-111111111111';
const BOOKING = '22222222-2222-2222-2222-222222222222';
const SEGMENT = '33333333-3333-3333-3333-333333333333';
const ME = '44444444-4444-4444-4444-444444444444';
const OTHER = '55555555-5555-5555-5555-555555555555';
const EMPTY = { error: null, done: false };

const form = (values: Record<string, string | string[]>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) for (const x of Array.isArray(v) ? v : [v]) data.append(k, x);
  return data;
};
const flight = { flight: 'tp 205', date: '2026-11-04', time: '09:30', from: 'ewr', to: 'lis' };
const writes = () => calls.filter((c) => c.op !== 'select');
const adminWrites = () => writes().filter((c) => c.client === 'admin');

beforeEach(() => {
  calls.length = 0;
  order.length = 0;
  results.clear();
  rpcResults.clear();
  roles.member = true;
  roles.planner = true;
  rpc.mockClear();
  start.mockClear();
  putInbound.mockClear();
  start.mockReset();
  start.mockImplementation(async () => {
    order.push('start');
  });
});

const startedWith = (bookingIds: string[]) => expect(start).toHaveBeenCalledWith('confirm', [TRIP, bookingIds]);

describe('confirmBooking', () => {
  it('refuses a non-planner with no write', async () => {
    roles.planner = false;
    await expect(confirmBooking(TRIP, BOOKING)).rejects.toThrow(/Only the planner/);
    expect(writes()).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it('refuses a booking from another trip: nothing updated, no lookup', async () => {
    results.set('user.bookings.update', { data: [], error: null });
    await expect(confirmBooking(TRIP, BOOKING)).rejects.toThrow(/not on this trip/);
    expect(writes().every((c) => c.table === 'bookings')).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });

  it('confirms, closes the booking items, and starts the confirm workflow', async () => {
    results.set('user.bookings.update', { data: [{ id: BOOKING }], error: null });
    await confirmBooking(TRIP, BOOKING);
    expect(calls.find((c) => c.table === 'bookings' && c.op === 'update')?.filters).toContainEqual(['trip_id', TRIP]);
    startedWith([BOOKING]);
  });

  it('throws when closing the booking items fails, and starts nothing', async () => {
    results.set('user.bookings.update', { data: [{ id: BOOKING }], error: null });
    results.set('user.action_items.update', { data: null, error: { message: 'db down' } });
    await expect(confirmBooking(TRIP, BOOKING)).rejects.toThrow('db down');
    expect(start).not.toHaveBeenCalled();
  });

  it('keeps the confirmation and rethrows when the workflow cannot start', async () => {
    results.set('user.bookings.update', { data: [{ id: BOOKING }], error: null });
    start.mockRejectedValue(new Error('queue down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(confirmBooking(TRIP, BOOKING)).rejects.toThrow('queue down');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('toggleAssignment', () => {
  it('refuses a non-member with no write', async () => {
    roles.member = false;
    roles.planner = false;
    await expect(toggleAssignment(TRIP, BOOKING, ME, true)).rejects.toThrow(/not on this trip/);
    expect(writes()).toHaveLength(0);
    expect(rpc).not.toHaveBeenCalledWith('claim_booking_seat', expect.anything());
  });

  it('refuses a booking or member from another trip', async () => {
    await expect(toggleAssignment(TRIP, BOOKING, ME, true)).rejects.toThrow(/booking is not on this trip/);
    results.set('user.bookings.select', { data: [{ id: BOOKING }], error: null });
    await expect(toggleAssignment(TRIP, BOOKING, ME, true)).rejects.toThrow(/person is not on this trip/);
    expect(writes()).toHaveLength(0);
  });

  it('does not read a failed lookup as "not on this trip"', async () => {
    results.set('user.bookings.select', { data: null, error: { message: 'db down' } });
    await expect(toggleAssignment(TRIP, BOOKING, ME, true)).rejects.toThrow(/could not check that booking/);
    results.set('user.bookings.select', { data: [{ id: BOOKING }], error: null });
    results.set('user.trip_members.select', { data: null, error: { message: 'db down' } });
    await expect(toggleAssignment(TRIP, BOOKING, ME, true)).rejects.toThrow(/could not check that person/);
  });

  it('lets a member claim only their own seat, through the RPC', async () => {
    roles.planner = false;
    results.set('user.bookings.select', { data: [{ id: BOOKING }], error: null });
    results.set('user.trip_members.select', { data: [{ id: OTHER, user_id: 'user-2' }], error: null });
    await expect(toggleAssignment(TRIP, BOOKING, OTHER, true)).rejects.toThrow(/your own place/);
    await expect(toggleAssignment(TRIP, BOOKING, OTHER, false)).rejects.toThrow(/your own place/);
    expect(rpc).not.toHaveBeenCalledWith('claim_booking_seat', expect.anything());
    results.set('user.trip_members.select', { data: [{ id: ME, user_id: 'user-1' }], error: null });
    await toggleAssignment(TRIP, BOOKING, ME, true);
    expect(rpc).toHaveBeenCalledWith('claim_booking_seat', { p_booking_id: BOOKING });
    expect(writes()).toHaveLength(0);
  });

  it('lets the planner assign anyone through assign_booking_member, which clears a self-claim', async () => {
    results.set('user.bookings.select', { data: [{ id: BOOKING }], error: null });
    results.set('user.trip_members.select', { data: [{ id: OTHER, user_id: 'user-2' }], error: null });
    await toggleAssignment(TRIP, BOOKING, OTHER, true);
    expect(rpc).toHaveBeenCalledWith('assign_booking_member', { p_booking_id: BOOKING, p_member_id: OTHER });
    expect(writes()).toHaveLength(0);
  });

  it('removes a seat with a delete scoped to the trip', async () => {
    results.set('user.bookings.select', { data: [{ id: BOOKING }], error: null });
    results.set('user.trip_members.select', { data: [{ id: OTHER, user_id: 'user-2' }], error: null });
    await toggleAssignment(TRIP, BOOKING, OTHER, false);
    expect(writes()).toEqual([expect.objectContaining({ table: 'booking_members', op: 'delete', filters: expect.arrayContaining([['trip_id', TRIP]]) })]);
  });
});

describe('addManualFlight', () => {
  const members = { data: [{ id: ME }], error: null };

  it('refuses a non-planner with no write', async () => {
    roles.planner = false;
    const state = await addManualFlight(TRIP, EMPTY, form({ ...flight, travelers: ME }));
    expect(state.error).toMatch(/Only the planner/);
    expect(calls).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it('needs a traveler who is on the trip', async () => {
    results.set('user.trip_members.select', members);
    const state = await addManualFlight(TRIP, EMPTY, form({ ...flight, travelers: OTHER }));
    expect(state.error).toBe('Pick who is on this flight.');
    expect(adminWrites()).toHaveLength(0);
  });

  it('writes the key intake would write, then starts the workflow', async () => {
    results.set('user.trip_members.select', members);
    results.set('admin.bookings.insert', { data: { id: BOOKING }, error: null });
    expect(await addManualFlight(TRIP, EMPTY, form({ ...flight, code: 'abc123', travelers: ME }))).toEqual({ error: null, done: true });
    expect(calls.find((c) => c.table === 'bookings' && c.op === 'insert')?.payload).toMatchObject({ dedupe_key: 'flight|ABC123|TP205@2026-11-04' });
    startedWith([BOOKING]);
  });

  it('keeps the booking and returns an error when the workflow cannot start', async () => {
    results.set('user.trip_members.select', members);
    results.set('admin.bookings.insert', { data: { id: BOOKING }, error: null });
    start.mockRejectedValue(new Error('queue down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = await addManualFlight(TRIP, EMPTY, form({ ...flight, travelers: ME }));
    log.mockRestore();
    expect(state.done).toBe(false);
    expect(state.error).toMatch(/on the trip, but we could not start checking/);
    expect(calls.some((c) => c.table === 'bookings' && c.op === 'delete')).toBe(false);
  });
});

describe('uploadScreenshot', () => {
  const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

  it('refuses a non-member: nothing stored, no workflow', async () => {
    roles.member = false;
    const state = await uploadScreenshot(TRIP, EMPTY, form({}));
    expect(state.error).toBe('Join the trip first.');
    expect(putInbound).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it('rejects a file whose bytes are not the declared image type', async () => {
    const data = new FormData();
    data.set('screenshot', new File(['not an image'], 'a.png', { type: 'image/png' }));
    expect((await uploadScreenshot(TRIP, EMPTY, data)).error).toMatch(/not a real/);
    expect(putInbound).not.toHaveBeenCalled();
  });

  it('stores a valid screenshot and starts intake', async () => {
    results.set('admin.inbound_messages.insert', { data: { id: 'msg-1' }, error: null });
    const data = new FormData();
    data.set('screenshot', new File([PNG_BYTES], 'a.png', { type: 'image/png' }));
    expect(await uploadScreenshot(TRIP, EMPTY, data)).toEqual({ error: null, done: true });
    expect(putInbound).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${TRIP}/screenshots/.+\\.png$`)), expect.anything(), 'image/png');
    expect(start).toHaveBeenCalledWith('intake', ['msg-1']);
  });
});

describe('correctFlight', () => {
  const segmentRow = { data: [{ id: SEGMENT, booking_id: BOOKING }], error: null };
  const openItem = { data: [{ id: 'item-1', status: 'open' }], error: null };
  const arrange = (clash: unknown[] = []) => {
    results.set('user.booking_segments.select', (call) => (call.filters.some(([k]) => k === 'booking_id') ? { data: [{ id: SEGMENT, carrier_iata: 'TP', flight_number: '204', departure_local: '2026-11-03T18:15' }], error: null } : segmentRow));
    results.set('user.action_items.select', openItem);
    rpcResults.set('booking_confirmation_code', { data: 'ABC123', error: null });
    results.set('admin.bookings.select', (call) => (call.filters.some(([k]) => k === 'dedupe_key') ? { data: clash, error: null } : { data: [{ dedupe_key: 'flight|ABC123|TP204@2026-11-03' }], error: null }));
  };

  it('refuses a non-planner with no write and no paid call', async () => {
    roles.planner = false;
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    expect(state.error).toMatch(/Only the planner/);
    expect(calls).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it('refuses a segment from another trip', async () => {
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    expect(state.error).toBe('That flight is not on this trip.');
    expect(calls.find((c) => c.table === 'booking_segments')?.filters).toContainEqual(['trip_id', TRIP]);
    expect(writes()).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it('does not read a failed lookup as "not on this trip"', async () => {
    results.set('user.booking_segments.select', { data: null, error: { message: 'db down' } });
    expect((await correctFlight(TRIP, SEGMENT, EMPTY, form(flight))).error).toMatch(/could not check/);
    expect(writes()).toHaveLength(0);
  });

  it('refuses a segment with no open or snoozed flight_not_found item', async () => {
    results.set('user.booking_segments.select', segmentRow);
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    expect(state.error).toBe('That flight does not need a correction.');
    expect(writes()).toHaveLength(0);
  });

  it('rejects invalid input before any lookup or write', async () => {
    arrange();
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form({ ...flight, flight: 'Portugal Air' }));
    expect(state).toEqual({ error: 'Enter the flight like “TP 204”.', done: false });
    expect(writes()).toHaveLength(0);
  });

  it('recomputes the booking key, clears the resolved fields, closes only the found items, then starts the workflow', async () => {
    arrange();
    expect(await correctFlight(TRIP, SEGMENT, EMPTY, form(flight))).toEqual({ error: null, done: true });
    const adminOps = calls.filter((c) => c.client === 'admin' && c.op !== 'select');
    expect(adminOps.map((c) => `${c.table}.${c.op}`)).toEqual(['bookings.update', 'booking_segments.update', 'action_items.update']);
    expect(adminOps[0].payload).toEqual({ dedupe_key: 'flight|ABC123|TP205@2026-11-04' });
    expect(adminOps[1].payload).toEqual({
      carrier_iata: 'TP',
      flight_number: '205',
      origin_iata: 'EWR',
      destination_iata: 'LIS',
      departure_local: '2026-11-04T09:30',
      scheduled_out: null,
      scheduled_in: null,
      arrival_local: null,
      origin_country: null,
      destination_country: null,
      distance_km: null,
      fa_flight_id: null,
      last_status: null,
    });
    expect(adminOps[1].filters).toEqual(expect.arrayContaining([['id', SEGMENT], ['trip_id', TRIP]]));
    // Only the item found by the ownership check: no source_kind or entity filter that could reach older done items.
    expect(adminOps[2].payload).toEqual({ status: 'done' });
    expect(adminOps[2].filters).toEqual([['id', ['item-1']]]);
    startedWith([BOOKING]);
    expect(order.at(-1)).toBe('start');
    expect(order.indexOf('admin.action_items.update:done')).toBeLessThan(order.indexOf('start'));
  });

  it('refuses a flight that is already another booking on the trip, and changes nothing', async () => {
    arrange([{ id: 'other-booking' }]);
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    expect(state.error).toBe('That flight is already on the trip.');
    expect(writes()).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it('maps a unique violation on the key write to the same message, with no segment change', async () => {
    arrange();
    results.set('admin.bookings.update', { data: null, error: { message: 'dup', code: '23505' } });
    expect((await correctFlight(TRIP, SEGMENT, EMPTY, form(flight))).error).toBe('That flight is already on the trip.');
    expect(calls.some((c) => c.table === 'booking_segments' && c.op === 'update')).toBe(false);
  });

  it('restores the key if the segment write fails', async () => {
    arrange();
    results.set('admin.booking_segments.update', { data: null, error: { message: 'db down' } });
    expect((await correctFlight(TRIP, SEGMENT, EMPTY, form(flight))).error).toMatch(/could not save/);
    const keyWrites = calls.filter((c) => c.table === 'bookings' && c.op === 'update').map((c) => c.payload);
    expect(keyWrites).toEqual([{ dedupe_key: 'flight|ABC123|TP205@2026-11-04' }, { dedupe_key: 'flight|ABC123|TP204@2026-11-03' }]);
    expect(start).not.toHaveBeenCalled();
  });

  it('puts snoozed and open items back as they were when the workflow cannot start', async () => {
    arrange();
    results.set('user.action_items.select', { data: [{ id: 'item-1', status: 'snoozed' }, { id: 'item-2', status: 'open' }], error: null });
    start.mockRejectedValue(new Error('queue down'));
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    log.mockRestore();
    expect(state.error).toMatch(/could not start checking/);
    const itemWrites = calls.filter((c) => c.table === 'action_items' && c.op === 'update').map((c) => [c.payload, c.filters]);
    expect(itemWrites).toEqual([
      [{ status: 'done' }, [['id', ['item-1', 'item-2']]]],
      [{ status: 'open' }, [['id', ['item-2']]]],
      [{ status: 'snoozed' }, [['id', ['item-1']]]],
    ]);
  });
});
