import type { Rule, RuleChange, RulesLibrary } from '@elsewhere/rules/core';
import { rulePageUrl } from './links';
import type { Citation, LinkAttribution, PublicRule, PublicStatus, RuleSummary } from './types';

export function isPublic(rule: Rule): boolean {
  return rule.status !== 'draft';
}

export function needsReviewSince(rule: Rule, changes: RuleChange[]): string {
  const change = changes.find((c) => c.rule_id === rule.id && c.to_status === 'needs_review');
  return (change?.date ?? rule.last_verified ?? 'recently').slice(0, 10);
}

export function citationsFor(rule: Rule, library: RulesLibrary): Citation[] {
  return rule.sources.flatMap((ref) => {
    const source = library.sources[ref.source];
    if (!source) return [];
    return ref.quotes.map((quote) => ({ url: source.url, kind: source.kind, quote: quote.text }));
  });
}

export function toPublicRule(rule: Rule, library: RulesLibrary, attribution: LinkAttribution): PublicRule {
  if (!isPublic(rule)) throw new Error(`Refusing to project draft rule ${rule.id}`);
  const pub: PublicRule = {
    id: rule.id,
    version: rule.version,
    status: rule.status as PublicStatus,
    domain: rule.domain,
    jurisdiction: rule.jurisdiction,
    title: rule.title,
    summary: rule.summary,
    entitlement: rule.entitlement,
    how_to_claim: { steps: rule.how_to_claim.steps },
    exceptions: rule.exceptions,
    citations: citationsFor(rule, library),
    last_verified: rule.last_verified,
    review_by: rule.review_by,
    page_url: rulePageUrl(rule.id, attribution),
  };
  if (rule.status === 'needs_review') {
    pub.notice = `Being re-checked since ${needsReviewSince(rule, library.changes)} after a source change.`;
  }
  if (rule.status === 'retired' && rule.replaced_by) {
    pub.replaced_by = rule.replaced_by;
  }
  return pub;
}

export function toRuleSummary(rule: Rule, library: RulesLibrary, attribution: LinkAttribution): RuleSummary {
  const { id, title, summary, status, domain, jurisdiction, page_url, notice } = toPublicRule(rule, library, attribution);
  return { id, title, summary, status, domain, jurisdiction, page_url, ...(notice ? { notice } : {}) };
}
