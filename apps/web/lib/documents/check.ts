import { matchRules, type ConditionNode, type Rule, type Situation } from '@elsewhere/rules/core';

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
  if (hasPassportGap(documentRules, situation)) {
    checks.push({ result: 'unknown', rule: null, detail: PASSPORT_GAP_DETAIL });
  }
  return checks.length > 0 ? checks : [{ result: 'ok', rule: null, detail: 'No document issues found for this trip.' }];
}

/** Shown when a rule covers the trip but is scoped to other passports, so the member is never told "all clear". */
export const PASSPORT_GAP_DETAIL = 'Elsewhere hasn’t verified the entry rules for your passport on this trip yet.';

/** Crown Dependencies are entered on British passports, so a British traveler is not "unlisted" there. */
const HOME_NATIONALITY: Record<string, string> = { JE: 'GB', GG: 'GB', IM: 'GB' };

/** True when the condition tree mentions the fact anywhere, including inside nested all/any groups. */
export function referencesFact(node: ConditionNode, fact: string): boolean {
  if ('all' in node) return node.all.some((child) => referencesFact(child, fact));
  if ('any' in node) return node.any.some((child) => referencesFact(child, fact));
  return node.fact === fact;
}

/**
 * A gap exists when nationality-scoped rules cover this trip but none of them names the member's passport.
 * Only the trip and the nationality are used, so other member facts (passport months) never change the answer.
 */
function hasPassportGap(documentRules: Rule[], situation: Situation): boolean {
  const nationality = situation['passenger.nationality'];
  const destination = situation['trip.destination_country'];
  if (typeof nationality !== 'string' || typeof destination !== 'string') return false;
  if (nationality === destination || nationality === HOME_NATIONALITY[destination]) return false;
  const trip: Situation = { 'trip.destination_country': destination };
  if (situation['flight.is_domestic_us'] !== undefined) trip['flight.is_domestic_us'] = situation['flight.is_domestic_us'];
  const scoped = documentRules.filter((rule) => referencesFact(rule.applies_when, 'passenger.nationality'));
  const inScope = matchRules(scoped, trip, { statuses: ['verified'] });
  if (inScope.length === 0) return false;
  const scopedInTrip = scoped.filter((rule) => inScope.some((r) => r.rule_id === rule.id));
  return matchRules(scopedInTrip, { ...trip, 'passenger.nationality': nationality }, { statuses: ['verified'] }).length === 0;
}

export function requiredMonths(rule: Rule): number | null {
  const value = rule.entitlement.amount?.min_months_valid_after_return;
  return typeof value === 'number' ? value : null;
}

/** Stored as an `unknown` check with no rule, so neither the member nor the planner sees "All clear" for a trip nothing was checked against. */
export const NO_COVERAGE_DETAIL = 'Elsewhere has no verified entry rules for this trip yet.';

/**
 * True when at least one verified document rule fits the trip itself (destination, domestic or not), and a trip with no destination is not covered unless it is known to be domestic,
 * whatever any member has entered. An empty library, or one that covers only other destinations, is false.
 */
export function documentRulesCover(rules: Rule[], tripSituation: Situation): boolean {
  // With no destination every destination rule only "may apply"; that is not coverage. A known domestic trip is covered by REAL ID rules.
  if (tripSituation['trip.destination_country'] === undefined && tripSituation['flight.is_domestic_us'] !== true) return false;
  return matchRules(rules.filter((rule) => rule.domain === 'documents'), tripSituation, { statuses: ['verified'] }).length > 0;
}
