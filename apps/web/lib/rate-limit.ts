import 'server-only';
import { checkRateLimit } from '@vercel/firewall';
import { headers } from 'next/headers';

/**
 * Vercel Firewall rate-limit rules. codeSend is keyed by IP (the default); codeSendContact by a hash of the
 * contact a code goes to; tripCreate by user id. Task 18 creates all three before trips open.
 */
export const RATE_LIMIT_RULES = { codeSend: 'auth-code-send', codeSendContact: 'auth-code-send-contact', tripCreate: 'trips-create' } as const;
export type RateLimitRule = (typeof RATE_LIMIT_RULES)[keyof typeof RATE_LIMIT_RULES];

/**
 * True when this visitor has used up the rule. Off Vercel (dev, tests, the e2e server) there is no firewall,
 * so nothing is limited. A missing rule or a firewall error fails open, with a log: Supabase's own Auth
 * limits and Twilio's SMS pumping protection still stand behind it.
 */
export async function rateLimited(rule: RateLimitRule, key?: string): Promise<boolean> {
  if (process.env.VERCEL !== '1') return false;
  try {
    const { rateLimited: limited, error } = await checkRateLimit(rule, { headers: await headers(), ...(key ? { rateLimitKey: key } : {}) });
    if (error === 'not-found') console.warn(`rate limit rule "${rule}" is not configured in Vercel Firewall`);
    return limited || error === 'blocked';
  } catch (error) {
    // Log the message only, never the error object.
    console.error('rate limit check failed', rule, error instanceof Error ? error.message : 'unknown error');
    return false;
  }
}
