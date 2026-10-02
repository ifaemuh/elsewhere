import { checkRateLimit } from '@vercel/firewall';
import { jsonError } from './envelope';
import type { ApiCaller } from './types';

export const RATE_LIMIT_RULES = { api: 'rules-api-anon', mcp: 'rules-mcp-anon' } as const;
export const RETRY_AFTER_SECONDS = 60;

export async function enforceRateLimit(
  req: Request,
  caller: ApiCaller,
  surface: 'api' | 'mcp',
): Promise<Response | null> {
  if (process.env.VERCEL !== '1') return null;

  const ruleId = caller.tier === 'partner' ? caller.rateLimitRule : RATE_LIMIT_RULES[surface];
  let result: Awaited<ReturnType<typeof checkRateLimit>>;
  try {
    result = await checkRateLimit(ruleId, {
      request: req,
      ...(caller.tier === 'partner' ? { rateLimitKey: caller.keyId } : {}),
    });
  } catch (err) {
    // Fail open: the data is public and read-only, and platform DDoS protection still applies.
    console.error('[rules-api] rate limit check failed', { ruleId, message: err instanceof Error ? err.message : String(err) });
    return null;
  }
  const { rateLimited, error } = result;

  if (error === 'blocked') return jsonError(403, 'blocked', 'Request blocked by the firewall.');
  if (error === 'not-found') {
    console.warn(`[rules-api] rate limit rule "${ruleId}" is not configured in Vercel Firewall`);
    return null;
  }
  if (rateLimited) {
    return jsonError(429, 'rate_limited', `Too many requests. Retry after ${RETRY_AFTER_SECONDS} seconds.`, {
      headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) },
    });
  }
  return null;
}
