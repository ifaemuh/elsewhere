import type { Domain, Rule, RuleSourceRef, RuleStatus, RulesLibrary, Source } from '@elsewhere/rules/core';

export const PUBLISHED_STATUSES: readonly RuleStatus[] = ['verified', 'needs_review'];
export const DOMAIN_ORDER: readonly Domain[] = ['flights', 'documents', 'money', 'hotels'];
export const DOMAIN_LABELS: Record<Domain, string> = {
  flights: 'Flights',
  documents: 'Documents',
  money: 'Money and perks',
  hotels: 'Hotels and booking',
};

export type RulePageResolution =
  | { kind: 'page'; rule: Rule }
  | { kind: 'redirect'; to: string }
  | { kind: 'gone' }
  | { kind: 'missing' };

const isPublished = (rule: Rule) => PUBLISHED_STATUSES.includes(rule.status);

export function publishedRules(library: RulesLibrary): Rule[] {
  return library.rules
    .filter(isPublished)
    .sort((a, b) => DOMAIN_ORDER.indexOf(a.domain) - DOMAIN_ORDER.indexOf(b.domain) || a.title.localeCompare(b.title));
}

/** Retired rules are prerendered too, so their URLs redirect or explain instead of 404ing. */
export function staticRuleIds(library: RulesLibrary): string[] {
  return library.rules.filter((rule) => rule.status !== 'draft').map((rule) => rule.id);
}

/** Id that matches no rule; prerendered only while the library is empty (it renders as a 404). */
export const EMPTY_LIBRARY_PLACEHOLDER_ID = '_none';

/**
 * Cache Components rejects a generateStaticParams that returns nothing, so an empty library
 * yields one placeholder param. It resolves to 'missing' and never appears as a real URL.
 */
export function staticRuleParams(library: RulesLibrary): { id: string }[] {
  const ids = staticRuleIds(library);
  return (ids.length > 0 ? ids : [EMPTY_LIBRARY_PLACEHOLDER_ID]).map((id) => ({ id }));
}

export function findRule(library: RulesLibrary, id: string): Rule | null {
  return library.rules.find((rule) => rule.id === id) ?? null;
}

export function resolveRulePage(library: RulesLibrary, id: string): RulePageResolution {
  const rule = findRule(library, id);
  if (!rule || rule.status === 'draft') return { kind: 'missing' };
  if (rule.status === 'retired') {
    const replacement = rule.replaced_by ? findRule(library, rule.replaced_by) : null;
    return replacement && isPublished(replacement) ? { kind: 'redirect', to: `/rules/${replacement.id}` } : { kind: 'gone' };
  }
  return { kind: 'page', rule };
}

/** Real HTTP 308s for retired rules with a published replacement; next.config.ts feeds these to redirects(). */
export function retiredRedirects(library: RulesLibrary): { source: string; destination: string; permanent: true }[] {
  const out: { source: string; destination: string; permanent: true }[] = [];
  for (const rule of library.rules) {
    if (rule.status !== 'retired') continue;
    const resolution = resolveRulePage(library, rule.id);
    if (resolution.kind === 'redirect') out.push({ source: `/rules/${rule.id}`, destination: resolution.to, permanent: true });
  }
  return out;
}

export function needsReviewSince(rule: Rule): string | null {
  if (rule.status !== 'needs_review') return null;
  let since: string | null = null;
  for (const entry of rule.history) {
    since = entry.status === 'needs_review' ? (since ?? entry.date) : null;
  }
  return since;
}

export function sourcesFor(library: RulesLibrary, rule: Rule): { ref: RuleSourceRef; source: Source | null }[] {
  return rule.sources.map((ref) => ({ ref, source: library.sources[ref.source] ?? null }));
}

export function verifiedRulesIn(library: RulesLibrary, domain: Domain): Rule[] {
  return library.rules.filter((rule) => rule.status === 'verified' && rule.domain === domain);
}

/** Slug that matches no rule; prerendered only while there are no verified money rules (renders as a 404). */
export const EMPTY_MONEY_PLACEHOLDER_SLUG = 'no-money-rules';

/** A money page slug is a rule id. Cache Components rejects an empty generateStaticParams, hence the placeholder. */
export function moneyRuleParams(library: RulesLibrary): { slug: string }[] {
  const slugs = verifiedRulesIn(library, 'money').map((rule) => rule.id);
  return (slugs.length > 0 ? slugs : [EMPTY_MONEY_PLACEHOLDER_SLUG]).map((slug) => ({ slug }));
}

export function findMoneyRule(library: RulesLibrary, slug: string): Rule | null {
  return verifiedRulesIn(library, 'money').find((rule) => rule.id === slug) ?? null;
}
