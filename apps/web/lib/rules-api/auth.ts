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

/** True when a warm positive-cache entry exists, so resolving this key costs no database lookup. */
export function isKeyCached(key: string, now: number = Date.now()): boolean {
  const hit = cache.get(hashKey(key));
  return !!hit && hit.expires > now;
}

export async function lookupKey(key: string, now: number = Date.now()): Promise<KeyRecord | null> {
  const hash = hashKey(key);
  const hit = cache.get(hash);
  if (hit && hit.expires > now) return hit.value;
  cache.delete(hash);

  const { data, error } = await createAdminClient()
    .from('api_keys')
    .select('id, partner_id, rate_limit_rule')
    .eq('key_hash', hash)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const value: KeyRecord = { keyId: data.id, partnerId: data.partner_id, rateLimitRule: data.rate_limit_rule };
  // Misses are never cached, so new keys work at once. A revocation lags by at most CACHE_MS per warm instance.
  cache.set(hash, { value, expires: now + CACHE_MS });
  return value;
}

export async function resolveCaller(req: Request): Promise<ApiCaller | 'invalid'> {
  // Anonymous only when no credentials were sent. Anything else that isn't a well-formed key is invalid.
  if (!req.headers.get('authorization')?.trim()) return { tier: 'anonymous' };
  const token = bearerToken(req);
  if (!token || !KEY_PATTERN.test(token)) return 'invalid';
  const record = await lookupKey(token);
  return record ? { tier: 'partner', ...record } : 'invalid';
}