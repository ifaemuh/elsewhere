import Link from 'next/link';
import type { Rule, RulesLibrary } from '@elsewhere/rules/core';
import { Character } from '@/components/character';
import { AffiliateOffers } from '@/components/money/affiliate-offers';
import { RuleArticle } from '@/components/rules/rule-article';
import { FTC_DISCLOSURE, offersForRule, type AffiliateOffer } from '@/lib/affiliate/offers';
import { needsReviewSince, sourcesFor } from '@/lib/rules/accessors';

/** Offers and the disclosure are paused while a rule is being re-checked: we don't sell against it. */
export function MoneyContent({ library, rule, offers }: { library: RulesLibrary; rule: Rule; offers: AffiliateOffer[] }) {
  const reviewSince = needsReviewSince(rule);
  const shown = reviewSince ? [] : offersForRule(rule, offers);
  return (
    <>
      {shown.length > 0 ? <p className="rounded-lg bg-[#efe9da] px-4 py-3 text-sm">{FTC_DISCLOSURE}</p> : null}
      <Link href="/rules" className="mt-6 inline-block text-sm text-[#4b5745] hover:underline">
        ← All rules
      </Link>
      <RuleArticle
        rule={rule}
        sources={sourcesFor(library, rule)}
        reviewSince={reviewSince}
        art={<Character character={rule.lead_character} width={180} priority />}
      />
      {reviewSince && offersForRule(rule, offers).length > 0 ? (
        <p className="mt-10 text-sm text-[#4b5745]">Offers are paused while we re-check this rule.</p>
      ) : null}
      <AffiliateOffers offers={shown} />
    </>
  );
}
