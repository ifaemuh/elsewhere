import { unstable_rethrow } from 'next/navigation';
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { lookupKey, resolveCaller } from '@/lib/rules-api/auth';
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
  { serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS },
);

// Anonymous callers pass through; a valid partner key populates ctx.http.authInfo.
const authedHandler = withMcpAuth(
  mcpHandler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const record = await lookupKey(bearerToken);
    if (!record) return undefined;
    return {
      token: bearerToken,
      clientId: record.partnerId,
      scopes: ['rules:read'],
      extra: { keyId: record.keyId, rateLimitRule: record.rateLimitRule },
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

  return requestContext.run({ userAgent: req.headers.get('user-agent') }, () => authedHandler(req));
}
