# `@elsewhere/rules` — Public Interface Contract

**Date:** 2026-10-01
**Implements:** [`specs/2026-10-01-rules-library-design.md`](../specs/2026-10-01-rules-library-design.md)
**Implemented by:** `2026-10-01-track-a-rules-library.md`
**Consumed by:** track B (foundry), track C (web app), and track D (API + MCP) plans

This file pins the exact names and types every plan builds against. Track A implements
it as written. If a plan needs something that isn't here, the change goes into this file
first, in its own commit.

## Package

- **Name:** `@elsewhere/rules`, at `packages/rules`, in an npm workspace.
- **Module:** ESM (`"type": "module"`), TypeScript 5.5+. It exports TypeScript sources
  via `exports` → `./src/index.ts`; the Next.js app and `tsx` both compile it.
- **Dependencies:** `zod@^4.6`, `yaml@^2.9`. Dev: `tsx@^4.19`, `@types/node@^22`.
- **Tests:** `node --import tsx --test test/**/*.test.ts` (the same runner foundry uses).
- **Scripts:** `test`, `typecheck` (`tsc --noEmit`), `rules:build`, `rules:check-quotes`.
- **Field naming:** rule objects keep the YAML's snake_case keys exactly. No camelCase
  transform anywhere, so a rule file, `dist/rules.json`, and the API projection all use
  the same names.

## Types (`src/schema.ts`)

```ts
import { z } from 'zod';

export const RULE_STATUSES = ['draft', 'verified', 'needs_review', 'retired'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export const DOMAINS = ['flights', 'documents', 'money', 'hotels'] as const;
export type Domain = (typeof DOMAINS)[number];

export const CHARACTERS = ['capybara', 'owl', 'raccoon', 'pigeon'] as const;
export type Character = (typeof CHARACTERS)[number];

export const ENTITLEMENT_KINDS = [
  'refund', 'compensation', 'care', 'rebooking', 'requirement', 'perk', 'protection',
] as const;

export const SOURCE_KINDS = [
  'regulation', 'agency_guidance', 'government_page',
  'contract_of_carriage', 'customer_service_plan', 'issuer_benefit_guide',
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export type Primitive = string | number | boolean;

export type Condition =
  | { fact: FactName; eq: Primitive }
  | { fact: FactName; in: Primitive[] }
  | { fact: FactName; gte: number }
  | { fact: FactName; lte: number }
  | { fact: FactName; gt: number }
  | { fact: FactName; lt: number }
  | { fact: FactName; exists: boolean };

export type ConditionGroup = { all: ConditionNode[] } | { any: ConditionNode[] };
export type ConditionNode = Condition | ConditionGroup;

export interface Quote {
  text: string;
  supports: string[];          // dotted paths into the rule, e.g. "summary", "entitlement.amount"
}

export interface RuleSourceRef {
  id: string;                  // local id within the rule, e.g. "s1"
  source: string;              // key into sources.yaml
  quotes: Quote[];
}

export interface Rule {
  id: string;                  // kebab-case, stable for the rule's life
  version: number;             // integer >= 1
  status: RuleStatus;
  domain: Domain;
  jurisdiction: string;        // pattern below
  title: string;
  summary: string;             // <= 400 chars
  applies_when: ConditionGroup;
  entitlement: {
    kind: (typeof ENTITLEMENT_KINDS)[number];
    amount?: Record<string, Primitive | Primitive[]>;
    timing?: string;
  };
  how_to_claim: { steps: string[]; templates: string[] };
  exceptions: string[];
  sources: RuleSourceRef[];    // >= 1
  lead_character: Character;
  tags: string[];
  last_verified: string | null;   // ISO date; null only while status = draft
  verified_by: string | null;
  review_by: string | null;       // ISO date
}

export type Detector =
  | { ota: { service: string; terms_type: string } }
  | { ecfr: { title: number; part: number } }
  | { changedetection: { watch_uuid: string } };

export interface Source {
  key: string;
  url: string;
  kind: SourceKind;
  detector: Detector;
}

export const JURISDICTION_PATTERN =
  /^(US-DOT|US-FTC|US-TSA|US-STATE|EU-261|UK-261|carrier:[A-Z0-9]{2}|issuer:[a-z0-9-]+|country:[A-Z]{2})$/;

export const RuleSchema: z.ZodType<Rule>;      // validates every constraint above
export const SourceSchema: z.ZodType<Source>;
```

## Facts (`src/facts.ts`)

```ts
export interface FactDef {
  type: 'enum' | 'number' | 'boolean' | 'string';
  values?: readonly string[];   // required when type = 'enum'
  description: string;
}

export const FACTS: {
  'event.type': FactDef;                 // enum: cancellation, delay, schedule_change, denied_boarding,
                                         //   downgrade, missed_connection, tarmac_delay, bag_delayed,
                                         //   bag_lost, bag_damaged, service_not_provided
  'event.delay_minutes': FactDef;        // number
  'event.notice_days': FactDef;          // number
  'event.cause': FactDef;                // enum: controllable, uncontrollable, unknown
  'flight.carrier_iata': FactDef;        // string
  'flight.carrier_is_us': FactDef;       // boolean
  'flight.touches_us': FactDef;          // boolean
  'flight.is_domestic_us': FactDef;      // boolean
  'flight.departs_eu': FactDef;          // boolean
  'flight.arrives_eu': FactDef;          // boolean
  'flight.carrier_is_eu': FactDef;       // boolean
  'flight.departs_uk': FactDef;          // boolean
  'flight.distance_km': FactDef;         // number
  'flight.single_ticket': FactDef;       // boolean
  'passenger.accepted_alternative': FactDef;            // boolean
  'passenger.nationality': FactDef;                     // string (ISO 3166 alpha-2)
  'passenger.passport_months_valid_after_return': FactDef; // number
  'passenger.has_real_id': FactDef;                     // boolean
  'passenger.payment_card_issuer': FactDef;             // string
  'trip.destination_country': FactDef;   // string (ISO 3166 alpha-2)
  'trip.booked_via': FactDef;            // enum: direct, ota
  'trip.hours_since_booking': FactDef;   // number
  'trip.days_until_departure': FactDef;  // number
  'lodging.kind': FactDef;               // enum: hotel, short_term_rental
  'lodging.booked_via': FactDef;         // enum: direct, ota
};

export type FactName = keyof typeof FACTS;
export type Situation = Partial<Record<FactName, Primitive>>;

/** Throws FactValueError if a value doesn't fit its FactDef. */
export function validateSituation(situation: Situation): void;
```

