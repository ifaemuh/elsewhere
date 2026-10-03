import { describe, expect, it, vi } from 'vitest';
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
      distanceKm: 5433,
      operatorIata: 'TP',
    });
  });

  it('takes the operating airline from the actual ident of a codeshare, else from the scheduled ident', async () => {
    const times = { origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' };
    expect(await resolveSegment(segment, api([{ ident_iata: 'KL6101', actual_ident_iata: 'DL8606', ...times }]))).toMatchObject({ operatorIata: 'DL' });
    expect(await resolveSegment(segment, api([{ ident_iata: '9K1234', ...times }]))).toMatchObject({ operatorIata: '9K' });
    expect(await resolveSegment(segment, api([{ ident_iata: 'TP204', actual_ident_iata: 'junk', ...times }]))).toMatchObject({ operatorIata: null });
    expect(await resolveSegment(segment, api([{ ident_iata: null, ...times }]))).toMatchObject({ operatorIata: null });
  });

  it('leaves the operator null when AeroAPI reports an actual ident that is not a two-character IATA ident', async () => {
    const times = { ident_iata: 'KL6101', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' };
    for (const bad of ['DAL8606', 'dl8606', 'DL 8606', 'DL86060']) {
      expect(await resolveSegment(segment, api([{ ...times, actual_ident_iata: bad }])), bad).toMatchObject({ operatorIata: null });
      expect(await resolveSegment(segment, api([{ ...times, actual_ident: bad }])), bad).toMatchObject({ operatorIata: null });
    }
    for (const field of ['actual_ident_iata', 'actual_ident'] as const) {
      expect(await resolveSegment(segment, api([{ ...times, [field]: '' }])), field).toMatchObject({ operatorIata: null });
    }
    // A parsing IATA ident wins over an ICAO actual_ident; with neither field present the scheduled ident is used.
    expect(await resolveSegment(segment, api([{ ...times, actual_ident_iata: 'DL8606', actual_ident: 'DAL8606' }]))).toMatchObject({ operatorIata: 'DL' });
    expect(await resolveSegment(segment, api([times]))).toMatchObject({ operatorIata: 'KL' });
  });

  it('keeps the distance in whole kilometres, never rounded to 10', async () => {
    const times = { ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' };
    const result = await resolveSegment(segment, api([times]));
    expect(result).toMatchObject({ distanceKm: 5433 });
    expect(Number.isInteger((result as { distanceKm: number }).distanceKm)).toBe(true);
  });

  it('reports a flight that is not in the schedule', async () => {
    expect(await resolveSegment(segment, api([]))).toEqual({ kind: 'not_found', reason: 'no_matching_flight' });
  });

  it('resolves with null countries and distance when airport details are missing', async () => {
    const noAirports: AeroApi = { ...api([{ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' }]), airport: async (iata) => ({ code_iata: iata, country_code: null, latitude: null, longitude: null, timezone: iata === 'EWR' ? 'America/New_York' : null }) };
    expect(await resolveSegment(segment, noAirports)).toMatchObject({ kind: 'resolved', originCountry: null, destinationCountry: null, distanceKm: null });
  });

  it('ignores schedule rows with a null departure', async () => {
    const rows = [{ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: null, scheduled_in: null }] as unknown as Awaited<ReturnType<AeroApi['schedules']>>;
    expect(await resolveSegment(segment, api(rows))).toEqual({ kind: 'not_found', reason: 'no_matching_flight' });
  });

  it('returns not_found with a reason when the origin timezone is unknown', async () => {
    const base = api([{ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' }]);
    const noTz: AeroApi = { ...base, airport: async (iata) => (iata === 'EWR' ? { ...airports.EWR, timezone: null } : airports.LIS) };
    expect(await resolveSegment(segment, noTz)).toEqual({ kind: 'not_found', reason: 'unknown_origin_timezone' });
    expect(await resolveSegment(segment, { ...base, airport: async () => null })).toEqual({ kind: 'not_found', reason: 'unknown_origin_timezone' });
  });

  it('rejects a malformed departure without calling AeroAPI', async () => {
    const schedules = vi.fn(async () => []);
    const spy: AeroApi = { ...api([]), schedules };
    for (const departureLocal of ['2026-11-03T18:15:00', '2026-11-03 18:15', '2026-13-45T18:15', '']) {
      expect(await resolveSegment({ ...segment, departureLocal }, spy)).toEqual({ kind: 'not_found', reason: 'invalid_departure' });
    }
    expect(schedules).not.toHaveBeenCalled();
  });

  it('looks each airport up once across segments', async () => {
    const airport = vi.fn(async (iata: string) => airports[iata as keyof typeof airports] ?? null);
    const spy: AeroApi = { ...api([]), airport };
    await resolveSegment(segment, spy);
    await resolveSegment({ ...segment, id: 's2' }, spy);
    expect(airport).toHaveBeenCalledTimes(2);
  });

  it('keeps airport results when the schedules call fails, and rethrows the failure', async () => {
    const airport = vi.fn(async (iata: string) => airports[iata as keyof typeof airports] ?? null);
    const boom = new Error('schedules down');
    let fail = true;
    const spy: AeroApi = { ...api([]), airport, schedules: async () => { if (fail) throw boom; return []; } };
    await expect(resolveSegment(segment, spy)).rejects.toBe(boom);
    fail = false;
    await resolveSegment(segment, spy);
    expect(airport).toHaveBeenCalledTimes(2);
  });

  describe('local time edge cases', () => {
    const row = (out: string) => ({ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: out, scheduled_in: '2026-12-01T00:00:00Z' });
    const at = (departureLocal: string) => ({ ...segment, departureLocal });

    it('matches across the March spring-forward gap', async () => {
      // 2026-03-08 02:00 EST jumps to 03:00 EDT: 06:30Z is 01:30 EST, 07:30Z is 03:30 EDT.
      const rows = [row('2026-03-08T06:30:00Z'), row('2026-03-08T07:30:00Z')];
      expect(await resolveSegment(at('2026-03-08T03:30'), api(rows))).toMatchObject({ kind: 'resolved', scheduledOut: '2026-03-08T07:30:00Z' });
      expect(await resolveSegment(at('2026-03-08T01:30'), api(rows))).toMatchObject({ kind: 'resolved', scheduledOut: '2026-03-08T06:30:00Z' });
    });

    it('matches either side of the November fall-back', async () => {
      // 2026-11-01 02:00 EDT falls back to 01:00 EST: 01:30 happens twice (05:30Z and 06:30Z).
      const rows = [row('2026-11-01T03:30:00Z'), row('2026-11-01T08:30:00Z')];
      expect(await resolveSegment(at('2026-10-31T23:30'), api(rows))).toMatchObject({ kind: 'resolved', scheduledOut: '2026-11-01T03:30:00Z' });
      expect(await resolveSegment(at('2026-11-01T03:30'), api(rows))).toMatchObject({ kind: 'resolved', scheduledOut: '2026-11-01T08:30:00Z' });
    });

    it('picks the earlier departure inside the repeated fall-back hour', async () => {
      const rows = [row('2026-11-01T06:30:00Z'), row('2026-11-01T05:30:00Z')];
      expect(await resolveSegment(at('2026-11-01T01:30'), api(rows))).toMatchObject({ kind: 'resolved', scheduledOut: '2026-11-01T05:30:00Z' });
    });

    it('matches a near-midnight departure that wraps the date', async () => {
      // 2026-11-03T04:50Z is 23:50 EST on Nov 2; the confirmation says 00:05 on Nov 3.
      const schedules = vi.fn(async () => [row('2026-11-03T04:50:00Z')]);
      const spy: AeroApi = { ...api([]), schedules };
      expect(await resolveSegment(at('2026-11-03T00:05'), spy)).toMatchObject({ kind: 'resolved', scheduledOut: '2026-11-03T04:50:00Z' });
      expect(schedules).toHaveBeenCalledWith('2026-11-02', '2026-11-05', 'TP', '204');
    });
  });
});
