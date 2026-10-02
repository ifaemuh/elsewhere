export type { FactDef, FactName, Situation } from './facts';
export { FACTS, FactValueError, validateSituation, FACT_NAMES, isFactName, factValueFits, describeFact } from './facts';
export type {
  RuleStatus, Domain, Character, SourceKind, Primitive, Condition, ConditionGroup, ConditionNode,
  Quote, RuleSourceRef, Rule, RuleHistoryEntry, Detector, Source,
} from './schema';
export {
  RULE_STATUSES, DOMAINS, CHARACTERS, ENTITLEMENT_KINDS, SOURCE_KINDS,
  JURISDICTION_PATTERN, RuleSchema, SourceSchema,
} from './schema';
export type { MatchOutcome, MatchResult } from './match';
export { matchRule, matchRules } from './match';
export { RulesValidationError, loadRules, loadSources } from './load';
