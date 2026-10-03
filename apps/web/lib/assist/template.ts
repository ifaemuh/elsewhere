import type { Rule } from '@elsewhere/rules/core';
import type { Playbook } from './playbook-schema';

/** Built only from verified rule text, so it needs no citation check. */
export function templatePlaybook({ eventSummary, applying, reviewing }: { eventSummary: string; applying: Rule[]; reviewing: Rule[] }): Playbook {
  return {
    summary: eventSummary,
    owed: applying.map((rule) => ({ text: rule.summary, rule_ids: [rule.id] })),
    steps: applying.flatMap((rule) => rule.how_to_claim.steps.map((text) => ({ text, rule_ids: [rule.id] }))),
    messages: [],
    caveats: [
      ...reviewing.map((rule) => `“${rule.title}” might apply — check the airline’s notice. It’s being re-checked, so we left it out of the steps above.`),
      ...(applying.length === 0 ? ['None of the rules we track clearly applies to this yet.'] : []),
      'We drafted this from the rules linked below. You decide what to send, and you send it yourself. Check the airline’s own notice too.',
    ],
  };
}
