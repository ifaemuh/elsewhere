import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
const state: {
  schedulesCalls: number;
  scheduled: Row[];
  failIdents: Set<string>;
  segments: Row[];
  existingItems: { related_entity_id: string }[];
  upserts: { row: Row; options: Row }[];
  updates: { payload: Row; filters: [string, unknown[]][] }[];
  itemFilters: [string, unknown[]][];
  updateError: string | null;
  upsertError: string | null;
} = { schedulesCalls: 0, scheduled: [], failIdents: new Set(), segments: [], existingItems: [], upserts: [], updates: [], itemFilters: [], updateError: null, upsertError: null };

vi.mock('@/lib/flights/aeroapi', async () => {
  const actual = await vi.importActual<typeof import('@/lib/flights/aeroapi')>('@/lib/flights/aeroapi');
  return {
    AeroApiError: actual.AeroApiError,
    aeroApi: async () => ({
      schedules: async (_s: string, _e: string, airline: string, flightNumber: string) => {
        state.schedulesCalls += 1;
        if (state.failIdents.has(`${airline}${flightNumber}`)) throw new actual.AeroApiError('AeroAPI /schedules failed with 503', 503, true);
        return state.scheduled.filter((s) => s.ident_iata === `${airline}${flightNumber}`);
      },
      airport: async (iata: string) =>
        iata === 'EWR'
          ? { code_iata: 'EWR', country_code: 'US', latitude: 40.6925, longitude: -74.1687, timezone: 'America/New_York' }
          : { code_iata: 'LIS', country_code: 'PT', latitude: 38.7813, longitude: -9.13592, timezone: 'Europe/Lisbon' },
      flights: async () => [],
      createAlert: async () => 'a',
      deleteAlert: async () => undefined,
    }),
  };
});

function query(table: string) {
  const filters: [string, unknown[]][] = [];
  let mode: 'select' | 'update' = 'select';
  let payload: Row = {};
  const q: Record<string, unknown> = {};
  const filter = (name: string) => (...args: unknown[]) => {
    filters.push([name, args]);
    return q;
  };
  Object.assign(q, {
    select: () => q,
    in: filter('in'),
    is: filter('is'),
    eq: filter('eq'),
    single: async () => ({ data: { user_id: 'u1' }, error: null }),
    upsert: async (row: Row, options: Row) => {
      state.upserts.push({ row, options });
      return { error: state.upsertError ? { message: state.upsertError } : null };
    },
    update: (p: Row) => {
      mode = 'update';
      payload = p;
      return q;
    },
    then: (resolve: (v: unknown) => void) => {
      if (mode === 'update') {
        state.updates.push({ payload, filters });
        return resolve({ error: state.updateError ? { message: state.updateError } : null });
      }
      if (table === 'action_items') {
        state.itemFilters = filters;
        return resolve({ data: state.existingItems, error: null });
      }
      return resolve({ data: state.segments, error: null });
    },
  });
  return q;
}
const runDocumentChecks = vi.hoisted(() => vi.fn(async (_tripId: string) => undefined));
vi.mock('@/lib/documents/service', () => ({ runDocumentChecks }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: query }) }));

import { AeroApiError } from '@/lib/flights/aeroapi';
import { onBookingsConfirmed } from '@/lib/bookings/confirm';

