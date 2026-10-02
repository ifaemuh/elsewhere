import 'server-only';
import { createHash, createHmac } from 'node:crypto';

let warned = false;

/**
 * Rate-limit key for the destination of a sign-in code. An HMAC under a server secret, so the key reveals
 * nothing about a phone number or email even to someone who can read Firewall logs. Without the secret it
 * falls back to an unsalted sha256, with a one-time warning.
 */
export function contactRateLimitKey(contact: string): string {
  const secret = process.env.RATE_LIMIT_KEY_SECRET;
  if (!secret) {
    if (!warned) {
      warned = true;
      console.warn('RATE_LIMIT_KEY_SECRET is not set; keying code-send limits on an unsalted hash');
    }
    return createHash('sha256').update(contact).digest('hex');
  }
  return createHmac('sha256', secret).update(contact).digest('hex');
}

/** Test seam: forget that the missing-secret warning was already logged. */
export function resetContactKeyWarning(): void {
  warned = false;
}