## Matching (`src/match.ts`)

```ts
export type MatchOutcome = 'applies' | 'may_apply' | 'does_not_apply';

export interface MatchResult {
  rule_id: string;
  rule_version: number;
  outcome: MatchOutcome;
  missing_facts: FactName[];   // non-empty only when outcome = 'may_apply'
}

/**
 * Three-valued evaluation. A condition on a fact absent from the situation is
 * UNKNOWN. all: false if any child is false, else unknown if any unknown, else true.
 * any: true if any child is true, else unknown if any unknown, else false.
 * true → 'applies', unknown → 'may_apply' (missing_facts = the unknown facts that
 * could change the result), false → 'does_not_apply'.
 */
export function matchRule(rule: Rule, situation: Situation): MatchResult;

/**
 * Filters to `statuses` (default ['verified']), drops 'does_not_apply',
 * sorts 'applies' before 'may_apply', then by rule id.
 */
export function matchRules(
  rules: Rule[],
  situation: Situation,
  opts?: { statuses?: RuleStatus[] },
): MatchResult[];
```

## Loading and building (`src/load.ts`, `src/library.ts`)

```ts
export class RulesValidationError extends Error {
  issues: { file: string; path: string; message: string }[];
}

/** Reads data/**/*.yaml; validates schema, unique ids, filename = id, known facts,
 *  fact value types, and that every sources[].source exists in `sources`. */
export function loadRules(opts?: { dataDir?: string; sources?: Record<string, Source> }): Rule[];

export function loadSources(file?: string): Record<string, Source>;   // default packages/rules/sources.yaml

export interface RuleChange {
  rule_id: string;
  from_version: number | null;
  to_version: number;
  from_status: RuleStatus | null;
  to_status: RuleStatus;
  date: string;                // ISO date of the commit
}

export interface RulesLibrary {
  schema_version: 1;
  library_version: string;     // `${YYYY-MM-DD}.${first 7 hex of sha256(canonical JSON of rules)}`
  generated_at: string;        // ISO timestamp
  rules: Rule[];               // every rule, any status, sorted by id
  changes: RuleChange[];       // newest first
}

export function buildLibrary(opts: {
  rules: Rule[];
  changes: RuleChange[];
  now?: Date;
}): RulesLibrary;

/** Walks `git log` over data/ and diffs version/status per commit. */
export function changesFromGit(opts?: { repoRoot?: string; dataDir?: string }): RuleChange[];
```

`npm run rules:build` = `loadSources` → `loadRules` → `changesFromGit` → `buildLibrary` →
write `packages/rules/dist/rules.json` (pretty-printed, trailing newline). `dist/` is
gitignored. The web app regenerates it at build time.

## Quote checking (`src/quotes.ts`)

```ts
/** NFKC, curly quotes → straight, all whitespace runs → one space, trimmed. Case-sensitive. */
export function normalizeText(text: string): string;

/** Where a source's current text lives inside a checkout of elsewhere-sources-versions. */
export function sourceTextPath(source: Source, versionsDir: string): string;
// ota:             <versionsDir>/<service>/<terms_type>.md
// ecfr:            <versionsDir>/eCFR/title-<title>-part-<part>.md
// changedetection: <versionsDir>/changedetection/<key>.md

export interface QuoteIssue {
  rule_id: string;
  source_key: string;
  quote: string;
  reason: 'not_found' | 'source_missing';
}

export function checkQuotes(rules: Rule[], sourceTexts: Record<string, string>): QuoteIssue[];

/** Every path in any quote's `supports` must exist on the rule; `summary` and
 *  `entitlement` must each be supported at least once. Returns messages. */
export function checkSupports(rule: Rule): string[];
```

`npm run rules:check-quotes -- --versions <dir> [--write-needs-review]` exits 1 on any
issue. With `--write-needs-review`, it sets `status: needs_review` on each failing
`verified` rule's file (the nightly backstop uses this, then opens a PR).

## Fixtures

- **Golden match cases:** `packages/rules/test/fixtures/match/*.yaml`, one file per case:
  ```yaml
  name: cancelled US flight, declined rebooking
  situation: { event.type: cancellation, flight.touches_us: true, passenger.accepted_alternative: false }
  rules: [us-dot-refund-cancelled-flight]       # rule files under test/fixtures/rules/
  expect:
    - { rule_id: us-dot-refund-cancelled-flight, outcome: applies, missing_facts: [] }
  ```
  Track A's matcher tests and track D's `POST /api/rules/match` tests both iterate this
  folder.
- **Fixture rules:** `packages/rules/test/fixtures/rules/*.yaml`. These are synthetic
  rules whose quotes come from `test/fixtures/sources/*.md`, not real rules.

## Index (`src/index.ts`)

Re-exports everything above. Nothing else is public.
