import 'server-only';
import { cookies } from 'next/headers';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from './anonymous-id';
import { recordEvent } from './events';
import { parseUtmCookie, pickUtm, UTM_COOKIE } from './utm';
import { assignVariant } from './variant';

const RULE_ID = /^[A-Za-z0-9._-]{1,120}$/;

/**
 * Server-side backstop for the client's offer_click, called when /start?rule=<id> renders, so a
 * modified click, a hard navigation, or a blocked script still counts. The daily unique index on
 * offer_click makes the client click and this call count once. Reads cookies: call inside <Suspense>.
 */
export async function recordOfferClickBackstop(
  ruleId: string | undefined,
  params: Record<string, string | string[] | undefined> = {},
): Promise<void> {
  if (!ruleId || !RULE_ID.test(ruleId)) return;
  const store = await cookies();
  const anonymousId = store.get(ANONYMOUS_ID_COOKIE)?.value;
  if (!isAnonymousId(anonymousId)) return;
  // proxy.ts does not capture UTM, so a direct landing's tags come from the URL; else the stored cookie.
  const flat = Object.fromEntries(Object.entries(params).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const fresh = pickUtm(flat);
  await recordEvent({
    anonymousId,
    event: 'offer_click',
    ruleId,
    variant: assignVariant(anonymousId),
    utm: Object.keys(fresh).length > 0 ? fresh : parseUtmCookie(store.get(UTM_COOKIE)?.value),
  });
}
