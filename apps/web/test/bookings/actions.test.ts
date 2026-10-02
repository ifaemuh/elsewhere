import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { message: string; code?: string } | null };
interface Call { client: 'user' | 'admin'; table: string; op: string; payload?: unknown; filters: [string, unknown][] }

const calls: Call[] = [];
const order: string[] = [];
const results = new Map<string, Result>();
const roles = { member: true, planner: true };
const rpc = vi.fn(async (name: string, _args: Record<string, unknown>): Promise<Result> => {
  if (name === 'is_trip_member') return { data: roles.member, error: null };
  if (name === 'is_trip_planner') return { data: roles.planner, error: null };
  return { data: null, error: null };
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
        const r = results.get(`${who}.${table}.${call.op}`) ?? { data: call.op === 'select' ? [] : null, error: null };
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
const onBookingsConfirmed = vi.hoisted(() => vi.fn());
vi.mock('@/lib/bookings/confirm', () => ({ onBookingsConfirmed }));
const putInbound = vi.hoisted(() => vi.fn(async (p: string) => p));
vi.mock('@/lib/intake/storage', () => ({ putInbound }));
const start = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('workflow/api', () => ({ start }));
vi.mock('@/workflows/intake', () => ({ intakeWorkflow: 'intake' }));
vi.mock('@/workflows/segment-monitor', () => ({ segmentMonitorWorkflow: 'monitor' }));

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
  roles.member = true;
  roles.planner = true;
  rpc.mockClear();
  start.mockClear();
  putInbound.mockClear();
  onBookingsConfirmed.mockReset();
  onBookingsConfirmed.mockImplementation(async () => {
    order.push('onBookingsConfirmed');
    return { monitorSegmentIds: [] };
  });
});

describe('confirmBooking', () => {
  it('refuses a non-planner with no write', async () => {
    roles.planner = false;
    await expect(confirmBooking(TRIP, BOOKING)).rejects.toThrow(/Only the planner/);
    expect(writes()).toHaveLength(0);
    expect(onBookingsConfirmed).not.toHaveBeenCalled();
  });

  it('refuses a booking from another trip: nothing updated, no lookup', async () => {
    results.set('user.bookings.update', { data: [], error: null });
    await expect(confirmBooking(TRIP, BOOKING)).rejects.toThrow(/not on this trip/);
    expect(writes().every((c) => c.table === 'bookings')).toBe(true);
    expect(onBookingsConfirmed).not.toHaveBeenCalled();
  });

  it('confirms, closes the booking items, runs the confirm hook and starts monitors', async () => {
    results.set('user.bookings.update', { data: [{ id: BOOKING }], error: null });
    onBookingsConfirmed.mockResolvedValue({ monitorSegmentIds: [SEGMENT] });
    await confirmBooking(TRIP, BOOKING);
    expect(calls.find((c) => c.table === 'bookings' && c.op === 'update')?.filters).toContainEqual(['trip_id', TRIP]);
    expect(onBookingsConfirmed).toHaveBeenCalledWith(TRIP, [BOOKING]);
    expect(start).toHaveBeenCalledWith('monitor', [SEGMENT]);
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

  it('lets the planner assign anyone directly', async () => {
    results.set('user.bookings.select', { data: [{ id: BOOKING }], error: null });
    results.set('user.trip_members.select', { data: [{ id: OTHER, user_id: 'user-2' }], error: null });
    await toggleAssignment(TRIP, BOOKING, OTHER, true);
    expect(writes()).toEqual([expect.objectContaining({ table: 'booking_members', op: 'insert', payload: { booking_id: BOOKING, member_id: OTHER, trip_id: TRIP } })]);
  });
});

describe('addManualFlight', () => {
  it('refuses a non-planner with no write', async () => {
    roles.planner = false;
    const state = await addManualFlight(TRIP, EMPTY, form({ ...flight, travelers: ME }));
    expect(state.error).toMatch(/Only the planner/);
    expect(calls).toHaveLength(0);
    expect(onBookingsConfirmed).not.toHaveBeenCalled();
  });

  it('needs a traveler who is on the trip', async () => {
    results.set('user.trip_members.select', { data: [{ id: ME }], error: null });
    const state = await addManualFlight(TRIP, EMPTY, form({ ...flight, travelers: OTHER }));
    expect(state.error).toBe('Pick who is on this flight.');
    expect(adminWrites()).toHaveLength(0);
  });
});

describe('uploadScreenshot', () => {
  it('refuses a non-member: nothing stored, no workflow', async () => {
    roles.member = false;
    const state = await uploadScreenshot(TRIP, EMPTY, form({}));
    expect(state.error).toBe('Join the trip first.');
    expect(putInbound).not.toHaveBeenCalled();
    expect(calls).toHaveLength(0);
    expect(start).not.toHaveBeenCalled();
  });

  it('stores a valid screenshot and starts intake', async () => {
    results.set('admin.inbound_messages.insert', { data: { id: 'msg-1' }, error: null });
    const data = new FormData();
    data.set('screenshot', new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }));
    expect(await uploadScreenshot(TRIP, EMPTY, data)).toEqual({ error: null, done: true });
    expect(putInbound).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`^${TRIP}/screenshots/.+\\.png$`)), expect.anything(), 'image/png');
    expect(start).toHaveBeenCalledWith('intake', ['msg-1']);
  });
});

