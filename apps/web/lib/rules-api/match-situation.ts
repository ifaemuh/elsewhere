import { matchRules, type RuleStatus, type RulesLibrary, type Situation } from '@elsewhere/rules/core';
import { toPublicRule } from './projection';
import type { LinkAttribution, MatchedRule, MatchResponse, PublicRule } from './types';

/** Retired rules no longer apply; needs_review rules are returned with their notice. */
export const MATCHABLE_STATUSES: RuleStatus[] = ['verified', 'needs_review'];

export function matchSituation(library: RulesLibrary, situation: Situation, attribution: LinkAttribution): MatchResponse {
  const results = matchRules(library.rules, situation, { statuses: MATCHABLE_STATUSES });
  const byId = new Map(library.rules.map((r) => [r.id, r]));
  const applies: PublicRule[] = [];
  const mayApply: MatchedRule[] = [];

  for (const result of results) {
    const rule = byId.get(result.rule_id);
    if (!rule) continue;
    const pub = toPublicRule(rule, library, attribution);
    if (result.outcome === 'applies') applies.push(pub);
    else mayApply.push({ ...pub, missing_facts: result.missing_facts });
  }

  const considered = library.rules.filter((r) => MATCHABLE_STATUSES.includes(r.status)).length;
  return { applies, may_apply: mayApply, does_not_apply_count: considered - applies.length - mayApply.length };
}
