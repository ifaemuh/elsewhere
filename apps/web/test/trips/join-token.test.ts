import { describe, expect, it } from 'vitest';
import { hashJoinToken, isJoinTokenShape, joinExpiry, joinToken, nextJoinExpiry } from '@/lib/trips/join-token';

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

  it('rotates on every reset, even when two resets share a millisecond remainder', () => {
    const first = nextJoinExpiry('2026-11-10', null, new Date('2026-10-01T00:00:00.123Z'));
    const second = nextJoinExpiry('2026-11-10', first, new Date('2026-10-02T00:00:00.123Z'));
    expect(second).not.toBe(first);
    expect(joinToken('s3cret', 'trip-1', second)).not.toBe(joinToken('s3cret', 'trip-1', first));
  });

  it('reads a Postgres timestamp back to the same token', () => {
    const iso = '2026-11-17T23:59:59.123Z';
    expect(joinToken('s3cret', 'trip-1', '2026-11-17T23:59:59.123+00:00')).toBe(joinToken('s3cret', 'trip-1', iso));
  });
});

describe('isJoinTokenShape', () => {
  it('accepts exactly 22 url-safe characters', () => {
    expect(isJoinTokenShape('a'.repeat(22))).toBe(true);
    expect(isJoinTokenShape('A_-9'.repeat(5) + 'ab')).toBe(true);
  });

  it.each(['', 'short', 'a'.repeat(21), 'a'.repeat(23), `${'a'.repeat(21)}/`, `${'a'.repeat(21)} `, `${'a'.repeat(21)}\n`, `${'a'.repeat(21)}é`])('rejects %j', (token) => {
    expect(isJoinTokenShape(token)).toBe(false);
  });
});
