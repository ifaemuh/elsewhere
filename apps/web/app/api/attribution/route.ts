import type { NextRequest } from 'next/server';
import { authorizedFoundry, parseSince, toAttributionResponse } from '@/lib/attribution/summary';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest): Promise<Response> {
  if (!authorizedFoundry(request.headers.get('authorization'), process.env.FOUNDRY_ATTRIBUTION_KEY)) {
    return new Response('unauthorized', { status: 401 });
  }
  const since = parseSince(request.nextUrl.searchParams.get('since'));
  if (!since) return Response.json({ error: 'since must be a date in YYYY-MM-DD form' }, { status: 400 });
  const { data, error } = await createAdminClient().rpc('attribution_summary', { p_since: `${since}T00:00:00Z` });
  if (error) return Response.json({ error: 'attribution summary failed' }, { status: 500 });
  return Response.json(toAttributionResponse(since, data ?? []), { headers: { 'cache-control': 'no-store' } });
}
