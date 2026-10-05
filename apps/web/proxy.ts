import type { NextRequest } from 'next/server';
import { assignAnonymousId, persistAnonymousId } from '@/lib/funnel/anonymous-id';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const newId = assignAnonymousId(request);
  const response = await updateSession(request);
  persistAnonymousId(response, newId);
  return response;
}

// Excluded: static assets, the workflow and webhook endpoints, and the public Rules API/MCP routes.
// Those are sessionless: the proxy's anonymous-id Set-Cookie would block CDN caching of their
// `public, s-maxage` responses, and it would make them depend on Supabase being reachable.
// The /rules/<id> pages are not excluded and stay covered.
export const config = {
  matcher: [
    {
      source:
        '/((?!_next/static|_next/image|favicon.ico|characters/|\\.well-known/workflow/|api/webhooks/|api/cron/|api/mcp|api/rules).*)',
    },
  ],
};
