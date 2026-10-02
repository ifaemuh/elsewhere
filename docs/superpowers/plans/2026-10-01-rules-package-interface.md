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
- **Module:** ESM (`"type": "module"`), TypeScript 5.5+. It exports TypeScript sources;
  the Next.js app and `tsx` both compile it. Two entry points:
  - `"."` → `./src/index.ts`: everything public, including the Node-only loader
    (`loadRules`, `loadSources`, `RulesValidationError`). Used by CLIs, scripts, and tests.
  - `"./core"` → `./src/core.ts`: everything public **except** the loader (`src/load.ts`)
    and the build-time library values `buildLibrary` and `changesFromHistory`. The types
    `RulesLibrary` and `RuleChange` are still exported, type-only. `core` imports no `node:`
    module and evaluates no `import.meta.url`, so it is safe in any bundle, including client
    components. **App code (the web app and Track D) imports from `@elsewhere/rules/core`,
    never from the bare package.**
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
  replaced_by?: string;           // rule id; only when status = retired
  history: RuleHistoryEntry[];    // oldest first; >= 1 entry
}

export interface RuleHistoryEntry {
  version: number;
  status: RuleStatus;
  date: string;                   // ISO date
  note?: string;                  // one line, e.g. "source amended: §260.6(a)"
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
  'event.reroute_departs_early_minutes': FactDef;     // number — cancellation/schedule_change: minutes before the scheduled departure that the offered re-routing leaves (0 if at/after, or none offered; a schedule change is its own offer)
  'event.reroute_arrival_delay_minutes': FactDef;     // number — cancellation/schedule_change: minutes after the original arrival that the offered re-routing arrives (0 if earlier; none offered = 1440+)
  'event.departure_delay_minutes': FactDef;           // number — delay: minutes after scheduled departure that the disrupted flight leaves or is expected to leave (that flight only; if expected and actual differ, report the longer)
  'event.departure_moved_earlier_minutes': FactDef;   // number — schedule_change: minutes earlier than scheduled that the flight now departs (0 if not earlier)
  'event.at_us_airport': FactDef;        // boolean — the disruption happened at a US airport (incl. territories); tarmac_delay: where the aircraft was held
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
  'flight.leg_distance_km': FactDef;     // number — great-circle km between the disrupted flight's own departure and arrival airports
  'flight.departs_iceland_norway_switzerland': FactDef; // boolean — the disrupted flight departs Iceland, Norway or Switzerland
  'flight.departs_us': FactDef;          // boolean
  'passenger.accepted_alternative': FactDef;            // boolean
  'passenger.volunteered': FactDef;                     // boolean — gave up a seat by answering the airline's call for volunteers (14 CFR 250.2b)
  'passenger.nationality': FactDef;                     // string (ISO 3166 alpha-2)
  'passenger.passport_months_valid_after_return': FactDef; // number
  'passenger.has_real_id': FactDef;                     // boolean
  'passenger.payment_card_issuer': FactDef;             // string
  'trip.destination_country': FactDef;   // string (ISO 3166 alpha-2)
  'trip.booked_via': FactDef;            // enum: direct, ota
  'trip.hours_since_booking': FactDef;   // number
  'trip.hours_booked_before_departure': FactDef; // number — hours between when the booking was made and the first flight's scheduled departure
  'trip.journey_departs_eu': FactDef;    // boolean — the passenger's journey in this direction starts at an EU airport (outbound and return are separate journeys)
  'trip.journey_arrives_eu': FactDef;    // boolean — the journey in this direction ends at an EU airport
  'trip.touches_us': FactDef;            // boolean — any flight on the booking departs from or arrives at a US airport
  'trip.booked_with_us_carrier': FactDef; // boolean — the airline the booking was made with is a US airline
  'trip.itinerary_domestic_us': FactDef;  // boolean — every flight on the ticket is within the US (14 CFR 260 "domestic itinerary")
  'trip.us_foreign_nonstop_minutes': FactDef; // number — scheduled minutes of the ticket's nonstop flight between the US and a foreign point
  'lodging.kind': FactDef;               // enum: hotel, short_term_rental
  'lodging.booked_via': FactDef;         // enum: direct, ota
};

export type FactName = keyof typeof FACTS;

// Amendment (2026-10-02, Track A Task 21 legal review): adds event.reroute_departs_early_minutes,
// event.reroute_arrival_delay_minutes, event.departure_delay_minutes, event.departure_moved_earlier_minutes,
// flight.leg_distance_km, flight.departs_iceland_norway_switzerland, trip.journey_departs_eu and
// trip.journey_arrives_eu. Descriptions: flight.* facts describe the disrupted flight (missed_connection: the flight
// whose delay caused the miss); flight.distance_km runs from the journey's first departure to its final destination;
// flight.departs_eu/arrives_eu use the Commission's definition of the EU; cancellation includes dropping the booked
// flight for a different one (not operated; same flight at another time = schedule_change; only this passenger kept off = denied_boarding); event.notice_days may be fractional and is not rounded up. Round 2: event.reroute_* also cover schedule_change
// (the changed flight is its own offer); event.departure_delay_minutes reports the longer of expected and actual.

// Amendment (2026-10-02, Track A Task 20 legal review): descriptions in src/facts.ts also define
// event.type `denied_boarding` (oversold flight, confirmed reservation; not documents/conduct/
// safety/cancellation), event.delay_minutes for denied_boarding (planned arrival of the offered
// replacement vs the original, at the first stopover >4h or final destination; no replacement
// offered = 240+), trip.booked_via `ota` (any online agency, travel agent or other third party),
// and say "including territories and possessions" on every US-airport fact.
// trip.days_until_departure is removed (replaced by trip.hours_booked_before_departure).
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
 *  fact value types, that every sources[].source exists in `sources`, that the last
 *  history entry equals { version, status }, that history versions never decrease,
 *  and that replaced_by (if set) names an existing rule and status is retired. */
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
  library_version: string;     // `${YYYY-MM-DD}.${first 7 hex of sha256(canonical JSON of rules)}`; sources excluded from the hash
  generated_at: string;        // ISO timestamp
  rules: Rule[];               // every rule, any status, sorted by id
  sources: Record<string, Source>;  // every source any rule cites, keyed like sources.yaml
  changes: RuleChange[];       // newest first
}

export function buildLibrary(opts: {
  rules: Rule[];
  sources: Record<string, Source>;
  now?: Date;
}): RulesLibrary;               // computes changes via changesFromHistory(rules)

/** Derives the changes feed from each rule's `history` (no git needed, so it is
 *  identical in CI, on Vercel's shallow clones, and locally). Consecutive entries
 *  become one RuleChange; the first entry has from_version/from_status = null. */
export function changesFromHistory(rules: Rule[]): RuleChange[];
```

`npm run rules:build` = `loadSources` → `loadRules` → `buildLibrary` →
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
`verified` rule's file and appends a history entry (same version, `needs_review`, today,
note naming the failing source). The nightly backstop uses this, then opens a PR.

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

## Index (`src/index.ts`) and core (`src/core.ts`)

`src/index.ts` re-exports everything above. Nothing else is public.

`src/core.ts` re-exports everything above except `src/load.ts` (`loadRules`, `loadSources`,
`RulesValidationError`) and the values `buildLibrary` and `changesFromHistory`. A test walks
the value imports reachable from `core.ts` (`import type` and `export type` lines are erased
at compile time and are skipped). It fails if any of them imports `./load`, `./library`, or
a `node:` module. `sourceTextPath` joins with `/` and does not use `node:path`.
