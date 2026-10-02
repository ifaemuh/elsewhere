import type { NextRequest } from 'next/server';
import { assignAnonymousId, persistAnonymousId } from '@/lib/funnel/anonymous-id';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  const newId = assignAnonymousId(request);
  const response = await updateSession(request);
  persistAnonymousId(response, newId);
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|characters/|\\.well-known/workflow/|api/webhooks/).*)',
    },
  ],
};
