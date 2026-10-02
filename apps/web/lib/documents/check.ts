import { matchRules, type Rule, type Situation } from '@elsewhere/rules/core';

export interface MemberCheck {
  result: 'ok' | 'action_needed' | 'unknown';
  rule: Rule | null;
  detail: string;
}

/**
 * Document rules encode the failing condition, so "applies" means action is needed.
 * Details never carry dates; the planner sees them for every member.
 */
export function checkMember(rules: Rule[], situation: Situation): MemberCheck[] {
  const documentRules = rules.filter((rule) => rule.domain === 'documents');
  const byId = new Map(documentRules.map((rule) => [rule.id, rule]));
  const results = matchRules(documentRules, situation, { statuses: ['verified'] });
  const checks: MemberCheck[] = results.map((result) => {
    const rule = byId.get(result.rule_id)!;
    return result.outcome === 'applies'
      ? { result: 'action_needed', rule, detail: rule.title }
      : { result: 'unknown', rule, detail: `Hasn’t confirmed the details for: ${rule.title}` };
  });
  return checks.length > 0 ? checks : [{ result: 'ok', rule: null, detail: 'No document issues found for this trip.' }];
}

export function requiredMonths(rule: Rule): number | null {
  const value = rule.entitlement.amount?.min_months_valid_after_return;
  return typeof value === 'number' ? value : null;
}

/** Stored as an `unknown` check with no rule, so neither the member nor the planner sees "All clear" for a trip nothing was checked against. */
export const NO_COVERAGE_DETAIL = 'Elsewhere has no verified entry rules for this trip yet.';

/**
 * True when at least one verified document rule fits the trip itself (destination, domestic or not),
 * whatever any member has entered. An empty library, or one that covers only other destinations, is false.
 */
export function documentRulesCover(rules: Rule[], tripSituation: Situation): boolean {
  return matchRules(rules.filter((rule) => rule.domain === 'documents'), tripSituation, { statuses: ['verified'] }).length > 0;
}
