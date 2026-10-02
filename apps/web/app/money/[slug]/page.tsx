import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Character } from '@/components/character';
import { AffiliateOffers } from '@/components/money/affiliate-offers';
import { RuleArticle } from '@/components/rules/rule-article';
import { configuredOffers, FTC_DISCLOSURE, offersForRule } from '@/lib/affiliate/offers';
import { findMoneyRule, moneyRuleParams, needsReviewSince, sourcesFor } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return moneyRuleParams(getLibrary());
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const rule = findMoneyRule(getLibrary(), (await params).slug);
  return rule ? { title: `${rule.title} · Elsewhere`, description: rule.summary } : { title: 'Elsewhere' };
}

// Unknown slugs are rejected before any Suspense boundary so they get a real 404.
export default async function MoneyPage({ params }: { params: Params }) {
  const { slug } = await params;
  if (!findMoneyRule(getLibrary(), slug)) notFound();
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Suspense fallback={<p className="text-[#4b5745]">Loading…</p>}>
        <MoneyContent slug={slug} />
      </Suspense>
    </main>
  );
}

// The library and the offer config change only by deploying, so known slugs prerender fully.
function MoneyContent({ slug }: { slug: string }) {
  const library = getLibrary();
  const rule = findMoneyRule(library, slug);
  if (!rule) notFound();
  const offers = offersForRule(rule, configuredOffers());
  return (
    <>
      {offers.length > 0 ? <p className="rounded-lg bg-[#efe9da] px-4 py-3 text-sm">{FTC_DISCLOSURE}</p> : null}
      <Link href="/rules" className="mt-6 inline-block text-sm text-[#4b5745] hover:underline">
        ← All rules
      </Link>
      <RuleArticle
        rule={rule}
        sources={sourcesFor(library, rule)}
        reviewSince={needsReviewSince(rule)}
        art={<Character character={rule.lead_character} width={180} priority />}
      />
      <AffiliateOffers offers={offers} />
    </>
  );
}
