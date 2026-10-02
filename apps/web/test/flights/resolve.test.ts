import { describe, expect, it } from 'vitest';
import type { AeroApi } from '@/lib/flights/aeroapi';
import { resolveSegment } from '@/lib/flights/resolve';

const airports = {
  EWR: { code_iata: 'EWR', country_code: 'US', latitude: 40.6925, longitude: -74.1687, timezone: 'America/New_York' },
  LIS: { code_iata: 'LIS', country_code: 'PT', latitude: 38.7813, longitude: -9.13592, timezone: 'Europe/Lisbon' },
};

function api(scheduled: Awaited<ReturnType<AeroApi['schedules']>>): AeroApi {
  return {
    schedules: async () => scheduled,
    airport: async (iata) => airports[iata as keyof typeof airports] ?? null,
    flights: async () => [],
    createAlert: async () => 'a1',
    deleteAlert: async () => undefined,
  };
}

const segment = { id: 's1', carrierIata: 'TP', flightNumber: '204', originIata: 'EWR', destinationIata: 'LIS', departureLocal: '2026-11-03T18:15' };

describe('resolveSegment', () => {
  it('picks the scheduled flight whose local departure matches the confirmation', async () => {
    const result = await resolveSegment(
      segment,
      api([
        { ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-02T23:15:00Z', scheduled_in: '2026-11-03T06:35:00Z' },
        { ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' },
      ]),
    );
    expect(result).toEqual({
      kind: 'resolved',
      scheduledOut: '2026-11-03T23:15:00Z',
      scheduledIn: '2026-11-04T06:35:00Z',
      originCountry: 'US',
      destinationCountry: 'PT',
      distanceKm: 5430,
    });
  });

  it('reports a flight that is not in the schedule', async () => {
    expect(await resolveSegment(segment, api([]))).toEqual({ kind: 'not_found' });
  });

  it('resolves with null countries and distance when airports are unknown', async () => {
    const noAirports: AeroApi = { ...api([{ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T18:15:00Z', scheduled_in: '2026-11-04T01:35:00Z' }]), airport: async () => null };
    expect(await resolveSegment(segment, noAirports)).toMatchObject({ kind: 'resolved', originCountry: null, destinationCountry: null, distanceKm: null });
  });

  it('ignores schedule rows with a null departure', async () => {
    const rows = [{ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: null, scheduled_in: null }] as unknown as Awaited<ReturnType<AeroApi['schedules']>>;
    expect(await resolveSegment(segment, api(rows))).toEqual({ kind: 'not_found' });
  });
});
