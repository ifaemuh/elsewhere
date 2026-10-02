import type { PublicChange } from '@/lib/rules-api/changes';
import type { FactEntry } from '@/lib/rules-api/facts-vocabulary';
import type { MatchResponse, PublicRule, RuleSummary } from '@/lib/rules-api/types';

export const DISCLAIMER = "Information from Elsewhere's verified rules library, not legal advice.";

function linkLines(rule: PublicRule): string[] {
  const citation = rule.citations[0];
  return [
    ...(citation ? [`Source: ${citation.url} — "${citation.quote}"`] : []),
    `Rule page: ${rule.page_url}`,
  ];
}

/** Ends with the source link, then the rule page link. */
export function ruleText(rule: PublicRule): string {
  const lines = [DISCLAIMER, '', `${rule.title} (${rule.status})`, rule.summary];
  if (rule.notice) lines.push(rule.notice);
  if (rule.replaced_by) lines.push(`Replaced by rule ${rule.replaced_by}.`);
  if (rule.how_to_claim.steps.length > 0) {
    lines.push('What to do:', ...rule.how_to_claim.steps.map((step, i) => `${i + 1}. ${step}`));
  }
  if (rule.exceptions.length > 0) lines.push('Exceptions:', ...rule.exceptions.map((e) => `- ${e}`));
  lines.push(...linkLines(rule));
  return lines.join('\n');
}

export function searchText(rules: RuleSummary[]): string {
  if (rules.length === 0) {
    return `${DISCLAIMER}\n\nNo verified rule matched that search. Try other words, or match_situation with known facts.`;
  }
  return [
    DISCLAIMER,
    '',
    ...rules.map((r) => `- ${r.title} (${r.status}${r.notice ? ', being re-checked' : ''}): ${r.summary}\n  Rule page: ${r.page_url}`),
  ].join('\n');
}

export function matchText(result: MatchResponse): string {
  if (result.applies.length === 0 && result.may_apply.length === 0) {
    return `${DISCLAIMER}\n\nNo verified rule matches these facts.`;
  }
  const parts = [DISCLAIMER];
  if (result.applies.length > 0) {
    parts.push('', 'Applies:', ...result.applies.map((r) => [`- ${r.title}: ${r.summary}`, ...linkLines(r).map((l) => `  ${l}`)].join('\n')));
  }
  if (result.may_apply.length > 0) {
    parts.push(
      '',
      'May apply (more facts needed):',
      ...result.may_apply.map((r) =>
        [`- ${r.title} — still need: ${r.missing_facts.join(', ')}`, ...linkLines(r).map((l) => `  ${l}`)].join('\n'),
      ),
    );
  }
  return parts.join('\n');
}

export function factsText(facts: FactEntry[]): string {
  return facts
    .map((f) => `- ${f.name} (${f.type}${f.values ? `: ${f.values.join(' | ')}` : ''}): ${f.description}`)
    .join('\n');
}

export function changesText(since: string, changes: PublicChange[]): string {
  if (changes.length === 0) return `No rule changes since ${since}.`;
  return [`Rule changes since ${since}:`, ...changes.map((c) => `- ${c.date} ${c.rule_id}: ${c.kind} (v${c.to_version})`)].join('\n');
}
