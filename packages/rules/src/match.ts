import { validateSituation, type FactName, type Situation } from './facts';
import type { ConditionNode, Rule, RuleStatus } from './schema';

export type MatchOutcome = 'applies' | 'may_apply' | 'does_not_apply';

export interface MatchResult {
  rule_id: string;
  rule_version: number;
  outcome: MatchOutcome;
  missing_facts: FactName[];
}

type Truth = true | false | 'unknown';

interface Evaluation {
  value: Truth;
  missing: FactName[];
}

function evaluate(node: ConditionNode, situation: Situation): Evaluation {
  if ('all' in node || 'any' in node) {
    const isAll = 'all' in node;
    const children = (isAll ? node.all : node.any).map((child) => evaluate(child, situation));
    const decisive = isAll ? false : true;
    if (children.some((c) => c.value === decisive)) return { value: decisive, missing: [] };
    const unknown = children.filter((c) => c.value === 'unknown');
    if (unknown.length > 0) return { value: 'unknown', missing: unknown.flatMap((c) => c.missing) };
    return { value: !decisive, missing: [] };
  }

  const value = situation[node.fact];
  if ('exists' in node) return { value: (value !== undefined) === node.exists, missing: [] };
  if (value === undefined) return { value: 'unknown', missing: [node.fact] };
  if ('eq' in node) return { value: value === node.eq, missing: [] };
  if ('in' in node) return { value: node.in.includes(value), missing: [] };
  if (typeof value !== 'number') return { value: false, missing: [] };
  if ('gte' in node) return { value: value >= node.gte, missing: [] };
  if ('lte' in node) return { value: value <= node.lte, missing: [] };
  if ('gt' in node) return { value: value > node.gt, missing: [] };
  return { value: value < node.lt, missing: [] };
}

/**
 * Three-valued evaluation. A condition on a fact absent from the situation is
 * UNKNOWN. all: false if any child is false, else unknown if any unknown, else true.
 * any: true if any child is true, else unknown if any unknown, else false.
 * true → 'applies', unknown → 'may_apply' (missing_facts = the unknown facts that
 * could change the result), false → 'does_not_apply'.
 */
export function matchRule(rule: Rule, situation: Situation): MatchResult {
  validateSituation(situation);
  const { value, missing } = evaluate(rule.applies_when, situation);
  const outcome: MatchOutcome = value === true ? 'applies' : value === false ? 'does_not_apply' : 'may_apply';
  return {
    rule_id: rule.id,
    rule_version: rule.version,
    outcome,
    missing_facts: outcome === 'may_apply' ? [...new Set(missing)] : [],
  };
}

/**
 * Filters to `statuses` (default ['verified']), drops 'does_not_apply',
 * sorts 'applies' before 'may_apply', then by rule id.
 */
export function matchRules(
  rules: Rule[],
  situation: Situation,
  opts: { statuses?: RuleStatus[] } = {},
): MatchResult[] {
  const statuses = opts.statuses ?? ['verified'];
  const rank: Record<MatchOutcome, number> = { applies: 0, may_apply: 1, does_not_apply: 2 };
  return rules
    .filter((rule) => statuses.includes(rule.status))
    .map((rule) => matchRule(rule, situation))
    .filter((result) => result.outcome !== 'does_not_apply')
    .sort((a, b) => rank[a.outcome] - rank[b.outcome] || a.rule_id.localeCompare(b.rule_id));
}
