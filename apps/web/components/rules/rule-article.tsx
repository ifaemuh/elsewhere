import type { ReactNode } from 'react';
import type { Rule, RuleSourceRef, Source } from '@elsewhere/rules/core';
import { DOMAIN_LABELS } from '@/lib/rules/accessors';
import { entitlementLines, formatIsoDate } from '@/lib/rules/present';

export function RuleArticle({
  rule,
  sources,
  reviewSince,
  art,
}: {
  rule: Rule;
  sources: { ref: RuleSourceRef; source: Source | null }[];
  reviewSince: string | null;
  art?: ReactNode;
}) {
  const amounts = entitlementLines(rule);
  return (
    <article className="mt-6">
      {reviewSince ? (
        <p role="status" className="mb-6 rounded-lg border border-[#e7c37a] bg-[#fdf3dc] px-4 py-3 text-sm">
          Being re-checked since {formatIsoDate(reviewSince)}. A source this rule quotes changed, and we are confirming the details.
        </p>
      ) : null}
      <div className="flex items-start gap-6">
        <div className="flex-1">
          <p className="text-sm font-semibold uppercase tracking-widest text-[#b4532a]">{DOMAIN_LABELS[rule.domain]}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{rule.title}</h1>
          <p className="mt-4 text-lg text-[#4b5745]">{rule.summary}</p>
        </div>
        {art ? <div className="hidden shrink-0 sm:block">{art}</div> : null}
      </div>

      {amounts.length > 0 || rule.entitlement.timing ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">What you’re owed</h2>
          <ul className="mt-2 list-disc pl-6">
            {amounts.map((line) => (
              <li key={line}>{line}</li>
            ))}
            {rule.entitlement.timing ? <li>{rule.entitlement.timing}</li> : null}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">How to claim it</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-6">
          {rule.how_to_claim.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      {rule.exceptions.length > 0 ? (
        <section className="mt-8">
          <h2 className="text-xl font-semibold">Exceptions</h2>
          <ul className="mt-2 list-disc pl-6">
            {rule.exceptions.map((exception) => (
              <li key={exception}>{exception}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-xl font-semibold">Sources</h2>
        <ul className="mt-2 space-y-4">
          {sources.map(({ ref, source }) => (
            <li key={ref.id}>
              {source ? (
                <a href={source.url} rel="noopener" className="font-medium underline">
                  {source.url}
                </a>
              ) : (
                <span className="font-medium">{ref.source}</span>
              )}
              {ref.quotes.map((quote) => (
                <blockquote key={quote.text} className="mt-2 border-l-4 border-[#d9d3c2] pl-4 text-[#4b5745]">
                  “{quote.text}”
                </blockquote>
              ))}
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-10 text-sm text-[#4b5745]">
        {rule.last_verified ? `Last verified ${formatIsoDate(rule.last_verified)}. ` : ''}Not legal advice — the sources above are the authority.
      </p>
    </article>
  );
}
