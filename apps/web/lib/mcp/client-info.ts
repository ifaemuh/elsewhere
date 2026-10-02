import { AsyncLocalStorage } from 'node:async_hooks';
import { CLIENT_INFO_META_KEY, type ServerContext } from '@modelcontextprotocol/server';
import type { ApiCaller } from '@/lib/rules-api/types';

/** Per-HTTP-request data the MCP context doesn't carry. */
export const requestContext = new AsyncLocalStorage<{ userAgent: string | null }>();

export function clientFromContext(ctx: ServerContext): { name: string | null; version: string | null } {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const info = envelope?.[CLIENT_INFO_META_KEY] as { name?: unknown; version?: unknown } | undefined;
  if (info && typeof info.name === 'string') {
    return { name: info.name, version: typeof info.version === 'string' ? info.version : null };
  }
  return { name: requestContext.getStore()?.userAgent ?? null, version: null };
}

export function callerFromContext(ctx: ServerContext): ApiCaller {
  const auth = ctx.http?.authInfo;
  if (!auth) return { tier: 'anonymous' };
  return {
    tier: 'partner',
    keyId: String(auth.extra?.keyId ?? ''),
    partnerId: auth.clientId,
    rateLimitRule: String(auth.extra?.rateLimitRule ?? 'rules-partner'),
  };
}