describe('correctFlight', () => {
  const segmentRow = { data: [{ id: SEGMENT, booking_id: BOOKING }], error: null };
  const openItem = { data: [{ id: 'item-1' }], error: null };

  it('refuses a non-planner with no write and no paid call', async () => {
    roles.planner = false;
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    expect(state.error).toMatch(/Only the planner/);
    expect(calls).toHaveLength(0);
    expect(onBookingsConfirmed).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('refuses a segment from another trip', async () => {
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    expect(state.error).toBe('That flight is not on this trip.');
    expect(calls.find((c) => c.table === 'booking_segments')?.filters).toContainEqual(['trip_id', TRIP]);
    expect(writes()).toHaveLength(0);
    expect(onBookingsConfirmed).not.toHaveBeenCalled();
  });

  it('refuses a segment with no open or snoozed flight_not_found item', async () => {
    results.set('user.booking_segments.select', segmentRow);
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    expect(state.error).toBe('That flight does not need a correction.');
    expect(writes()).toHaveLength(0);
    expect(onBookingsConfirmed).not.toHaveBeenCalled();
  });

  it('rejects invalid input before any lookup or write', async () => {
    results.set('user.booking_segments.select', segmentRow);
    results.set('user.action_items.select', openItem);
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form({ ...flight, flight: 'Portugal Air' }));
    expect(state).toEqual({ error: 'Enter the flight like “TP 204”.', done: false });
    expect(writes()).toHaveLength(0);
    expect(onBookingsConfirmed).not.toHaveBeenCalled();
  });

  it('clears the resolved fields, closes the item before the lookup, and starts monitors', async () => {
    results.set('user.booking_segments.select', segmentRow);
    results.set('user.action_items.select', openItem);
    onBookingsConfirmed.mockImplementation(async () => {
      order.push('onBookingsConfirmed');
      return { monitorSegmentIds: [SEGMENT] };
    });
    expect(await correctFlight(TRIP, SEGMENT, EMPTY, form(flight))).toEqual({ error: null, done: true });
    const update = calls.find((c) => c.table === 'booking_segments' && c.op === 'update')!;
    expect(update.client).toBe('admin');
    expect(update.payload).toEqual({
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
    expect(update.filters).toEqual(expect.arrayContaining([['id', SEGMENT], ['trip_id', TRIP]]));
    expect(order.filter((o) => o !== 'user.action_items.select' && o !== 'user.booking_segments.select')).toEqual([
      'admin.booking_segments.update',
      'admin.action_items.update:done',
      'onBookingsConfirmed',
    ]);
    expect(onBookingsConfirmed).toHaveBeenCalledWith(TRIP, [BOOKING]);
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('monitor', [SEGMENT]);
  });

  it('reopens the item if the lookup fails, so the planner can try again', async () => {
    results.set('user.booking_segments.select', segmentRow);
    results.set('user.action_items.select', openItem);
    onBookingsConfirmed.mockRejectedValue(new Error('aeroapi down'));
    const state = await correctFlight(TRIP, SEGMENT, EMPTY, form(flight));
    expect(state.error).toMatch(/could not look the flight up/);
    expect(order.at(-1)).toBe('admin.action_items.update:open');
    expect(start).not.toHaveBeenCalled();
  });
});
