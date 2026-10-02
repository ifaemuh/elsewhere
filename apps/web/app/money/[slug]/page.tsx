import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MoneyContent } from '@/components/money/money-content';
import { configuredOffers } from '@/lib/affiliate/offers';
import { findMoneyRule, moneyRuleParams } from '@/lib/rules/accessors';
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
        <MoneyBody slug={slug} />
      </Suspense>
    </main>
  );
}

// The library and the offer config change only by deploying, so known slugs prerender fully.
function MoneyBody({ slug }: { slug: string }) {
  const library = getLibrary();
  const rule = findMoneyRule(library, slug);
  if (!rule) notFound();
  return <MoneyContent library={library} rule={rule} offers={configuredOffers()} />;
}
