import { describe, expect, it } from 'vitest';
import { haversineKm, localDateTime } from '@/lib/flights/geo';

describe('geo', () => {
  it('measures great-circle distance', () => {
    // EWR (40.6925, -74.1687) to LIS (38.7813, -9.13592): 5,433 km in whole km
    expect(Math.round(haversineKm({ latitude: 40.6925, longitude: -74.1687 }, { latitude: 38.7813, longitude: -9.13592 }))).toBe(5433);
  });

  it('renders a UTC instant as local wall-clock time', () => {
    expect(localDateTime('2026-11-03T23:15:00Z', 'America/New_York')).toBe('2026-11-03T18:15');
  });
});
