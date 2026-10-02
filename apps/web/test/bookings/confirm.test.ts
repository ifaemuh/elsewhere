import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = { schedules: 0 };
vi.mock('@/lib/flights/aeroapi', () => ({
  aeroApi: async () => ({
    schedules: async () => {
      calls.schedules += 1;
      return [];
    },
    airport: async () => null,
    flights: async () => [],
    createAlert: async () => 'a',
    deleteAlert: async () => undefined,
  }),
}));

interface Seg { id: string; booking_id: string; carrier_iata: string; flight_number: string; origin_iata: string; destination_iata: string; departure_local: string; scheduled_out: string | null }
const state: { segments: Seg[]; existingItems: { related_entity_id: string }[]; upserts: unknown[] } = { segments: [], existingItems: [], upserts: [] };

function query(table: string) {
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, {
    select: chain, in: chain, is: chain, eq: chain, neq: chain,
    single: async () => ({ data: { user_id: 'u1' }, error: null }),
    upsert: async (row: unknown) => { state.upserts.push(row); return { error: null }; },
    update: chain,
    then: (resolve: (v: unknown) => void) => resolve({ data: table === 'booking_segments' ? state.segments : state.existingItems, error: null }),
  });
  return q;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: query }) }));

import { onBookingsConfirmed } from '@/lib/bookings/confirm';

const seg: Seg = { id: 's1', booking_id: 'b1', carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', destination_iata: 'LIS', departure_local: '2026-11-03T18:15', scheduled_out: null };

beforeEach(() => {
  calls.schedules = 0;
  state.segments = [seg];
  state.existingItems = [];
  state.upserts = [];
});

describe('onBookingsConfirmed', () => {
  it('does nothing for no bookings', async () => {
    expect(await onBookingsConfirmed('t1', [])).toEqual({ monitorSegmentIds: [] });
    expect(calls.schedules).toBe(0);
  });

  it('raises a flight-not-found item for an unresolvable segment', async () => {
    await onBookingsConfirmed('t1', ['b1']);
    expect(calls.schedules).toBe(1);
    expect(state.upserts).toHaveLength(1);
    expect(state.upserts[0]).toMatchObject({ source_kind: 'flight_not_found', related_entity_id: 's1', assigned_user_ids: ['u1'] });
  });

  it('does not call AeroAPI again for a segment already flagged not found', async () => {
    state.existingItems = [{ related_entity_id: 's1' }];
    await onBookingsConfirmed('t1', ['b1']);
    expect(calls.schedules).toBe(0);
    expect(state.upserts).toHaveLength(0);
  });
});
