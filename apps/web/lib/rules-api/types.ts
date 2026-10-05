import type { Domain, FactName, Rule, RuleStatus } from '@elsewhere/rules/core';

export interface LinkAttribution {
  source: 'api' | 'mcp';
  medium: string;
}

export type ApiCaller =
  | { tier: 'anonymous' }
  | { tier: 'partner'; keyId: string; partnerId: string; rateLimitRule: string };

export interface Citation {
  url: string;
  kind: string;
  quote: string;
}

export type PublicStatus = Exclude<RuleStatus, 'draft'>;

export interface PublicRule {
  id: string;
  version: number;
  status: PublicStatus;
  domain: Domain;
  jurisdiction: string;
  title: string;
  summary: string;
  entitlement: Rule['entitlement'];
  how_to_claim: { steps: string[] };
  exceptions: string[];
  citations: Citation[];
  last_verified: string | null;
  review_by: string | null;
  page_url: string;
  notice?: string;
  replaced_by?: string;
}

export interface RuleSummary {
  id: string;
  title: string;
  summary: string;
  status: PublicStatus;
  domain: Domain;
  jurisdiction: string;
  page_url: string;
  notice?: string;
}

export interface MatchedRule extends PublicRule {
  missing_facts: FactName[];
}

export interface MatchResponse {
  applies: PublicRule[];
  may_apply: MatchedRule[];
  does_not_apply_count: number;
}

export const ATTRIBUTION = {
  text: 'Rules verified by Elsewhere from primary sources. Not legal advice.',
  required: true,
} as const;

export interface Envelope<T> {
  schema_version: number;
  library_version: string;
  data: T;
  attribution: typeof ATTRIBUTION;
}
