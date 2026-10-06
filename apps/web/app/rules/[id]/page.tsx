import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Character } from '@/components/character';
import { FollowCard } from '@/components/follow-card';
import { FunnelBeacon } from '@/components/funnel/beacon';
import { RuleArticle } from '@/components/rules/rule-article';
import { needsReviewSince, resolveRulePage, sourcesFor, staticRuleParams } from '@/lib/rules/accessors';
import { getLibrary } from '@/lib/rules/library';

type Params = Promise<{ id: string }>;

export function generateStaticParams() {
  return staticRuleParams(getLibrary());
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const resolution = resolveRulePage(getLibrary(), id);
  if (resolution.kind === 'gone') return { title: 'Travel rules · Elsewhere', robots: { index: false } };
  if (resolution.kind !== 'page') return { title: 'Travel rules · Elsewhere' };
  return { title: `${resolution.rule.title} · Elsewhere`, description: resolution.rule.summary };
}

// Unknown and draft ids are rejected before any Suspense boundary so they get a real 404.
// (dynamicParams = false is not supported with Cache Components.)
export default async function RulePage({ params }: { params: Params }) {
  const { id } = await params;
  const resolution = resolveRulePage(getLibrary(), id);
  if (resolution.kind === 'missing') notFound();
  // Retired rules with a replacement are 308'd by next.config.ts; this is only a fallback.
  if (resolution.kind === 'redirect') permanentRedirect(resolution.to);
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <Link href="/rules" className="text-sm text-[#4b5745] hover:underline">
        ← All rules
      </Link>
      <Suspense fallback={<p className="mt-8 text-[#4b5745]">Loading the rule…</p>}>
        <RuleContent id={id} />
      </Suspense>
      <Suspense fallback={null}>
        <RuleFooter params={params} />
      </Suspense>
    </main>
  );
}

async function RuleContent({ id }: { id: string }) {
  const library = getLibrary();
  const resolution = resolveRulePage(library, id);
  if (resolution.kind === 'missing') notFound();
  if (resolution.kind === 'redirect') permanentRedirect(resolution.to);
  if (resolution.kind === 'gone') {
    return (
      <section className="mt-8">
        <h1 className="text-3xl font-bold">This rule no longer applies</h1>
        <p className="mt-3 text-[#4b5745]">
          The source it quoted changed or was withdrawn. <Link href="/rules" className="underline">See the current rules.</Link>
        </p>
      </section>
    );
  }
  const { rule } = resolution;
  return (
    <RuleArticle
      rule={rule}
      sources={sourcesFor(library, rule)}
      reviewSince={needsReviewSince(rule)}
      art={<Character character={rule.lead_character} width={180} priority />}
    />
  );
}

// Every rule state with a page (verified, needs_review, gone) records the view and points to the account; only 404/308 have no page.
async function RuleFooter({ params }: { params: Params }) {
  const { id } = await params;
  const resolution = resolveRulePage(getLibrary(), id);
  const ruleId = resolution.kind === 'page' ? resolution.rule.id : resolution.kind === 'gone' ? id : null;
  if (!ruleId) return null;
  return (
    <>
      <FunnelBeacon event="rule_page_view" ruleId={ruleId} />
      <FollowCard />
    </>
  );
}
