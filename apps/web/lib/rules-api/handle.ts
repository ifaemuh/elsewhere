import { unstable_rethrow } from 'next/navigation';
import type { RulesLibrary } from '@elsewhere/rules/core';
import { getLibrary, LibraryLoadError } from '@/lib/rules/library';
import { scheduleEvent, type RulesApiEvent } from './analytics';
import { resolveCaller } from './auth';
import { jsonError } from './envelope';
import { enforceRateLimit } from './rate-limit';
import type { ApiCaller, LinkAttribution } from './types';

export interface RulesApiContext {
  req: Request;
  library: RulesLibrary;
  caller: ApiCaller;
  attribution: LinkAttribution;
  /** Resolved dynamic route params ({} for static routes). */
  params: Record<string, string>;
}

export type EventFields = Partial<
  Pick<RulesApiEvent, 'rule_ids' | 'fact_names' | 'event_type' | 'missing_facts' | 'query' | 'result_count'>
>;

export interface RulesApiResult {
  response: Response;
  event?: EventFields;
}

/** The second argument Next 16 passes to a route handler. */
export interface RouteContext {
  params: Promise<Record<string, string>>;
}

/** Auth → rate limit → library → handler → analytics, for every rules API route. */
export function withRulesApi(
  endpoint: string,
  run: (ctx: RulesApiContext) => RulesApiResult | Promise<RulesApiResult>,
): (req: Request, route?: RouteContext) => Promise<Response> {
  return async function handler(req: Request, route?: RouteContext): Promise<Response> {
    const started = Date.now();

    let caller: ApiCaller | 'invalid';
    try {
      caller = await resolveCaller(req);
    } catch (error) {
      // Next's prerender bail-out must propagate, or the route could be treated as static.
      unstable_rethrow(error);
      // Message only: the error must never carry the key into logs.
      console.error('[rules-api] key lookup failed:', error instanceof Error ? error.message : 'unknown error');
      return jsonError(503, 'unavailable', 'The service is temporarily unavailable.');
    }

    if (caller === 'invalid') {
      // Failed lookups are never cached, so limit them as anonymous before answering.
      const limited = await enforceRateLimit(req, { tier: 'anonymous' }, 'api');
      if (limited) return limited;
      return jsonError(401, 'invalid_key', 'The API key is invalid or revoked.');
    }

    const limited = await enforceRateLimit(req, caller, 'api');
    if (limited) return limited;

    let library: RulesLibrary;
    try {
      library = getLibrary();
    } catch (error) {
      if (error instanceof LibraryLoadError) {
        return jsonError(503, 'library_unavailable', 'The rules library is unavailable.');
      }
      throw error;
    }

    const attribution: LinkAttribution = {
      source: 'api',
      medium: caller.tier === 'partner' ? caller.partnerId : 'anonymous',
    };
    const params = route ? await route.params : {};
    const { response, event = {} } = await run({ req, library, caller, attribution, params });

    scheduleEvent({
      surface: 'api',
      endpoint,
      status: response.status,
      client_name: req.headers.get('user-agent'),
      client_version: null,
      tier: caller.tier,
      key_id: caller.tier === 'partner' ? caller.keyId : null,
      rule_ids: [],
      fact_names: [],
      event_type: null,
      missing_facts: [],
      query: null,
      result_count: 0,
      ...event,
      library_version: library.library_version,
      latency_ms: Date.now() - started,
    });
    return response;
  };
}
