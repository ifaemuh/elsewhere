import { createHash, createHmac } from 'node:crypto';

/**
 * The token is derived, not stored: HMAC(secret, tripId:expiresAt). The database keeps only its hash,
 * so a database leak alone never reveals a working link. Resetting the expiry rotates the link.
 */
export function joinToken(secret: string, tripId: string, expiresAtIso: string): string {
  return createHmac('sha256', secret).update(`${tripId}:${new Date(expiresAtIso).toISOString()}`).digest('base64url').slice(0, 22);
}

export function hashJoinToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Trip end plus seven days, with the current millisecond folded in so a reset always rotates the token. */
export function joinExpiry(endDate: string, now: Date = new Date()): string {
  const base = new Date(`${endDate}T23:59:59.000Z`).getTime() + 7 * 24 * 60 * 60 * 1000;
  return new Date(base + (now.getTime() % 1000)).toISOString();
}

export function isJoinTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{22}$/.test(token);
}
