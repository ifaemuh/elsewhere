import { describe, expect, it } from 'vitest';
import { hashJoinToken, isJoinTokenShape, joinExpiry, joinToken } from '@/lib/trips/join-token';

describe('join tokens', () => {
  const expires = '2026-11-17T23:59:59.123Z';

  it('is deterministic for a trip and expiry, so the planner can see the link again', () => {
    expect(joinToken('s3cret', 'trip-1', expires)).toBe(joinToken('s3cret', 'trip-1', expires));
    expect(isJoinTokenShape(joinToken('s3cret', 'trip-1', expires))).toBe(true);
  });

  it('changes when the link is reset or the secret changes', () => {
    expect(joinToken('s3cret', 'trip-1', expires)).not.toBe(joinToken('s3cret', 'trip-1', '2026-11-17T23:59:59.124Z'));
    expect(joinToken('s3cret', 'trip-1', expires)).not.toBe(joinToken('other', 'trip-1', expires));
  });

  it('hashes to 64 hex characters', () => {
    expect(hashJoinToken('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('expires seven days after the trip ends', () => {
    expect(joinExpiry('2026-11-10', new Date('2026-10-01T00:00:00.123Z'))).toBe('2026-11-17T23:59:59.123Z');
  });
});
