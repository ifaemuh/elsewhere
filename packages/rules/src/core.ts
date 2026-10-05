// Bundle-safe entry point: everything public except the Node-only loader and the
// build-time library values (which use node:crypto). Types from ./library are erased.
export type { FactDef, FactName, Situation } from './facts';
export { FACTS, FactValueError, validateSituation, FACT_NAMES, isFactName, factValueFits, describeFact } from './facts';
export type {
  RuleStatus, Domain, Character, SourceKind, Primitive, Condition, ConditionGroup, ConditionNode,
  Quote, RuleSourceRef, Rule, RuleHistoryEntry, Detector, Source,
} from './schema';
export {
  RULE_STATUSES, DOMAINS, CHARACTERS, ENTITLEMENT_KINDS, SOURCE_KINDS,
  JURISDICTION_PATTERN, RESERVED_RULE_IDS, RuleSchema, SourceSchema,
} from './schema';
export type { MatchOutcome, MatchResult } from './match';
export { matchRule, matchRules } from './match';
export type { QuoteIssue } from './quotes';
export { normalizeText, sourceTextPath, checkQuotes, checkSupports } from './quotes';
export type { RuleChange, RulesLibrary } from './library';