const seg = { id: 's1', booking_id: 'b1', carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', destination_iata: 'LIS', departure_local: '2026-11-03T18:15', scheduled_out: null };
const tp204 = { ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' };

beforeEach(() => {
  runDocumentChecks.mockClear();
  Object.assign(state, { schedulesCalls: 0, scheduled: [], failIdents: new Set(), segments: [seg], existingItems: [], upserts: [], updates: [], itemFilters: [], updateError: null, upsertError: null });
});

describe('onBookingsConfirmed', () => {
  it('does nothing for no bookings', async () => {
    expect(await onBookingsConfirmed('t1', [])).toEqual({ monitorSegmentIds: [] });
    expect(state.schedulesCalls).toBe(0);
  });

  it('writes the resolved facts, guarded so a resolved segment is never overwritten', async () => {
    state.scheduled = [tp204];
    await onBookingsConfirmed('t1', ['b1']);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].payload).toEqual({
      scheduled_out: '2026-11-03T23:15:00Z',
      scheduled_in: '2026-11-04T06:35:00Z',
      origin_country: 'US',
      destination_country: 'PT',
      distance_km: 5430,
    });
    expect(state.updates[0].filters).toEqual([['eq', ['id', 's1']], ['is', ['scheduled_out', null]]]);
    expect(runDocumentChecks).toHaveBeenCalledWith('t1');
  });

  it('raises a flight-not-found item that reopens any existing one', async () => {
    await onBookingsConfirmed('t1', ['b1']);
    expect(state.schedulesCalls).toBe(1);
    expect(state.upserts).toHaveLength(1);
    const { row, options } = state.upserts[0];
    expect(row).toMatchObject({ source_kind: 'flight_not_found', related_entity_id: 's1', assigned_user_ids: ['u1'], status: 'open' });
    expect(options.ignoreDuplicates).toBeUndefined();
  });

  it('skips AeroAPI for a segment whose item is still open or snoozed, but not one marked done', async () => {
    state.existingItems = [{ related_entity_id: 's1' }];
    await onBookingsConfirmed('t1', ['b1']);
    expect(state.schedulesCalls).toBe(0);
    expect(state.upserts).toHaveLength(0);
    // Only open and snoozed items count, so a done item lets the lookup run again and reopens it.
    expect(state.itemFilters).toContainEqual(['in', ['status', ['open', 'snoozed']]]);
  });

  it('throws when the segment update fails', async () => {
    state.scheduled = [tp204];
    state.updateError = 'db down';
    await expect(onBookingsConfirmed('t1', ['b1'])).rejects.toThrow('db down');
  });

  it('throws when the not-found upsert fails', async () => {
    state.upsertError = 'db down';
    await expect(onBookingsConfirmed('t1', ['b1'])).rejects.toThrow('db down');
  });

  it('continues past a retryable AeroAPI failure, then rethrows it', async () => {
    state.segments = [{ ...seg, id: 's1', flight_number: '999' }, { ...seg, id: 's2' }];
    state.failIdents = new Set(['TP999']);
    state.scheduled = [tp204];
    const err = await onBookingsConfirmed('t1', ['b1']).catch((e) => e);
    expect(err).toBeInstanceOf(AeroApiError);
    expect(err.retryable).toBe(true);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].filters).toContainEqual(['eq', ['id', 's2']]);
    expect(state.upserts).toHaveLength(0);
  });

  describe('document re-check', () => {
    it('still runs when there are no unresolved segments (early return)', async () => {
      state.segments = [];
      expect(await onBookingsConfirmed('t1', ['b1'])).toEqual({ monitorSegmentIds: [] });
      expect(runDocumentChecks).toHaveBeenCalledWith('t1');
    });

    it('still runs when every segment is already flagged', async () => {
      state.existingItems = [{ related_entity_id: 's1' }];
      await onBookingsConfirmed('t1', ['b1']);
      expect(runDocumentChecks).toHaveBeenCalledWith('t1');
    });

    it('still runs when the flight part throws, and that error still propagates', async () => {
      state.upsertError = 'db down';
      await expect(onBookingsConfirmed('t1', ['b1'])).rejects.toThrow('db down');
      expect(runDocumentChecks).toHaveBeenCalledWith('t1');
    });

    it('never makes onBookingsConfirmed throw when the document check fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      runDocumentChecks.mockRejectedValueOnce(new Error('checks down'));
      state.scheduled = [tp204];
      await expect(onBookingsConfirmed('t1', ['b1'])).resolves.toEqual({ monitorSegmentIds: [] });
    });

    it('does not run for an empty confirmation', async () => {
      await onBookingsConfirmed('t1', []);
      expect(runDocumentChecks).not.toHaveBeenCalled();
    });
  });
});
