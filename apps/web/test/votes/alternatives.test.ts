import { describe, expect, it } from 'vitest';
import type { AeroApi } from '@/lib/flights/aeroapi';
import { suggestAlternatives } from '@/lib/votes/alternatives';

const api: AeroApi = {
  schedules: async () => [],
  routeSchedules: async () => [
    { ident_iata: 'TP202', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-04T23:15:00Z', scheduled_in: '2026-11-05T06:35:00Z' },
    { ident_iata: 'UA64', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-04T01:00:00Z', scheduled_in: '2026-11-04T12:30:00Z' },
  ],
  airport: async () => ({ code_iata: 'EWR', country_code: 'US', latitude: 0, longitude: 0, timezone: 'America/New_York' }),
  flights: async () => [],
  createAlert: async () => 'a',
  deleteAlert: async () => undefined,
};

describe('suggestAlternatives', () => {
  it('lists upcoming flights on the same route, earliest first, never promising seats', async () => {
    const options = await suggestAlternatives({ originIata: 'EWR', destinationIata: 'LIS', carrierIata: 'TP' }, api, new Date('2026-11-03T20:00:00Z'));
    expect(options).toEqual([
      // New York is on EST (UTC−5) after Nov 1, 2026.
      { label: 'UA 64 · leaves Nov 3, 20:00', note: 'availability not confirmed — ask the airline' },
      { label: 'TP 202 · leaves Nov 4, 18:15', note: 'availability not confirmed — ask the airline' },
    ]);
  });
});
