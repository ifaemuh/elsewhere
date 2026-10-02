import type { Domain, Rule, RuleSourceRef, RuleStatus, RulesLibrary, Source } from '@elsewhere/rules';

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
