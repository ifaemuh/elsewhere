import { checkRateLimit } from '@vercel/firewall';
import { ipInCidrs } from './cidr';
import { jsonError } from './envelope';
import { bearerToken, isKeyCached } from './auth';
import type { ApiCaller } from './types';

export const RATE_LIMIT_RULES = { api: 'rules-api-anon', mcp: 'rules-mcp-anon', mcpPlatform: 'rules-mcp-platform' } as const;
export const RETRY_AFTER_SECONDS = 60;

/** Known AI-platform connector ranges (MCP_PLATFORM_CIDRS) share a higher MCP limit than a single IP. */
function anonymousRule(req: Request, surface: 'api' | 'mcp'): string {
  if (surface === 'mcp') {
    const cidrs = (process.env.MCP_PLATFORM_CIDRS ?? '').split(',').map((c) => c.trim()).filter(Boolean);
    if (cidrs.length && ipInCidrs(req.headers.get('x-real-ip'), cidrs)) return RATE_LIMIT_RULES.mcpPlatform;
  }
  return RATE_LIMIT_RULES[surface];
}

/**
 * Credentials that are not in the positive key cache cost a database lookup (misses are never cached),
 * so they are limited as anonymous BEFORE that lookup. Returns null when no limit applies yet.
 */
export async function limitUncachedKey(req: Request, surface: 'api' | 'mcp'): Promise<Response | null> {
  if (!req.headers.get('authorization')?.trim()) return null;
  const token = bearerToken(req);
  if (token && isKeyCached(token)) return null;
  return enforceRateLimit(req, { tier: 'anonymous' }, surface);
}

export async function enforceRateLimit(
  req: Request,
  caller: ApiCaller,
  surface: 'api' | 'mcp',
): Promise<Response | null> {
  if (process.env.VERCEL !== '1') return null;

  const ruleId = caller.tier === 'partner' ? caller.rateLimitRule : anonymousRule(req, surface);
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
