import { describe, expect, it } from 'vitest';
import { parseManualFlight } from '@/lib/bookings/manual';

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

describe('parseManualFlight', () => {
  it('accepts "TP 204" style flight numbers and normalizes codes', () => {
    expect(parseManualFlight(form({ flight: 'tp 204', date: '2026-11-03', time: '18:15', from: 'ewr', to: 'lis', code: 'abc123' }))).toEqual({
      success: true,
      data: { carrierIata: 'TP', flightNumber: '204', departureLocal: '2026-11-03T18:15', originIata: 'EWR', destinationIata: 'LIS', confirmationCode: 'ABC123' },
    });
  });

  it('explains what is wrong', () => {
    expect(parseManualFlight(form({ flight: 'Portugal Air', date: '2026-11-03', time: '18:15', from: 'EWR', to: 'LIS', code: '' }))).toEqual({
      success: false,
      error: 'Enter the flight like “TP 204”.',
    });
  });
});
