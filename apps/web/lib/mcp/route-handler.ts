import { unstable_rethrow } from 'next/navigation';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { bearerToken, resolveCaller } from '@/lib/rules-api/auth';
import { jsonError } from '@/lib/rules-api/envelope';
import { enforceRateLimit } from '@/lib/rules-api/rate-limit';
import { getLibrary, LibraryLoadError } from '@/lib/rules/library';
import type { ApiCaller } from '@/lib/rules-api/types';
import { requestContext } from './client-info';
import { SERVER_INFO, SERVER_INSTRUCTIONS } from './instructions';
import { registerRuleTools } from './tools';

const mcpHandler = createMcpHandler(
  (server) => {
    registerRuleTools(server);
  },
  // maxSubscriptions 0: no subscriptions/listen streams (they cost function time and are never used).
  { serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS, maxSubscriptions: 0 },
);

// handleMcp resolves the caller once (the single auth parse); verifyToken only reads it back.
const resolvedCallers = new WeakMap<Request, ApiCaller>();

// Anonymous callers pass through; a valid partner key populates ctx.http.authInfo.
const authedHandler = withMcpAuth(
  mcpHandler,
  (req) => {
    const caller = resolvedCallers.get(req);
    if (caller?.tier !== 'partner') return undefined;
    return {
      token: bearerToken(req) ?? '',
      clientId: caller.partnerId,
      scopes: ['rules:read'],
      extra: { keyId: caller.keyId, rateLimitRule: caller.rateLimitRule },
    };
  },
  { required: false },
);

export async function handleMcp(req: Request): Promise<Response> {
  let caller: ApiCaller | 'invalid';
  try {
    caller = await resolveCaller(req);
  } catch (error) {
    // Next's prerender bail-out must propagate, or the route could be treated as static.
    unstable_rethrow(error);
    // Message only: the error must never carry the key into logs.
    console.error('[mcp] key lookup failed:', error instanceof Error ? error.message : 'unknown error');
    return jsonError(503, 'unavailable', 'The service is temporarily unavailable.');
  }

  if (caller === 'invalid') {
    // Failed lookups are never cached, so limit them as anonymous before answering.
    const limited = await enforceRateLimit(req, { tier: 'anonymous' }, 'mcp');
    if (limited) return limited;
    // An invalid key is a 401 here, not a silent downgrade to anonymous.
    return jsonError(401, 'invalid_key', 'The API key is invalid or revoked.', {
      headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
    });
  }

  const limited = await enforceRateLimit(req, caller, 'mcp');
  if (limited) return limited;

  try {
    getLibrary();
  } catch (error) {
    if (error instanceof LibraryLoadError) {
      return jsonError(503, 'library_unavailable', 'The rules library is unavailable.');
    }
    throw error;
  }

  resolvedCallers.set(req, caller);
  return requestContext.run({ userAgent: req.headers.get('user-agent') }, () => authedHandler(req));
}
