import { describe, expect, it } from 'vitest';
import { parseNewTrip } from '@/lib/trips/new-trip';

function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

const valid = { name: 'Lisbon 2026', destinationCountry: 'pt', startDate: '2026-11-03', endDate: '2026-11-10', displayName: 'Pat' };

describe('parseNewTrip', () => {
  it('normalizes a valid trip', () => {
    expect(parseNewTrip(form(valid))).toEqual({ success: true, data: { ...valid, destinationCountry: 'PT' } });
  });

  it('rejects an end date before the start', () => {
    const result = parseNewTrip(form({ ...valid, endDate: '2026-11-01' }));
    expect(result).toEqual({ success: false, error: 'The trip has to end on or after it starts.' });
  });

  it('rejects a country that is not a two-letter code', () => {
    expect(parseNewTrip(form({ ...valid, destinationCountry: 'Portugal' })).success).toBe(false);
  });
});
