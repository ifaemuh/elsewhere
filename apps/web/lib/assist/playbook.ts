import 'server-only';
import type { Rule, Situation } from '@elsewhere/rules/core';
import { generateText, Output, type LanguageModel } from 'ai';
import { model as defaultModel, NO_TRAINING } from '@/lib/ai/models';
import { checkCitations } from './citation-check';
import { PlaybookSchema, type Playbook } from './playbook-schema';
import { templatePlaybook } from './template';

export interface PlaybookInput {
  eventSummary: string;
  situation: Situation;
  applying: Rule[];
  reviewing: Rule[];
  extraNumbers: string[];
}

export interface PlaybookResult {
  playbook: Playbook;
  model: string;
  citationCheckPassed: boolean;
  rulesCited: { rule_id: string; rule_version: number }[];
}

const INSTRUCTIONS = `You draft a short, calm playbook for travelers whose flight was disrupted.
Use ONLY the rules provided. Every item in "owed" and every drafted message must list the ids of the rules it relies on.
Never state an amount, a deadline, or a duration that is not written in the cited rule, or in the incident facts given.
Use the rule's own framing: "up to", "you may be entitled to". Never promise an outcome such as "you will get".
Write as "we drafted"; the travelers decide and send. Never say that Elsewhere filed, claimed, sued, booked, or requested anything on their behalf; the travelers act themselves.
Draft messages the travelers can paste: to the airline, the booking site, the hotel, or the group chat.
Rules listed as being re-checked are not owed. Mention them only in caveats, as "might apply — check ..." and "being re-checked".`;

function rulesForPrompt(rules: Rule[]) {
  return rules.map((rule) => ({
    id: rule.id,
    title: rule.title,
    summary: rule.summary,
    entitlement: rule.entitlement,
    how_to_claim: rule.how_to_claim.steps,
    exceptions: rule.exceptions,
  }));
}

function cited(playbook: Playbook, rules: Rule[]) {
  const ids = new Set([...playbook.owed, ...playbook.steps, ...playbook.messages].flatMap((item) => item.rule_ids));
  return rules.filter((rule) => ids.has(rule.id)).map((rule) => ({ rule_id: rule.id, rule_version: rule.version }));
}

export async function generatePlaybook(input: PlaybookInput, opts: { model?: LanguageModel } = {}): Promise<PlaybookResult> {
  const fallback = (): PlaybookResult => ({
    playbook: templatePlaybook(input),
    model: 'template',
    citationCheckPassed: true,
    rulesCited: input.applying.map((rule) => ({ rule_id: rule.id, rule_version: rule.version })),
  });
  if (input.applying.length === 0) return fallback();

  const lm = opts.model ?? (await defaultModel('playbook'));
  const modelId = typeof lm === 'string' ? lm : lm.modelId;
  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let output: Playbook;
    try {
      // Reading `output` inside the try too: it throws when the text doesn't parse into the schema.
      ({ output } = await generateText({
        model: lm,
        output: Output.object({ schema: PlaybookSchema, name: 'playbook' }),
        instructions: INSTRUCTIONS,
        prompt: JSON.stringify({
          what_happened: input.eventSummary,
          facts: input.situation,
          incident_numbers: input.extraNumbers,
          rules_that_apply: rulesForPrompt(input.applying),
          rules_being_rechecked: input.reviewing.map((rule) => rule.title),
          ...(feedback ? { fix_these_problems_from_your_last_draft: feedback } : {}),
        }),
        providerOptions: NO_TRAINING,
      }));
    } catch (error) {
      // AI Gateway down, a timeout, or output that won't parse: the template is built from verified rule text alone.
      console.error('playbook generation failed; using the template', error);
      return fallback();
    }
    const issues = checkCitations(output, input.applying, input.extraNumbers);
    if (issues.length === 0) return { playbook: output, model: modelId, citationCheckPassed: true, rulesCited: cited(output, input.applying) };
    feedback = issues.map((issue) => `${issue.path}: ${issue.problem} (${issue.detail})`).join('\n');
  }
  return fallback();
}
