import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ApiCaller } from './types';

export const KEY_PATTERN = /^els_[A-Za-z0-9]{32}$/;
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
/** Positive lookups only. A revocation takes effect within this window on each warm instance. */
const CACHE_MS = 60_000;

export interface KeyRecord {
  keyId: string;
  partnerId: string;
  rateLimitRule: string;
}

const cache = new Map<string, { value: KeyRecord; expires: number }>();

export function bearerToken(req: Request): string | null {
  const match = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateKey(): string {
  const bytes = randomBytes(32);
  let body = '';
  for (const byte of bytes) body += BASE62[byte % BASE62.length];
  return `els_${body}`;
}

export function clearKeyCache(): void {
  cache.clear();
}

export async function lookupKey(key: string, now: number = Date.now()): Promise<KeyRecord | null> {
  const hash = hashKey(key);
  const hit = cache.get(hash);
  if (hit && hit.expires > now) return hit.value;
  cache.delete(hash);

  const { data, error } = await createAdminClient()
    .from('api_keys')
    .select('id, partner_id, rate_limit_rule, revoked_at')
    .eq('key_hash', hash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // revoked_at in the past (or now) means revoked; a future value is a scheduled revocation.
  const revokedAt = data.revoked_at ? Date.parse(data.revoked_at) : null;
  if (revokedAt !== null && revokedAt <= now) return null;

  const value: KeyRecord = { keyId: data.id, partnerId: data.partner_id, rateLimitRule: data.rate_limit_rule };
  // Misses are never cached, so new keys work at once. Hits expire no later than a scheduled revocation.
  cache.set(hash, { value, expires: Math.min(now + CACHE_MS, revokedAt ?? Infinity) });
  return value;
}

export async function resolveCaller(req: Request): Promise<ApiCaller | 'invalid'> {
  const token = bearerToken(req);
  if (!token) return { tier: 'anonymous' };
  if (!KEY_PATTERN.test(token)) return 'invalid';
  const record = await lookupKey(token);
  return record ? { tier: 'partner', ...record } : 'invalid';
}