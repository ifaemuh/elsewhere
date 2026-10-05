import { describe, expect, it } from 'vitest';
import { joinPreview } from '@/lib/trips/join-preview';

describe('joinPreview', () => {
  it('exposes only the trip name, dates, and traveler count', () => {
    const preview = joinPreview({ name: 'Lisbon 2026', start_date: '2026-11-03', end_date: '2026-11-10' }, 4);
    expect(preview).toEqual({ tripName: 'Lisbon 2026', dates: 'Nov 3 – Nov 10, 2026', travelerCount: 4 });
    expect(Object.keys(preview).sort()).toEqual(['dates', 'travelerCount', 'tripName']);
  });

  it('handles missing dates', () => {
    expect(joinPreview({ name: 'Somewhere', start_date: null, end_date: null }, 1).dates).toBe('Dates to be set');
  });
});
