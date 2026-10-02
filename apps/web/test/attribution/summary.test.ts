import { describe, expect, it } from 'vitest';
import { authorizedFoundry, parseSince, toAttributionResponse } from '@/lib/attribution/summary';

describe('authorizedFoundry', () => {
  it('accepts only the exact bearer key', () => {
    expect(authorizedFoundry('Bearer k3y', 'k3y')).toBe(true);
    expect(authorizedFoundry('Bearer wrong', 'k3y')).toBe(false);
    expect(authorizedFoundry(null, 'k3y')).toBe(false);
    expect(authorizedFoundry('Bearer k3y', undefined)).toBe(false);
  });
});

describe('parseSince', () => {
  it('accepts real YYYY-MM-DD dates only', () => {
    expect(parseSince('2026-10-01')).toBe('2026-10-01');
    expect(parseSince('2026-02-30')).toBeNull();
    expect(parseSince('2026-10-01T00:00:00Z')).toBeNull();
    expect(parseSince('nope')).toBeNull();
    expect(parseSince(null)).toBeNull();
  });
});

describe('toAttributionResponse', () => {
  it('echoes since as a date and coerces counts to numbers', () => {
    const response = toAttributionResponse('2026-10-01', [{ post_id: 'p1', clicks: '3', forwarded_bookings: 1, paid_passes: '0' }]);
    expect(response.posts).toEqual([{ post_id: 'p1', clicks: 3, forwarded_bookings: 1, paid_passes: 0 }]);
    expect(response.since).toBe('2026-10-01');
  });
});
