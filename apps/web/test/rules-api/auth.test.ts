import { beforeEach, describe, expect, it } from 'vitest';
import { bearerToken, clearKeyCache, generateKey, hashKey, KEY_PATTERN, lookupKey, resolveCaller } from '@/lib/rules-api/auth';
import { fakeDb } from '../helpers/supabase-fake';

const KEY = 'els_' + 'A1b2C3d4'.repeat(4);

function req(authorization?: string): Request {
  return new Request('https://elsewhere.test/api/rules', { headers: authorization ? { authorization } : {} });
}

beforeEach(() => {
  clearKeyCache();
});

describe('keys', () => {
  it('hashes with sha256 hex', () => {
    expect(hashKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('generates keys that match the key pattern and differ', () => {
    const a = generateKey();
    expect(a).toMatch(KEY_PATTERN);
    expect(generateKey()).not.toBe(a);
  });

  it('reads bearer tokens case-insensitively', () => {
    expect(bearerToken(req(`Bearer ${KEY}`))).toBe(KEY);
    expect(bearerToken(req(`bearer   ${KEY}`))).toBe(KEY);
    expect(bearerToken(req('Basic abc'))).toBeNull();
    expect(bearerToken(req())).toBeNull();
  });
});

describe('resolveCaller', () => {
  it('treats no key as anonymous', async () => {
    expect(await resolveCaller(req())).toEqual({ tier: 'anonymous' });
  });

  it('rejects a malformed key without a database lookup', async () => {
    expect(await resolveCaller(req('Bearer not-a-key'))).toBe('invalid');
  });

  it('resolves an active key to its partner', async () => {
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: null });
    expect(await resolveCaller(req(`Bearer ${KEY}`))).toEqual({
      tier: 'partner',
      keyId: 'key-1',
      partnerId: 'acme',
      rateLimitRule: 'rules-partner',
    });
  });

  it('rejects a revoked key', async () => {
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: '2026-10-01T00:00:00Z' });
    expect(await resolveCaller(req(`Bearer ${KEY}`))).toBe('invalid');
  });

  it('rejects a well-formed key that is unknown (never anonymous)', async () => {
    expect(await resolveCaller(req(`Bearer ${KEY}`))).toBe('invalid');
  });

  it('does not touch the database for a malformed key', async () => {
    fakeDb.apiKeys = new Proxy([], { get() { throw new Error('db touched'); } }) as never;
    expect(await resolveCaller(req('Bearer els_short'))).toBe('invalid');
  });

  it('treats a key with a future revoked_at as active until then, even when cached', async () => {
    const t0 = Date.parse('2026-10-01T00:00:00Z');
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: '2026-10-01T00:00:30Z' });
    expect(await lookupKey(KEY, t0)).not.toBeNull();
    expect(await lookupKey(KEY, t0 + 31_000)).toBeNull();
  });

  it('does not cache misses, so new keys work immediately', async () => {
    expect(await lookupKey(KEY, 1_000_000)).toBeNull();
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: null });
    expect(await lookupKey(KEY, 1_000_001)).not.toBeNull();
  });

  it('caches lookups for 60 seconds', async () => {
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: null });
    const t0 = 1_000_000;
    expect(await lookupKey(KEY, t0)).not.toBeNull();
    fakeDb.apiKeys = [];
    expect(await lookupKey(KEY, t0 + 59_000)).not.toBeNull();
    expect(await lookupKey(KEY, t0 + 61_000)).toBeNull();
  });
});
