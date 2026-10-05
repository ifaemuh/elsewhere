import { NextResponse, type NextRequest } from 'next/server';
import { parsePostLink, redirectUrl } from '@/lib/attribution/link';
import { recordTouchpoint } from '@/lib/attribution/touchpoints';
import { ANONYMOUS_ID_COOKIE, isAnonymousId, newAnonymousId, persistAnonymousId } from '@/lib/funnel/anonymous-id';
import { UTM_COOKIE, UTM_COOKIE_OPTIONS } from '@/lib/funnel/utm';

export async function GET(request: NextRequest, { params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params;
  const link = parsePostLink(postId, request.nextUrl.searchParams);
  if (!link) return NextResponse.redirect(new URL('/rules', request.url), 307);

  const existing = request.cookies.get(ANONYMOUS_ID_COOKIE)?.value;
  const anonymousId = isAnonymousId(existing) ? existing : newAnonymousId();
  await recordTouchpoint(anonymousId, link);

  const response = NextResponse.redirect(redirectUrl(request.url, link), 307);
  // The landing page has no beacon, so persist the tags here for trip_started/checkout_started.
  response.cookies.set(UTM_COOKIE, JSON.stringify(link.utm), UTM_COOKIE_OPTIONS);
  persistAnonymousId(response, anonymousId === existing ? null : anonymousId);
  return response;
}
