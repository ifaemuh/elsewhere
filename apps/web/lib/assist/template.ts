import type { Rule } from '@elsewhere/rules/core';
import type { Playbook } from './playbook-schema';

/**
 * A neutral name for a rule that is being re-checked, built from its domain and tags only. Never its title or
 * summary, which can carry amounts or "you're owed" framing we haven't re-verified.
 */
export function neutralLabel(rule: Rule): string {
  const tags = rule.tags.filter((tag) => /^[a-z-]+$/.test(tag)).slice(0, 2);
  return `a rule about ${tags.length > 0 ? tags.join(' and ') : rule.domain}`;
}

/** Built only from verified rule text, so the citation check should always pass. */
export function templatePlaybook({ eventSummary, applying, reviewing }: { eventSummary: string; applying: Rule[]; reviewing: Rule[] }): Playbook {
  const verified = applying.filter((rule) => rule.status === 'verified');
  return {
    summary: eventSummary,
    owed: verified.map((rule) => ({ text: rule.summary, rule_ids: [rule.id] })),
    steps: verified.flatMap((rule) => rule.how_to_claim.steps.map((text) => ({ text, rule_ids: [rule.id] }))),
    messages: [],
    caveats: [
      ...reviewing.map((rule) => {
        const label = neutralLabel(rule);
        return `${label[0].toUpperCase()}${label.slice(1)} might apply — check the airline’s notice. It’s being re-checked, so we left it out of the steps above.`;
      }),
      ...(verified.length === 0 ? ['None of the rules we track clearly applies to this yet.'] : []),
      verified.length > 0 ? 'We drafted this from the rules linked below. Check the airline’s own notice too.' : 'Check the airline’s own notice.',
    ],
  };
}
