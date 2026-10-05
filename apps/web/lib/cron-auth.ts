import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (value: string) => createHash('sha256').update(value).digest();

/**
 * True only for `Authorization: Bearer <CRON_SECRET>`. An unset or empty secret refuses everyone, so "Bearer undefined"
 * is never a valid token. Hashing first gives timingSafeEqual equal-length inputs, so the comparison is constant time.
 */
export function isCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return timingSafeEqual(digest(request.headers.get('authorization') ?? ''), digest(`Bearer ${secret}`));
}
