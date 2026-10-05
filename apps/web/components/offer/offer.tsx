import { cookies } from 'next/headers';
import { FunnelBeacon } from '@/components/funnel/beacon';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { assignVariant, variantPriceLabel } from '@/lib/funnel/variant';
import { OfferCard } from './offer-card';

/** Reads the visitor cookie, so render it inside <Suspense>. */
export async function Offer({ ruleId }: { ruleId: string }) {
  const anonymousId = (await cookies()).get(ANONYMOUS_ID_COOKIE)?.value;
  // Unreachable once the proxy has set the cookie. Fallback shows the higher price and is NOT recorded:
  // the beacon's server action drops events without a valid cookie, so no assignment is made up.
  const variant = isAnonymousId(anonymousId) ? assignVariant(anonymousId) : 'p19';
  return (
    <>
      <FunnelBeacon event="rule_page_view" ruleId={ruleId} />
      <OfferCard ruleId={ruleId} priceLabel={variantPriceLabel(variant)} />
    </>
  );
}
