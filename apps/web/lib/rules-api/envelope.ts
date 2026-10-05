import type { RulesLibrary } from '@elsewhere/rules/core';
import { ATTRIBUTION, type ApiCaller, type Envelope } from './types';

export function envelope<T>(library: RulesLibrary, data: T): Envelope<T> {
  return {
    schema_version: library.schema_version,
    library_version: library.library_version,
    data,
    attribution: ATTRIBUTION,
  };
}

export function etagFor(library: RulesLibrary): string {
  return `"${library.library_version}"`;
}

export function cacheHeaders(caller: ApiCaller, cacheable: boolean): Record<string, string> {
  if (!cacheable) return { 'Cache-Control': 'no-store' };
  if (caller.tier === 'partner') {
    return { 'Cache-Control': 'private, max-age=0, must-revalidate', Vary: 'Authorization' };
  }
  return { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400', Vary: 'Authorization' };
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .includes(etag);
}

export function jsonOk(
  req: Request,
  library: RulesLibrary,
  body: unknown,
  caller: ApiCaller,
  opts: { cacheable?: boolean } = {},
): Response {
  const cacheable = opts.cacheable ?? true;
  const headers: Record<string, string> = {
    ...cacheHeaders(caller, cacheable),
    'X-Library-Version': library.library_version,
  };
  if (cacheable) {
    const etag = etagFor(library);
    headers.ETag = etag;
    if (matchesEtag(req.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: 304, headers });
    }
  }
  return Response.json(body, { status: 200, headers });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  opts: { library?: RulesLibrary; details?: unknown; headers?: Record<string, string> } = {},
): Response {
  const body = {
    schema_version: 1,
    library_version: opts.library?.library_version ?? null,
    error: { code, message, ...(opts.details !== undefined ? { details: opts.details } : {}) },
  };
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...opts.headers } });
}
