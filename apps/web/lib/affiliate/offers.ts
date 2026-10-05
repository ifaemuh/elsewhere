import type { Rule } from '@elsewhere/rules/core';

export interface AffiliateOffer {
  id: string;
  label: string;
  href: string;
  tags: string[];
  note?: string;
}

export const FTC_DISCLOSURE =
  'Elsewhere earns a commission if you sign up through some links on this page. It never changes what the rule says or which options we show.';

const OFFER_DEFINITIONS: { id: string; envVar: string; label: string; tags: string[]; note?: string }[] = [
  { id: 'card', envVar: 'AFFILIATE_CARD_URL', label: 'Compare travel cards with this protection', tags: ['card-benefit'], note: 'See each card’s rates and fees before you apply.' },
  { id: 'safetywing', envVar: 'AFFILIATE_SAFETYWING_URL', label: 'SafetyWing travel medical insurance', tags: ['travel-insurance'] },
  { id: 'world-nomads', envVar: 'AFFILIATE_WORLDNOMADS_URL', label: 'World Nomads travel insurance', tags: ['travel-insurance'] },
];

function httpsUrl(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname !== '' ? url.href : null;
  } catch {
    return null;
  }
}

export function configuredOffers(env: Record<string, string | undefined> = process.env): AffiliateOffer[] {
  return OFFER_DEFINITIONS.flatMap(({ envVar, ...offer }) => {
    const href = httpsUrl(env[envVar]);
    return href ? [{ ...offer, href }] : [];
  });
}

export function offersForRule(rule: Rule, offers: AffiliateOffer[]): AffiliateOffer[] {
  return offers.filter((offer) => offer.tags.some((tag) => rule.tags.includes(tag)));
}
