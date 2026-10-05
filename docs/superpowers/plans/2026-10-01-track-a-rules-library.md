# Track A — Rules Library and Refresh Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@elsewhere/rules`, a versioned library of travel rules where every claim is quoted word-for-word from a primary source, kept current by Open Terms Archive, the eCFR API, an OpenAI Dot, and a nightly quote backstop. The first 10 flight-heavy rules are verified.

**Architecture:** A workspace package (`packages/rules`) holds YAML rule files, a closed facts vocabulary, a three-valued matcher, and CLIs that build `dist/rules.json`, check quotes, and generate tracker declarations. Source text is captured into a private git repo (`elsewhere-sources-versions`). Open Terms Archive captures web pages and an eCFR fetcher captures regulations, both from one daily GitHub Action. The Dot turns source diffs into rule PRs. A nightly job flips any verified rule whose quote has disappeared. The founder approves every change.

**Tech Stack:** TypeScript 5.5+ (ESM), zod 4.6, yaml 2.9, Node's built-in test runner via tsx, Open Terms Archive engine 16.3.0, the eCFR versioner API, the Federal Register API, GitHub Actions, the `gh` CLI, and an OpenAI Dot (ChatGPT Pro).

**Spec:** [`docs/superpowers/specs/2026-10-01-rules-library-design.md`](../specs/2026-10-01-rules-library-design.md)
**Interface contract (implement exactly):** [`2026-10-01-rules-package-interface.md`](2026-10-01-rules-package-interface.md), as of commit `8a0da4a`

## Global Constraints

- The interface contract is the source of truth for every public name, type, field, file path, and script. A change to the public interface goes into the contract file first, in its own commit, and then into code.
- Package `@elsewhere/rules` at `packages/rules`. ESM (`"type": "module"`), `exports` → `./src/index.ts`, TypeScript 5.5+.
- Dependencies: `zod@^4.6.5`, `yaml@^2.9.1`. Dev: `tsx@^4.19.2`, `@types/node@^22`, `typescript@^5.5`. No other runtime dependencies.
- Tests: `node --import tsx --test "test/**/*.test.ts"` (the quotes let Node expand the glob). Run from `packages/rules`, or use `npm test -w @elsewhere/rules` from the repo root.
- Rule objects keep the YAML's snake_case keys everywhere: files, `dist/rules.json`, and the API. No camelCase transform.
- Node 22 or newer. The Open Terms Archive engine requires `>=22 <=26`, and CI pins 22.
- Sources are primary only: regulations, government agencies, EU and UK authorities, airline contracts of carriage and customer service plans, and card-issuer benefit guides. Never blogs, news, forums, or OTAs.
- Quotes are verbatim spans of the tracked text in `elsewhere-sources-versions`. Never invent, paraphrase, or "fix" a quote.
- `history` is append-only. Nothing ever edits or deletes a past entry.
- GitHub owner `ifaemuh`. Repos: `ifaemuh/elsewhere`, plus three new private ones: `ifaemuh/elsewhere-sources-declarations`, `ifaemuh/elsewhere-sources-versions`, `ifaemuh/elsewhere-sources-snapshots`.
- GitHub runs scheduled workflows only from the default branch (`main`). The automation in Tasks 12–17 is live only once this work is on `main`.
- **Outward-facing steps need the founder's explicit go-ahead at execution time:** creating repos, setting secrets or repo settings, pushing to `main`, opening PRs or issues, and anything in ChatGPT. These steps are marked **FOUNDER CONFIRMATION** or **FOUNDER ACTION**. Ask, wait, then run.
- Every commit message ends with these two trailer lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
  ```
  The commit commands below use `git commit -F -` with a heredoc that already includes them.

## Verified while writing this plan (2026-10-01)

These facts were probed directly, not assumed:

- **Open Terms Archive engine 16.3.0:**
  - It exposes the `ota` binary and reads the collection config from `./config/default.json`, merged over the engine's defaults.
  - Declarations are `declarations/<service>.json`, shaped `{ name, terms: { <type>: { fetch, select, remove?, executeClientScripts? } } }`. A PDF takes `{ fetch }` only.
  - It writes versions to `data/versions/<service>/<terms type>.md`.
  - It opens GitHub issues for failing documents when `OTA_ENGINE_GITHUB_TOKEN` is set.
- **Terms types are not enforced by `ota track`.** The 44-entry list in `@opentermsarchive/terms-types` is checked only by `ota validate`. A local spike tracked the custom types "Official Guidance" and "Customer Service Plan" without error. Spike results:

  | Source | Result |
  |---|---|
  | US DOT refunds page | Recorded, although curl gets a 403 |
  | Your Europe | Recorded |
  | Delta's contract of carriage and customer service plan | Recorded |
  | EUR-Lex 261/2004 | Recorded only with `executeClientScripts: true` (plain fetch returns an empty body) |

- **eCFR versioner API:**
  - `GET /api/versioner/v1/titles.json` → `{ titles: [{ number, up_to_date_as_of, … }] }`
  - `GET /api/versioner/v1/versions/title-14.json?part=260` → `{ content_versions: [...], meta: { latest_amendment_date, … } }`
  - `GET /api/versioner/v1/full/<date>/title-14.xml?part=260` needs a compression-permitting `Accept-Encoding` (it returns 406 otherwise) and returns `<DIV5>…<HEAD>…<P>…` XML.
  - A live run of the fetcher below returned Part 260, amended 2024-08-12.
- **Current amendment dates:**
  - § 250.5 (bumping amounts): 2025-01-22
  - § 259.5 (customer service plan): 2026-07-02
  - § 259.9 (one-page passenger rights summary): 2026-05-26
  - 16 CFR Part 464 (FTC fees rule): 2025-05-12
- **Federal Register API:** `conditions[agencies][]=transportation-department&conditions[term]=airline+passengers&conditions[publication_date][gte]=…` returns the relevant DOT rules. The single term "airline" drowns in FAA airworthiness directives.
- **Prototype:** every TypeScript file, fixture, and test below was run in a scratch copy of this package. The full suite was 86 passing tests with a clean `tsc --noEmit`.

## File Structure

```
packages/rules/
  package.json                 # @elsewhere/rules; scripts grow task by task
  tsconfig.json                # extends ../../tsconfig.base.json, noEmit, includes src + test
  sources.yaml                 # every tracked primary source (Task 8)
  ota-overrides.yaml           # OTA select/remove/client-scripts tuning per source (Task 8)
  RESEARCH.md                  # how a rule is researched, checked, approved (Task 15)
  data/{flights,documents,money,hotels}/   # rule files, one per rule (Tasks 19–21)
  dot/goal.md                  # the Dot's goal prompt, versioned (Task 16)
  dot/setup.md                 # the Dot's exact ChatGPT configuration (Task 16)
  src/
    facts.ts                   # FACTS vocabulary, Situation, validateSituation (Task 1)
    schema.ts                  # types + RuleSchema/SourceSchema (Task 2)
    match.ts                   # three-valued matchRule/matchRules (Task 3)
    load.ts                    # loadSources/loadRules/loadRuleFiles + validation (Task 4)
    quotes.ts                  # normalizeText/sourceTextPath/checkQuotes/checkSupports (Task 5)
    library.ts                 # buildLibrary/changesFromHistory (Task 6)
    history.ts                 # internal: append a history entry to a YAML doc (Task 7)
    index.ts                   # the public surface, explicit re-exports (Task 7)
    ota.ts                     # internal: OTA declarations from sources.yaml (Task 9)
    ecfr.ts                    # internal: eCFR XML → text, fetchEcfrPart (Task 11)
    stale.ts                   # internal: addDays, rulesDueForReview (Task 14)
    verify.ts                  # internal: markVerified (Task 15)
    cli/build.ts               # rules:build (Task 7)
    cli/check-quotes.ts        # rules:check-quotes (Task 7)
    cli/declarations.ts        # rules:declarations (Task 9)
    cli/fetch-ecfr.ts          # rules:fetch-ecfr (Task 11)
    cli/stale.ts               # rules:stale (Task 14)
    cli/verify.ts              # rules:verify (Task 15)
  test/
    helpers.ts                 # FIXTURES path, readFixtureRule
    *.test.ts                  # one per module
    data-cases/<rule-id>.yaml  # per-rule match cases for real rules (Task 15 onward)
    fixtures/
      sources.yaml             # synthetic fixture sources
      sources/<key>.md         # their "tracked" texts
      rules/*.yaml             # synthetic fixture rules (flat, per the contract)
      match/*.yaml             # golden match cases, shared with track D
      ecfr/title-14-part-260.xml
.github/workflows/
  rules-ci.yml                 # PR + main: test, typecheck, build, quote check (Task 13)
  sources-track.yml            # daily: declarations sync, ota track, eCFR, publish (Task 12)
  rules-backstop.yml           # nightly: flip rules whose quotes vanished, open PR (Task 13)
  rules-staleness.yml          # weekly: one issue listing rules due for review (Task 14)
```

`ifaemuh/elsewhere-sources-declarations` (new repo, Task 12) holds `package.json` (engine pinned to 16.3.0), `config/default.json`, and `declarations/` generated from `sources.yaml`. The two other new repos hold only what the tracker writes.

---

## Part 1 — The package

### Task 1: Package scaffold and the facts vocabulary

**Files:**
- Create: `packages/rules/package.json`, `packages/rules/tsconfig.json`, `packages/rules/src/facts.ts`, `packages/rules/test/facts.test.ts`, `packages/rules/data/{flights,documents,money,hotels}/.gitkeep`, `packages/rules/test/data-cases/.gitkeep`
- Modify: `package.json` (root, `scripts`), `turbo.json` (add `test` task), `package-lock.json` (via `npm install`)

**Interfaces:**
- Produces: `FactDef`, `FACTS`, `FactName`, `Situation`, `FactValueError`, `validateSituation(situation)` (public). Internal helpers used by later tasks: `FACT_NAMES: [FactName, ...FactName[]]`, `isFactName(name): name is FactName`, `factValueFits(fact, value): boolean`, `describeFact(fact): string`.

- [ ] **Step 1: Create the package manifest and tsconfig**

`packages/rules/package.json`:

```json
{
  "name": "@elsewhere/rules",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "test": "node --import tsx --test \"test/**/*.test.ts\"",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "yaml": "^2.9.1", "zod": "^4.6.5" },
  "devDependencies": { "@types/node": "^22", "tsx": "^4.19.2", "typescript": "^5.5" }
}
```

`packages/rules/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "test"]
}
```

Create the empty data and data-case folders so git keeps them:

```bash
mkdir -p packages/rules/data/{flights,documents,money,hotels} packages/rules/test/data-cases
touch packages/rules/data/{flights,documents,money,hotels}/.gitkeep packages/rules/test/data-cases/.gitkeep
```

- [ ] **Step 2: Wire the package into the workspace**

In the root `package.json`, add `"test": "turbo test",` to `scripts`, right after `"typecheck": "turbo typecheck"`. Add a comma to the `typecheck` line so the JSON stays valid.

In `turbo.json`, add a `test` task next to `typecheck`:

```json
    "typecheck": {
      "dependsOn": ["^build"]
    },
    "test": {
      "outputs": []
    }
```

Then install from the repo root:

```bash
npm install
```

Expected: completes. `package-lock.json` now lists `packages/rules` with zod, yaml, and tsx.

- [ ] **Step 3: Write the failing test**

`packages/rules/test/facts.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTS, FactValueError, validateSituation } from '../src/facts';

test('every enum fact declares its values', () => {
  for (const [name, def] of Object.entries(FACTS)) {
    if (def.type === 'enum') assert.ok('values' in def && def.values.length > 0, name);
  }
});

test('validateSituation accepts well-typed facts and skips undefined', () => {
  validateSituation({
    'event.type': 'cancellation',
    'event.delay_minutes': 200,
    'flight.touches_us': true,
    'flight.carrier_iata': 'DL',
    'event.cause': undefined,
  });
});

test('validateSituation rejects unknown facts', () => {
  assert.throws(() => validateSituation({ 'flight.color': 'red' } as never), FactValueError);
});

test('validateSituation rejects values outside an enum', () => {
  assert.throws(() => validateSituation({ 'event.type': 'meteor' }), /expects one of cancellation/);
});

test('validateSituation rejects wrong primitive types', () => {
  assert.throws(() => validateSituation({ 'event.delay_minutes': '180' }), /expects a number/);
  assert.throws(() => validateSituation({ 'flight.touches_us': 'yes' }), /expects a boolean/);
  assert.throws(() => validateSituation({ 'event.delay_minutes': Number.NaN }), /expects a number/);
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/facts.test.ts`
Expected: FAIL. The output reports `ERR_MODULE_NOT_FOUND` for `src/facts`.

- [ ] **Step 5: Implement the facts vocabulary**

`packages/rules/src/facts.ts`:

```ts
export interface FactDef {
  type: 'enum' | 'number' | 'boolean' | 'string';
  values?: readonly string[];
  description: string;
}

const EVENT_TYPES = [
  'cancellation',
  'delay',
  'schedule_change',
  'denied_boarding',
  'downgrade',
  'missed_connection',
  'tarmac_delay',
  'bag_delayed',
  'bag_lost',
  'bag_damaged',
  'service_not_provided',
] as const;

export const FACTS = {
  'event.type': { type: 'enum', values: EVENT_TYPES, description: 'What happened to the trip.' },
  'event.delay_minutes': {
    type: 'number',
    description:
      'Length of the disruption in minutes. For delay, schedule_change, cancellation and missed_connection: ' +
      'how much later the passenger reaches the final destination than originally scheduled. ' +
      'For tarmac_delay: minutes on the tarmac without the chance to deplane. ' +
      'For bag_delayed: minutes since the flight arrived without the bag.',
  },
  'event.notice_days': { type: 'number', description: 'Days between the airline telling the passenger and the scheduled departure.' },
  'event.cause': {
    type: 'enum',
    values: ['controllable', 'uncontrollable', 'unknown'],
    description: 'Whether the airline caused the disruption. "unknown" when the airline has not said.',
  },
  'flight.carrier_iata': { type: 'string', description: 'Two-character IATA code of the operating carrier.' },
  'flight.carrier_is_us': { type: 'boolean', description: 'The operating carrier is a US airline.' },
  'flight.touches_us': { type: 'boolean', description: 'The flight departs from or arrives at a US airport.' },
  'flight.is_domestic_us': { type: 'boolean', description: 'Both airports are in the United States.' },
  'flight.departs_eu': { type: 'boolean', description: 'The flight departs from an airport in an EU member state.' },
  'flight.arrives_eu': { type: 'boolean', description: 'The flight arrives at an airport in an EU member state.' },
  'flight.carrier_is_eu': { type: 'boolean', description: 'The operating carrier is licensed in an EU member state.' },
  'flight.departs_uk': { type: 'boolean', description: 'The flight departs from an airport in the United Kingdom.' },
  'flight.distance_km': { type: 'number', description: 'Great-circle distance between origin and final destination, in km.' },
  'flight.single_ticket': { type: 'boolean', description: 'All flights in the journey are on one ticket or booking reference.' },
  'passenger.accepted_alternative': {
    type: 'boolean',
    description: 'The passenger accepted the rebooking, the changed flight, or a voucher or credit.',
  },
  'passenger.nationality': { type: 'string', description: 'ISO 3166 alpha-2 code of the passport the passenger travels on.' },
  'passenger.passport_months_valid_after_return': {
    type: 'number',
    description: 'Whole months the passport stays valid after the return date.',
  },
  'passenger.has_real_id': { type: 'boolean', description: 'The passenger holds a REAL ID-compliant card or another accepted ID.' },
  'passenger.payment_card_issuer': { type: 'string', description: 'Issuer of the card used to pay, kebab-case (e.g. chase).' },
  'trip.destination_country': { type: 'string', description: 'ISO 3166 alpha-2 code of the destination country.' },
  'trip.booked_via': { type: 'enum', values: ['direct', 'ota'], description: 'Booked with the airline or hotel directly, or through an online travel agency.' },
  'trip.hours_since_booking': { type: 'number', description: 'Hours since the booking was made.' },
  'trip.days_until_departure': { type: 'number', description: 'Days from now until the first departure.' },
  'lodging.kind': { type: 'enum', values: ['hotel', 'short_term_rental'], description: 'Kind of lodging.' },
  'lodging.booked_via': { type: 'enum', values: ['direct', 'ota'], description: 'Booked with the property directly, or through an online travel agency.' },
} as const satisfies Record<string, FactDef>;

export type FactName = keyof typeof FACTS;
/** Same shape as Partial<Record<FactName, Primitive>>; spelled out so facts.ts imports nothing. */
export type Situation = Partial<Record<FactName, string | number | boolean>>;

/** Internal: every fact name, as a tuple zod's enum accepts. */
export const FACT_NAMES = Object.keys(FACTS) as [FactName, ...FactName[]];

export class FactValueError extends Error {
  constructor(
    readonly fact: string,
    message: string,
  ) {
    super(message);
    this.name = 'FactValueError';
  }
}

export function isFactName(name: string): name is FactName {
  return Object.hasOwn(FACTS, name);
}

/** True when `value` fits the fact's declared type (and enum values). */
export function factValueFits(fact: FactName, value: unknown): boolean {
  const def: FactDef = FACTS[fact];
  switch (def.type) {
    case 'enum':
      return typeof value === 'string' && (def.values ?? []).includes(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'string':
      return typeof value === 'string';
  }
}

export function describeFact(fact: FactName): string {
  const def: FactDef = FACTS[fact];
  return def.type === 'enum' ? `one of ${(def.values ?? []).join(', ')}` : `a ${def.type}`;
}

/** Throws FactValueError if a value doesn't fit its FactDef. */
export function validateSituation(situation: Situation): void {
  for (const [name, value] of Object.entries(situation)) {
    if (value === undefined) continue;
    if (!isFactName(name)) throw new FactValueError(name, `Unknown fact "${name}"`);
    if (!factValueFits(name, value)) {
      throw new FactValueError(name, `Fact "${name}" expects ${describeFact(name)}, got ${JSON.stringify(value)}`);
    }
  }
}
```

`Situation` spells out `string | number | boolean` instead of importing `Primitive` from `schema.ts`. The shape is identical to the contract's `Partial<Record<FactName, Primitive>>`, and `facts.ts` stays import-free, so `schema.ts` can depend on it without a cycle.

- [ ] **Step 6: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test test/facts.test.ts && npx tsc --noEmit`
Expected: `ℹ pass 5`, `ℹ fail 0`, and no tsc output.

- [ ] **Step 7: Commit**

```bash
git add package.json turbo.json package-lock.json packages/rules
git commit -F - <<'EOF'
Add @elsewhere/rules with the closed facts vocabulary

Rules may only test facts from this list, so matching stays deterministic
and AI-drafted rules cannot invent conditions.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 2: Rule and source schemas

**Files:**
- Create: `packages/rules/src/schema.ts`, `packages/rules/test/helpers.ts`, `packages/rules/test/schema.test.ts`, and five fixture rules under `packages/rules/test/fixtures/rules/`

**Interfaces:**
- Consumes: `FACT_NAMES`, `FactName` from `facts.ts`.
- Produces (public, exactly as in the contract): `RULE_STATUSES`, `RuleStatus`, `DOMAINS`, `Domain`, `CHARACTERS`, `Character`, `ENTITLEMENT_KINDS`, `SOURCE_KINDS`, `SourceKind`, `Primitive`, `Condition`, `ConditionGroup`, `ConditionNode`, `Quote`, `RuleSourceRef`, `Rule` (including `replaced_by?` and `history`), `RuleHistoryEntry`, `Detector`, `Source`, `JURISDICTION_PATTERN`, `RuleSchema: z.ZodType<Rule>`, `SourceSchema: z.ZodType<Source>`.
- `RuleSchema` also enforces:
  - `last_verified`, `verified_by`, and `review_by` are non-null unless the status is `draft`.
  - Source ref ids are unique within a rule.
  - `replaced_by` appears only on `retired` rules.
  - The last `history` entry equals `{ version, status }`.
  - History versions never decrease.
- Test helpers: `FIXTURES` (absolute path to `test/fixtures/`), `readFixtureRule(id): Record<string, unknown>`.

- [ ] **Step 1: Write the fixture rules**

These are synthetic rules with `fx-` ids. Their quotes come from fixture texts added in Task 5. Later tasks and track D's tests reuse them.

`packages/rules/test/fixtures/rules/fx-us-refund-cancelled-flight.yaml`:

```yaml
id: fx-us-refund-cancelled-flight
version: 1
status: verified
domain: flights
jurisdiction: US-DOT
title: "Fixture: cancelled flight refund"
summary: >-
  If the airline cancels and you don't accept the alternative or a voucher, you get a
  refund to your original payment method.
applies_when:
  all:
    - fact: event.type
      in: [cancellation]
    - fact: flight.touches_us
      eq: true
    - fact: passenger.accepted_alternative
      eq: false
entitlement:
  kind: refund
  amount: { basis: full_ticket_price, payment: original_method }
  timing: "7 business days for card purchases"
how_to_claim:
  steps:
    - "Decline the alternative flight and any voucher."
    - "Ask for the refund in writing."
  templates: [airline_refund_request]
exceptions:
  - "Does not apply if you accept the alternative flight or a voucher."
sources:
  - id: s1
    source: fx-dot-refunds
    quotes:
      - text: "A carrier must provide a prompt refund to a passenger whose flight is cancelled when the passenger does not accept an alternative flight or a voucher."
        supports: [summary, applies_when]
      - text: "Refunds go back to the original form of payment within 7 business days for credit card purchases."
        supports: [entitlement.amount, entitlement.timing]
lead_character: pigeon
tags: [fixture, refund]
last_verified: 2026-10-06
verified_by: fixture
review_by: 2027-01-04
history:
  - { version: 1, status: draft, date: 2026-10-01 }
  - { version: 1, status: verified, date: 2026-10-06 }
```

`packages/rules/test/fixtures/rules/fx-eu261-delay-compensation.yaml`:

```yaml
id: fx-eu261-delay-compensation
version: 1
status: verified
domain: flights
jurisdiction: EU-261
title: "Fixture: EU261 delay compensation"
summary: >-
  Arriving 3 hours or more late on a covered flight earns compensation unless the airline
  proves extraordinary circumstances.
applies_when:
  all:
    - any:
        - fact: flight.departs_eu
          eq: true
        - all:
            - fact: flight.arrives_eu
              eq: true
            - fact: flight.carrier_is_eu
              eq: true
    - fact: event.type
      in: [delay]
    - fact: event.delay_minutes
      gte: 180
    - fact: event.cause
      in: [controllable, unknown]
entitlement:
  kind: compensation
  amount: { currency: EUR, up_to_1500_km: 250 }
how_to_claim:
  steps:
    - "Claim from the operating airline in writing."
  templates: [eu261_claim_letter]
exceptions:
  - "Not owed if the airline proves extraordinary circumstances."
sources:
  - id: s1
    source: fx-eu-guidance
    quotes:
      - text: 'If you arrived at your final destination with a delay of 3 hours or more, you are entitled to compensation, unless the delay was due to "extraordinary circumstances".'
        supports: [summary, applies_when, exceptions]
      - text: "Compensation is 250 euro for flights of 1 500 km or less."
        supports: [entitlement.amount]
lead_character: pigeon
tags: [fixture, compensation]
last_verified: 2026-10-06
verified_by: fixture
review_by: 2027-01-04
history:
  - { version: 1, status: draft, date: 2026-10-01 }
  - { version: 1, status: verified, date: 2026-10-06 }
```

`packages/rules/test/fixtures/rules/fx-missed-connection-single-ticket.yaml`:

```yaml
id: fx-missed-connection-single-ticket
version: 1
status: verified
domain: flights
jurisdiction: "carrier:XA"
title: "Fixture: missed connection on one ticket"
summary: >-
  Miss a connection on the same ticket and the airline rebooks you on the next available
  flight at no charge.
applies_when:
  all:
    - fact: event.type
      in: [missed_connection]
    - fact: flight.single_ticket
      eq: true
entitlement:
  kind: rebooking
how_to_claim:
  steps:
    - "Go to the transfer desk and ask to be rebooked on the next available flight."
  templates: []
exceptions:
  - "Separate tickets are not covered."
sources:
  - id: s1
    source: fx-carrier-coc
    quotes:
      - text: "Example Air will rebook a passenger who misses a connection on the same ticket on the next available flight at no extra charge."
        supports: [summary, applies_when, entitlement]
      - text: "Passengers holding separate tickets are not covered by this protection."
        supports: [exceptions]
lead_character: raccoon
tags: [fixture, connection]
last_verified: 2026-10-06
verified_by: fixture
review_by: 2027-01-04
history:
  - { version: 1, status: draft, date: 2026-10-01 }
  - { version: 1, status: verified, date: 2026-10-06 }
```

`packages/rules/test/fixtures/rules/fx-24h-free-cancellation.yaml`:

```yaml
id: fx-24h-free-cancellation
version: 1
status: verified
domain: flights
jurisdiction: US-DOT
title: "Fixture: 24-hour free cancellation"
summary: >-
  Booked directly at least 7 days out? You can cancel within 24 hours without penalty.
applies_when:
  all:
    - fact: trip.hours_since_booking
      lte: 24
    - fact: trip.days_until_departure
      gte: 7
    - fact: trip.booked_via
      eq: direct
    - fact: flight.touches_us
      eq: true
entitlement:
  kind: refund
  timing: "within 24 hours of booking"
how_to_claim:
  steps:
    - "Cancel on the airline's website within 24 hours of booking."
  templates: []
exceptions: []
sources:
  - id: s1
    source: fx-dot-reservations
    quotes:
      - text: "A carrier must allow reservations made 7 days or more before departure to be cancelled within 24 hours without penalty."
        supports: [summary, applies_when, entitlement]
lead_character: owl
tags: [fixture, booking]
last_verified: 2026-10-06
verified_by: fixture
review_by: 2027-01-04
history:
  - { version: 1, status: draft, date: 2026-10-01 }
  - { version: 1, status: verified, date: 2026-10-06 }
```

`packages/rules/test/fixtures/rules/fx-draft-cancellation-note.yaml`:

```yaml
id: fx-draft-cancellation-note
version: 1
status: draft
domain: flights
jurisdiction: US-DOT
title: "Fixture: a draft rule"
summary: "A draft that matching must ignore by default."
applies_when:
  all:
    - fact: event.type
      in: [cancellation]
entitlement:
  kind: refund
how_to_claim:
  steps:
    - "Not used."
  templates: []
exceptions: []
sources:
  - id: s1
    source: fx-dot-refunds
    quotes:
      - text: "A carrier must provide a prompt refund to a passenger whose flight is cancelled when the passenger does not accept an alternative flight or a voucher."
        supports: [summary, entitlement]
lead_character: pigeon
tags: [fixture]
last_verified: null
verified_by: null
review_by: null
history:
  - { version: 1, status: draft, date: 2026-10-01 }
```

- [ ] **Step 2: Write the test helper and the failing schema test**

`packages/rules/test/helpers.ts`:

```ts
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

export function readFixtureRule(id: string): Record<string, unknown> {
  return parse(readFileSync(join(FIXTURES, 'rules', `${id}.yaml`), 'utf8'));
}
```

`packages/rules/test/schema.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RuleSchema, SourceSchema } from '../src/schema';
import { readFixtureRule } from './helpers';

const valid = () => readFixtureRule('fx-us-refund-cancelled-flight');

function issuesOf(input: unknown): string[] {
  const result = RuleSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
}

test('a well-formed rule parses', () => {
  assert.deepEqual(issuesOf(valid()), []);
});

test('a draft may leave verification fields null', () => {
  assert.deepEqual(issuesOf(readFixtureRule('fx-draft-cancellation-note')), []);
});

test('verified rules need verification fields', () => {
  const rule = { ...valid(), last_verified: null };
  assert.match(issuesOf(rule).join('\n'), /last_verified: is required when status is verified/);
});

test('unknown top-level keys are rejected', () => {
  assert.notDeepEqual(issuesOf({ ...valid(), notes: 'x' }), []);
});

test('jurisdiction must match the known pattern', () => {
  assert.match(issuesOf({ ...valid(), jurisdiction: 'US-FAA' }).join('\n'), /jurisdiction: is not a known jurisdiction/);
  assert.deepEqual(issuesOf({ ...valid(), jurisdiction: 'carrier:B6' }), []);
  assert.deepEqual(issuesOf({ ...valid(), jurisdiction: 'issuer:chase' }), []);
  assert.deepEqual(issuesOf({ ...valid(), jurisdiction: 'country:GB' }), []);
});

test('ids must be kebab-case', () => {
  assert.match(issuesOf({ ...valid(), id: 'Refund_Rule' }).join('\n'), /id: must be kebab-case/);
});

test('a condition may carry only one operator', () => {
  const rule = valid();
  rule.applies_when = { all: [{ fact: 'event.type', eq: 'cancellation', in: ['delay'] }] };
  assert.notDeepEqual(issuesOf(rule), []);
});

test('conditions must name known facts', () => {
  const rule = valid();
  rule.applies_when = { all: [{ fact: 'flight.color', eq: 'red' }] };
  assert.notDeepEqual(issuesOf(rule), []);
});

test('duplicate source ref ids are rejected', () => {
  const rule = valid() as { sources: { id: string }[] };
  rule.sources = [rule.sources[0], { ...rule.sources[0] }];
  assert.match(issuesOf(rule).join('\n'), /duplicate source id "s1"/);
});

test('summary is capped at 400 characters', () => {
  assert.notDeepEqual(issuesOf({ ...valid(), summary: 'x'.repeat(401) }), []);
});

test('the last history entry must match version and status', () => {
  const rule = { ...valid(), history: [{ version: 1, status: 'draft', date: '2026-10-01' }] };
  assert.match(issuesOf(rule).join('\n'), /history\.0: last history entry must be version 1, status verified/);
});

test('history versions never decrease', () => {
  const rule = {
    ...valid(),
    history: [
      { version: 2, status: 'draft', date: '2026-10-01' },
      { version: 1, status: 'verified', date: '2026-10-06' },
    ],
  };
  assert.match(issuesOf(rule).join('\n'), /history\.1\.version: history versions never decrease/);
});

test('only retired rules may set replaced_by', () => {
  assert.match(issuesOf({ ...valid(), replaced_by: 'fx-other' }).join('\n'), /replaced_by: only retired rules may set replaced_by/);
  const retired = {
    ...valid(),
    status: 'retired',
    replaced_by: 'fx-other',
    history: [...(valid().history as object[]), { version: 1, status: 'retired', date: '2026-12-01', note: 'merged into fx-other' }],
  };
  assert.deepEqual(issuesOf(retired), []);
});

test('sources need an https url and a known detector', () => {
  const ok = { key: 'fx-a', url: 'https://example.gov/a', kind: 'regulation', detector: { ecfr: { title: 14, part: 260 } } };
  assert.equal(SourceSchema.safeParse(ok).success, true);
  assert.equal(SourceSchema.safeParse({ ...ok, url: 'http://example.gov/a' }).success, false);
  assert.equal(SourceSchema.safeParse({ ...ok, detector: { rss: {} } }).success, false);
  assert.equal(SourceSchema.safeParse({ ...ok, kind: 'blog' }).success, false);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/schema.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/schema`.

- [ ] **Step 4: Implement the schema**

`packages/rules/src/schema.ts`:

```ts
import { z } from 'zod';
import { FACT_NAMES, type FactName } from './facts';

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
  supports: string[];
}

export interface RuleSourceRef {
  id: string;
  source: string;
  quotes: Quote[];
}

export interface Rule {
  id: string;
  version: number;
  status: RuleStatus;
  domain: Domain;
  jurisdiction: string;
  title: string;
  summary: string;
  applies_when: ConditionGroup;
  entitlement: {
    kind: (typeof ENTITLEMENT_KINDS)[number];
    amount?: Record<string, Primitive | Primitive[]>;
    timing?: string;
  };
  how_to_claim: { steps: string[]; templates: string[] };
  exceptions: string[];
  sources: RuleSourceRef[];
  lead_character: Character;
  tags: string[];
  last_verified: string | null;
  verified_by: string | null;
  review_by: string | null;
  replaced_by?: string;
  history: RuleHistoryEntry[];
}

export interface RuleHistoryEntry {
  version: number;
  status: RuleStatus;
  date: string;
  note?: string;
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

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const PrimitiveSchema = z.union([z.string(), z.number(), z.boolean()]);
const FactSchema = z.enum(FACT_NAMES);

const ConditionSchema: z.ZodType<Condition> = z.union([
  z.strictObject({ fact: FactSchema, eq: PrimitiveSchema }),
  z.strictObject({ fact: FactSchema, in: z.array(PrimitiveSchema).min(1) }),
  z.strictObject({ fact: FactSchema, gte: z.number() }),
  z.strictObject({ fact: FactSchema, lte: z.number() }),
  z.strictObject({ fact: FactSchema, gt: z.number() }),
  z.strictObject({ fact: FactSchema, lt: z.number() }),
  z.strictObject({ fact: FactSchema, exists: z.boolean() }),
]);

const ConditionNodeSchema: z.ZodType<ConditionNode> = z.lazy(() =>
  z.union([ConditionSchema, ConditionGroupSchema]),
);

const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(ConditionNodeSchema).min(1) }),
    z.strictObject({ any: z.array(ConditionNodeSchema).min(1) }),
  ]),
);

const RuleObjectSchema = z.strictObject({
  id: z.string().regex(KEBAB, 'must be kebab-case'),
  version: z.number().int().min(1),
  status: z.enum(RULE_STATUSES),
  domain: z.enum(DOMAINS),
  jurisdiction: z.string().regex(JURISDICTION_PATTERN, 'is not a known jurisdiction'),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(400),
  applies_when: ConditionGroupSchema,
  entitlement: z.strictObject({
    kind: z.enum(ENTITLEMENT_KINDS),
    amount: z.record(z.string(), z.union([PrimitiveSchema, z.array(PrimitiveSchema)])).optional(),
    timing: z.string().min(1).optional(),
  }),
  how_to_claim: z.strictObject({
    steps: z.array(z.string().min(1)).min(1),
    templates: z.array(z.string().regex(/^[a-z0-9_]+$/, 'must be snake_case')),
  }),
  exceptions: z.array(z.string().min(1)),
  sources: z
    .array(
      z.strictObject({
        id: z.string().min(1),
        source: z.string().regex(KEBAB, 'must be a kebab-case source key'),
        quotes: z
          .array(z.strictObject({ text: z.string().min(1), supports: z.array(z.string().min(1)).min(1) }))
          .min(1),
      }),
    )
    .min(1),
  lead_character: z.enum(CHARACTERS),
  tags: z.array(z.string().min(1)),
  last_verified: z.iso.date().nullable(),
  verified_by: z.string().min(1).nullable(),
  review_by: z.iso.date().nullable(),
  replaced_by: z.string().regex(KEBAB, 'must be a rule id').optional(),
  history: z
    .array(
      z.strictObject({
        version: z.number().int().min(1),
        status: z.enum(RULE_STATUSES),
        date: z.iso.date(),
        note: z.string().min(1).max(200).optional(),
      }),
    )
    .min(1),
});

export const RuleSchema: z.ZodType<Rule> = RuleObjectSchema.superRefine((rule, ctx) => {
  if (rule.status !== 'draft') {
    for (const key of ['last_verified', 'verified_by', 'review_by'] as const) {
      if (rule[key] === null) {
        ctx.addIssue({ code: 'custom', path: [key], message: `is required when status is ${rule.status}` });
      }
    }
  }
  if (rule.replaced_by !== undefined && rule.status !== 'retired') {
    ctx.addIssue({ code: 'custom', path: ['replaced_by'], message: 'only retired rules may set replaced_by' });
  }
  const last = rule.history.at(-1);
  if (last && (last.version !== rule.version || last.status !== rule.status)) {
    ctx.addIssue({
      code: 'custom',
      path: ['history', rule.history.length - 1],
      message: `last history entry must be version ${rule.version}, status ${rule.status}`,
    });
  }
  rule.history.forEach((entry, index) => {
    const previous = rule.history[index - 1];
    if (previous && entry.version < previous.version) {
      ctx.addIssue({ code: 'custom', path: ['history', index, 'version'], message: 'history versions never decrease' });
    }
  });
  const seen = new Set<string>();
  rule.sources.forEach((ref, index) => {
    if (seen.has(ref.id)) {
      ctx.addIssue({ code: 'custom', path: ['sources', index, 'id'], message: `duplicate source id "${ref.id}"` });
    }
    seen.add(ref.id);
  });
});

const DetectorSchema: z.ZodType<Detector> = z.union([
  z.strictObject({ ota: z.strictObject({ service: z.string().min(1), terms_type: z.string().min(1) }) }),
  z.strictObject({ ecfr: z.strictObject({ title: z.number().int().min(1), part: z.number().int().min(1) }) }),
  z.strictObject({ changedetection: z.strictObject({ watch_uuid: z.string().min(1) }) }),
]);

export const SourceSchema: z.ZodType<Source> = z.strictObject({
  key: z.string().regex(KEBAB, 'must be kebab-case'),
  url: z.url({ protocol: /^https$/ }),
  kind: z.enum(SOURCE_KINDS),
  detector: DetectorSchema,
});
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 19`, `ℹ fail 0`, clean tsc.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Define the rule and source schemas with fixture rules

Rules carry their own append-only history so the changes feed never
depends on git depth; the schema enforces that the last entry matches
the rule's current version and status.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 3: Three-valued matcher and the golden match cases

**Files:**
- Create: `packages/rules/src/match.ts`, `packages/rules/test/match.test.ts`, and 13 golden cases in `packages/rules/test/fixtures/match/`

**Interfaces:**
- Consumes: `validateSituation`, `FactName`, `Situation` (facts); `ConditionNode`, `Rule`, `RuleStatus`, `RuleSchema` (schema); `FIXTURES`, `readFixtureRule` (helpers).
- Produces (public): `MatchOutcome`, `MatchResult { rule_id, rule_version, outcome, missing_facts }`, `matchRule(rule, situation): MatchResult`, `matchRules(rules, situation, opts?): MatchResult[]`.
- Golden case files are `{ name, situation, rules: [fixture rule ids], expect: [{ rule_id, outcome, missing_facts }] }`. `expect` compares those three fields only, not `rule_version`, and track D's `POST /api/rules/match` tests use the same projection. The scenarios are ported from `apps/api/lib/assist/mock-trip-guides.ts`:
  - **Tokyo:** the UA voucher or credit path, and a direct booking inside 24 hours.
  - **Paris:** the DL JFK→CDG outbound, which EU261 doesn't cover, and the return, which it does.
  - **Bali:** an SQ missed connection on one ticket.

- [ ] **Step 1: Write the golden cases**

`packages/rules/test/fixtures/match/us-cancellation-declined-rebooking.yaml`:

```yaml
name: cancelled US flight, declined rebooking
situation: { event.type: cancellation, flight.touches_us: true, passenger.accepted_alternative: false }
rules: [fx-us-refund-cancelled-flight]
expect:
  - { rule_id: fx-us-refund-cancelled-flight, outcome: applies, missing_facts: [] }
```

`packages/rules/test/fixtures/match/us-cancellation-accepted-voucher.yaml`:

```yaml
name: cancelled US flight, voucher accepted (Tokyo scenario keeps value as credit)
situation: { event.type: cancellation, flight.touches_us: true, passenger.accepted_alternative: true }
rules: [fx-us-refund-cancelled-flight]
expect: []
```

`packages/rules/test/fixtures/match/us-cancellation-choice-unknown.yaml`:

```yaml
name: cancelled US flight, passenger has not decided yet
situation: { event.type: cancellation, flight.touches_us: true }
rules: [fx-us-refund-cancelled-flight]
expect:
  - { rule_id: fx-us-refund-cancelled-flight, outcome: may_apply, missing_facts: [passenger.accepted_alternative] }
```

`packages/rules/test/fixtures/match/paris-outbound-us-carrier-delay.yaml`:

```yaml
name: Paris scenario, DL JFK to CDG delayed 4h (US carrier into the EU is not covered)
situation:
  event.type: delay
  event.delay_minutes: 240
  event.cause: controllable
  flight.carrier_iata: DL
  flight.carrier_is_eu: false
  flight.departs_eu: false
  flight.arrives_eu: true
rules: [fx-eu261-delay-compensation]
expect: []
```

`packages/rules/test/fixtures/match/paris-return-departs-eu-delay.yaml`:

```yaml
name: Paris scenario, return CDG to JFK delayed 4h, cause not given yet
situation:
  event.type: delay
  event.delay_minutes: 240
  event.cause: unknown
  flight.departs_eu: true
  flight.arrives_eu: false
rules: [fx-eu261-delay-compensation]
expect:
  - { rule_id: fx-eu261-delay-compensation, outcome: applies, missing_facts: [] }
```

`packages/rules/test/fixtures/match/eu-delay-cause-absent.yaml`:

```yaml
name: EU departure delayed 3h, airline has said nothing about the cause
situation: { event.type: delay, event.delay_minutes: 180, flight.departs_eu: true }
rules: [fx-eu261-delay-compensation]
expect:
  - { rule_id: fx-eu261-delay-compensation, outcome: may_apply, missing_facts: [event.cause] }
```

`packages/rules/test/fixtures/match/eu-scope-unknown.yaml`:

```yaml
name: delay with no route facts yet asks for every scope fact that could decide it
situation: { event.type: delay, event.delay_minutes: 200, event.cause: controllable }
rules: [fx-eu261-delay-compensation]
expect:
  - rule_id: fx-eu261-delay-compensation
    outcome: may_apply
    missing_facts: [flight.departs_eu, flight.arrives_eu, flight.carrier_is_eu]
```

`packages/rules/test/fixtures/match/bali-missed-connection-single-ticket.yaml`:

```yaml
name: Bali scenario, SQ DPS to SIN to SFO, missed connection on one ticket
situation: { event.type: missed_connection, flight.single_ticket: true, flight.touches_us: true }
rules: [fx-missed-connection-single-ticket, fx-us-refund-cancelled-flight]
expect:
  - { rule_id: fx-missed-connection-single-ticket, outcome: applies, missing_facts: [] }
```

`packages/rules/test/fixtures/match/bali-missed-connection-separate-tickets.yaml`:

```yaml
name: missed connection across separate tickets is not protected
situation: { event.type: missed_connection, flight.single_ticket: false }
rules: [fx-missed-connection-single-ticket]
expect: []
```

`packages/rules/test/fixtures/match/tokyo-booked-yesterday-direct.yaml`:

```yaml
name: Tokyo scenario, booked on united.com 20 hours ago, departs in 30 days
situation: { trip.hours_since_booking: 20, trip.days_until_departure: 30, trip.booked_via: direct, flight.touches_us: true }
rules: [fx-24h-free-cancellation]
expect:
  - { rule_id: fx-24h-free-cancellation, outcome: applies, missing_facts: [] }
```

`packages/rules/test/fixtures/match/tokyo-booked-via-ota.yaml`:

```yaml
name: same trip booked through an OTA falls outside the airline's 24-hour rule
situation: { trip.hours_since_booking: 20, trip.days_until_departure: 30, trip.booked_via: ota, flight.touches_us: true }
rules: [fx-24h-free-cancellation]
expect: []
```

`packages/rules/test/fixtures/match/drafts-are-ignored.yaml`:

```yaml
name: draft rules never match by default
situation: { event.type: cancellation, flight.touches_us: true, passenger.accepted_alternative: false }
rules: [fx-draft-cancellation-note, fx-us-refund-cancelled-flight]
expect:
  - { rule_id: fx-us-refund-cancelled-flight, outcome: applies, missing_facts: [] }
```

`packages/rules/test/fixtures/match/applies-sorts-before-may-apply.yaml`:

```yaml
name: applies results sort before may_apply results
situation: { event.type: cancellation, flight.touches_us: true, trip.hours_since_booking: 2, trip.days_until_departure: 10, trip.booked_via: direct }
rules: [fx-us-refund-cancelled-flight, fx-24h-free-cancellation]
expect:
  - { rule_id: fx-24h-free-cancellation, outcome: applies, missing_facts: [] }
  - { rule_id: fx-us-refund-cancelled-flight, outcome: may_apply, missing_facts: [passenger.accepted_alternative] }
```

- [ ] **Step 2: Write the failing matcher test**

`packages/rules/test/match.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { FactValueError } from '../src/facts';
import { matchRule, matchRules } from '../src/match';
import { RuleSchema, type ConditionGroup, type Rule } from '../src/schema';
import { FIXTURES, readFixtureRule } from './helpers';

const fixtureRule = (id: string): Rule => RuleSchema.parse(readFixtureRule(id));

function ruleWith(applies_when: ConditionGroup): Rule {
  return { ...fixtureRule('fx-us-refund-cancelled-flight'), applies_when };
}

test('each comparison operator', () => {
  const s = { 'event.delay_minutes': 180 } as const;
  const outcome = (cond: object) => matchRule(ruleWith({ all: [{ fact: 'event.delay_minutes', ...cond } as never] }), s).outcome;
  assert.equal(outcome({ gte: 180 }), 'applies');
  assert.equal(outcome({ gt: 180 }), 'does_not_apply');
  assert.equal(outcome({ lte: 180 }), 'applies');
  assert.equal(outcome({ lt: 180 }), 'does_not_apply');
  assert.equal(outcome({ eq: 180 }), 'applies');
  assert.equal(outcome({ in: [60, 180] }), 'applies');
});

test('exists never yields unknown', () => {
  const rule = ruleWith({ all: [{ fact: 'event.cause', exists: false }] });
  assert.equal(matchRule(rule, {}).outcome, 'applies');
  assert.equal(matchRule(rule, { 'event.cause': 'unknown' }).outcome, 'does_not_apply');
});

test('a false child decides all even when others are unknown', () => {
  const rule = ruleWith({ all: [{ fact: 'event.type', in: ['delay'] }, { fact: 'flight.touches_us', eq: true }] });
  assert.deepEqual(matchRule(rule, { 'event.type': 'cancellation' }), {
    rule_id: rule.id, rule_version: 1, outcome: 'does_not_apply', missing_facts: [],
  });
});

test('a true child decides any even when others are unknown', () => {
  const rule = ruleWith({ any: [{ fact: 'flight.departs_eu', eq: true }, { fact: 'flight.carrier_is_eu', eq: true }] });
  assert.equal(matchRule(rule, { 'flight.departs_eu': true }).outcome, 'applies');
});

test('missing facts are de-duplicated in first-appearance order', () => {
  const rule = ruleWith({
    all: [
      { fact: 'flight.touches_us', eq: true },
      { any: [{ fact: 'flight.touches_us', eq: true }, { fact: 'event.type', in: ['delay'] }] },
    ],
  });
  assert.deepEqual(matchRule(rule, {}).missing_facts, ['flight.touches_us', 'event.type']);
});

test('matchRule rejects badly typed situations', () => {
  assert.throws(() => matchRule(fixtureRule('fx-us-refund-cancelled-flight'), { 'flight.touches_us': 'yes' }), FactValueError);
});

test('matchRules can include other statuses on request', () => {
  const draft = fixtureRule('fx-draft-cancellation-note');
  const results = matchRules([draft], { 'event.type': 'cancellation' }, { statuses: ['draft'] });
  assert.equal(results[0]?.outcome, 'applies');
});

const matchDir = join(FIXTURES, 'match');
for (const file of readdirSync(matchDir).filter((f) => f.endsWith('.yaml')).sort()) {
  const golden = parse(readFileSync(join(matchDir, file), 'utf8'));
  test(`golden: ${golden.name}`, () => {
    const rules = (golden.rules as string[]).map(fixtureRule);
    const actual = matchRules(rules, golden.situation).map(({ rule_id, outcome, missing_facts }) => ({
      rule_id,
      outcome,
      missing_facts,
    }));
    assert.deepEqual(actual, golden.expect);
  });
}
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/match.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/match`.

- [ ] **Step 4: Implement the matcher**

`packages/rules/src/match.ts`:

```ts
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
```

How evaluation works:
- `exists` is the one operator that never yields unknown, because an absent fact is itself the answer.
- `missing_facts` lists only facts inside unknown subtrees. They are de-duplicated in first-appearance order, so a fact that can't change the result is never requested.

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 39`, `ℹ fail 0`, clean tsc.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Add the three-valued matcher and golden match cases

A fact the caller doesn't supply is unknown, not false, so Assist can
ask the planner instead of silently dropping a rule. The golden cases
port the old mock trip guides and are shared with track D's API tests.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 4: Loading and validating rule files

**Files:**
- Create: `packages/rules/src/load.ts`, `packages/rules/test/load.test.ts`, `packages/rules/test/fixtures/sources.yaml`

**Interfaces:**
- Consumes: `describeFact`, `factValueFits`, `FACTS`, `isFactName` (facts); `DOMAINS`, `RuleSchema`, `SourceSchema`, `Rule`, `Source` (schema).
- Produces (public): `RulesValidationError` (`issues: { file, path, message }[]`), `loadSources(file?)`, `loadRules(opts?)`. `loadRules` validates:
  - the schema
  - unique ids
  - file name = id
  - a domain folder that matches the rule's domain, when the folder is named after a domain
  - known facts and fact value types, with precise messages
  - that cited sources exist
  - the history invariants (via `RuleSchema`)
  - that `replaced_by` names an existing rule
- Produces (internal, used by CLIs): `PACKAGE_ROOT`, `DEFAULT_DATA_DIR`, `DEFAULT_SOURCES_FILE`, `ValidationIssue`, `loadRuleFiles(opts?): { rule, file }[]`.

- [ ] **Step 1: Write the fixture sources**

`packages/rules/test/fixtures/sources.yaml`:

```yaml
fx-dot-refunds:
  url: https://example.gov/refunds
  kind: regulation
  detector: { ecfr: { title: 14, part: 260 } }
fx-dot-reservations:
  url: https://example.gov/reservations
  kind: regulation
  detector: { ecfr: { title: 14, part: 259 } }
fx-eu-guidance:
  url: https://example.eu/air-passenger-rights
  kind: agency_guidance
  detector: { ota: { service: "Example EU Guidance", terms_type: "Official Guidance" } }
fx-carrier-coc:
  url: https://example.com/contract-of-carriage
  kind: contract_of_carriage
  detector: { ota: { service: "Example Air", terms_type: "Conditions of Carriage" } }
```

- [ ] **Step 2: Write the failing test**

`packages/rules/test/load.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRules, loadSources, RulesValidationError } from '../src/load';
import { FIXTURES } from './helpers';

const sources = () => loadSources(join(FIXTURES, 'sources.yaml'));

function tempData(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rules-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const fixtureYaml = (id: string) => readFileSync(join(FIXTURES, 'rules', `${id}.yaml`), 'utf8');

function issues(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof RulesValidationError) return error.issues.map((i) => `${i.file} ${i.path}: ${i.message}`).join('\n');
    throw error;
  }
  return '';
}

test('loadSources reads fixture sources and attaches keys', () => {
  const s = sources();
  assert.equal(s['fx-dot-refunds']?.key, 'fx-dot-refunds');
  assert.deepEqual(s['fx-eu-guidance']?.detector, { ota: { service: 'Example EU Guidance', terms_type: 'Official Guidance' } });
});

test('loadSources rejects bad entries with their key in the path', () => {
  const dir = tempData({ 'sources.yaml': 'bad-one:\n  url: http://x.gov\n  kind: regulation\n  detector: { ecfr: { title: 14, part: 1 } }\n' });
  assert.match(issues(() => loadSources(join(dir, 'sources.yaml'))), /bad-one\.url/);
});

test('loadRules loads every fixture rule sorted by id', () => {
  const rules = loadRules({ dataDir: join(FIXTURES, 'rules'), sources: sources() });
  assert.deepEqual(rules.map((r) => r.id), [
    'fx-24h-free-cancellation',
    'fx-draft-cancellation-note',
    'fx-eu261-delay-compensation',
    'fx-missed-connection-single-ticket',
    'fx-us-refund-cancelled-flight',
  ]);
});

test('a missing data directory loads as no rules', () => {
  assert.deepEqual(loadRules({ dataDir: join(tmpdir(), 'does-not-exist-rules'), sources: sources() }), []);
});

test('file name must equal the rule id', () => {
  const dir = tempData({ 'flights/wrong-name.yaml': fixtureYaml('fx-us-refund-cancelled-flight') });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /file name must be fx-us-refund-cancelled-flight\.yaml/);
});

test('domain folder must match the rule domain', () => {
  const dir = tempData({ 'money/fx-us-refund-cancelled-flight.yaml': fixtureYaml('fx-us-refund-cancelled-flight') });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /rule is in money\/ but its domain is flights/);
});

test('ids must be unique across files', () => {
  const dir = tempData({
    'flights/fx-us-refund-cancelled-flight.yaml': fixtureYaml('fx-us-refund-cancelled-flight'),
    'hotels/fx-us-refund-cancelled-flight.yaml': fixtureYaml('fx-us-refund-cancelled-flight').replace('domain: flights', 'domain: hotels'),
  });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /duplicate id/);
});

test('every cited source must exist in sources.yaml', () => {
  const dir = tempData({
    'fx-us-refund-cancelled-flight.yaml': fixtureYaml('fx-us-refund-cancelled-flight').replaceAll('source: fx-dot-refunds', 'source: fx-missing'),
  });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /unknown source "fx-missing"/);
});

test('conditions get precise messages for unknown facts and bad values', () => {
  const yaml = fixtureYaml('fx-us-refund-cancelled-flight')
    .replace('fact: flight.touches_us', 'fact: flight.color')
    .replace('in: [cancellation]', 'in: [meteor]');
  const dir = tempData({ 'fx-us-refund-cancelled-flight.yaml': yaml });
  const found = issues(() => loadRules({ dataDir: dir, sources: sources() }));
  assert.match(found, /applies_when\.all\.1: unknown fact "flight\.color"/);
  assert.match(found, /applies_when\.all\.0: "event\.type" expects one of cancellation/);
});

test('numeric operators only work on number facts', () => {
  const yaml = fixtureYaml('fx-us-refund-cancelled-flight').replace(/fact: flight\.touches_us\n\s+eq: true/, 'fact: flight.touches_us\n      gte: 1');
  const dir = tempData({ 'fx-us-refund-cancelled-flight.yaml': yaml });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /gte only works on number facts/);
});

test('replaced_by must name a rule in the library', () => {
  const retired = fixtureYaml('fx-us-refund-cancelled-flight')
    .replace('status: verified', 'status: retired\nreplaced_by: fx-nowhere')
    .replace(/history:\n[\s\S]*$/, 'history:\n  - { version: 1, status: retired, date: 2026-12-01 }\n');
  const dir = tempData({ 'fx-us-refund-cancelled-flight.yaml': retired });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /replaced_by: no rule "fx-nowhere"/);
});

test('invalid YAML is reported, not thrown raw', () => {
  const dir = tempData({ 'broken.yaml': 'id: [unclosed\n' });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /invalid YAML/);
});

test('copying the fixtures into a domain layout still loads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rules-'));
  cpSync(join(FIXTURES, 'rules'), join(dir, 'flights'), { recursive: true });
  assert.equal(loadRules({ dataDir: dir, sources: sources() }).length, 5);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/load.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/load`.

- [ ] **Step 4: Implement the loader**

`packages/rules/src/load.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describeFact, factValueFits, FACTS, isFactName } from './facts';
import { DOMAINS, RuleSchema, SourceSchema, type Rule, type Source } from './schema';

export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_DATA_DIR = join(PACKAGE_ROOT, 'data');
export const DEFAULT_SOURCES_FILE = join(PACKAGE_ROOT, 'sources.yaml');

export interface ValidationIssue {
  file: string;
  path: string;
  message: string;
}

export class RulesValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    const lines = issues.slice(0, 20).map((i) => `  ${i.file}${i.path ? ` → ${i.path}` : ''}: ${i.message}`);
    const more = issues.length > 20 ? `\n  …and ${issues.length - 20} more` : '';
    super(`${issues.length} rule validation issue(s):\n${lines.join('\n')}${more}`);
    this.name = 'RulesValidationError';
  }
}

export function loadSources(file: string = DEFAULT_SOURCES_FILE): Record<string, Source> {
  const raw: unknown = parse(readFileSync(file, 'utf8')) ?? {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RulesValidationError([{ file, path: '', message: 'must be a mapping of source key → source' }]);
  }
  const issues: ValidationIssue[] = [];
  const sources: Record<string, Source> = {};
  for (const [key, value] of Object.entries(raw as Record<string, object>)) {
    const result = SourceSchema.safeParse({ key, ...value });
    if (result.success) sources[key] = result.data;
    else for (const issue of result.error.issues) issues.push({ file, path: [key, ...issue.path].join('.'), message: issue.message });
  }
  if (issues.length) throw new RulesValidationError(issues);
  return sources;
}

const OPERATORS = ['eq', 'in', 'gte', 'lte', 'gt', 'lt', 'exists'] as const;

function conditionIssues(node: unknown, path: string): { path: string; message: string }[] {
  if (typeof node !== 'object' || node === null) return [];
  const record = node as Record<string, unknown>;
  for (const group of ['all', 'any']) {
    if (Array.isArray(record[group])) {
      return (record[group] as unknown[]).flatMap((child, i) => conditionIssues(child, `${path}.${group}.${i}`));
    }
  }
  if (!('fact' in record)) return [];
  const fact = String(record.fact);
  if (!isFactName(fact)) return [{ path, message: `unknown fact "${fact}"` }];
  const ops = OPERATORS.filter((op) => op in record);
  if (ops.length !== 1) return [{ path, message: `condition on "${fact}" must have exactly one operator, found ${ops.length}` }];
  const op = ops[0];
  const value = record[op];
  const type = FACTS[fact].type;
  if (op === 'exists') return typeof value === 'boolean' ? [] : [{ path, message: 'exists takes true or false' }];
  if (op === 'eq' || op === 'in') {
    const values = op === 'in' && Array.isArray(value) ? value : [value];
    const bad = values.filter((v) => !factValueFits(fact, v));
    return bad.length ? [{ path, message: `"${fact}" expects ${describeFact(fact)}, got ${JSON.stringify(bad[0])}` }] : [];
  }
  return type === 'number' ? [] : [{ path, message: `${op} only works on number facts; "${fact}" is ${describeFact(fact)}` }];
}

/** Internal: rules with the file each came from. */
export function loadRuleFiles(
  opts: { dataDir?: string; sources?: Record<string, Source> } = {},
): { rule: Rule; file: string }[] {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR;
  if (!existsSync(dataDir)) return [];
  const sources = opts.sources ?? loadSources();
  const files = readdirSync(dataDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join(dataDir, f))
    .sort();

  const issues: ValidationIssue[] = [];
  const loaded: { rule: Rule; file: string }[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const shown = relative(dataDir, file);
    const add = (path: string, message: string) => issues.push({ file: shown, path, message });
    let raw: Record<string, unknown>;
    try {
      raw = parse(readFileSync(file, 'utf8')) ?? {};
    } catch (error) {
      add('', `invalid YAML: ${(error as Error).message}`);
      continue;
    }

    for (const issue of conditionIssues(raw.applies_when, 'applies_when')) add(issue.path, issue.message);
    const result = RuleSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) add(issue.path.join('.'), issue.message);
      continue;
    }
    const rule = result.data;

    if (basename(file, '.yaml') !== rule.id) add('id', `file name must be ${rule.id}.yaml`);
    const folder = basename(dirname(file));
    if ((DOMAINS as readonly string[]).includes(folder) && folder !== rule.domain) {
      add('domain', `rule is in ${folder}/ but its domain is ${rule.domain}`);
    }
    const previous = seen.get(rule.id);
    if (previous) add('id', `duplicate id, also used by ${previous}`);
    seen.set(rule.id, shown);
    rule.sources.forEach((ref, i) => {
      if (!sources[ref.source]) add(`sources.${i}.source`, `unknown source "${ref.source}" (add it to sources.yaml)`);
    });
    loaded.push({ rule, file });
  }

  for (const { rule, file } of loaded) {
    if (rule.replaced_by !== undefined && !seen.has(rule.replaced_by)) {
      issues.push({ file: relative(dataDir, file), path: 'replaced_by', message: `no rule "${rule.replaced_by}"` });
    }
  }

  if (issues.length) throw new RulesValidationError(issues);
  return loaded.sort((a, b) => a.rule.id.localeCompare(b.rule.id));
}

/** Reads data/**\/*.yaml; validates schema, unique ids, filename = id, known facts,
 *  fact value types, that every sources[].source exists in `sources`, that the last
 *  history entry equals { version, status }, that history versions never decrease,
 *  and that replaced_by (if set) names an existing rule and status is retired. */
export function loadRules(opts: { dataDir?: string; sources?: Record<string, Source> } = {}): Rule[] {
  return loadRuleFiles(opts).map((entry) => entry.rule);
}
```

`conditionIssues` runs alongside the schema because zod's union errors only say "Invalid input" at the condition. This pass names the exact fact and operator that is wrong.

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 52`, `ℹ fail 0`, clean tsc.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Load rule files with precise validation messages

Every problem across the data folder is reported at once, with the file
and field path, so a drafter fixes a rule in one pass.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 5: Quote checking

**Files:**
- Create: `packages/rules/src/quotes.ts`, `packages/rules/test/quotes.test.ts`, `packages/rules/test/fixtures/sources/{fx-dot-refunds,fx-dot-reservations,fx-eu-guidance,fx-carrier-coc}.md`

**Interfaces:**
- Consumes: `loadRules`, `loadSources` (load); `Rule`, `Source` (schema).
- Produces (public): `normalizeText(text)`, `sourceTextPath(source, versionsDir)`, `QuoteIssue`, `checkQuotes(rules, sourceTexts)`, `checkSupports(rule)`.

- [ ] **Step 1: Write the fixture source texts**

`packages/rules/test/fixtures/sources/fx-dot-refunds.md`. The line wrap inside the first sentence is deliberate, so the test proves that whitespace is folded:

```markdown
# Example Part 260 (amended 2024-08-12)

## § 1 Refunds for cancelled flights.

A carrier must provide a prompt refund to a passenger whose flight is cancelled when the
passenger does not accept an alternative flight or a voucher.

Refunds go back to the original form of payment within 7 business days for credit card purchases.
```

`packages/rules/test/fixtures/sources/fx-dot-reservations.md`:

```markdown
# Example Part 259 (amended 2024-08-12)

A carrier must allow reservations made 7 days or more before departure to be cancelled within 24 hours without penalty.
```

`packages/rules/test/fixtures/sources/fx-carrier-coc.md`:

```markdown
Example Air will rebook a passenger who misses a connection on the same ticket on the next available flight at no extra charge.

Passengers holding separate tickets are not covered by this protection.
```

`fx-eu-guidance.md` needs a non-breaking space and curly quotes, which are invisible or mangled in a code block. Write it with escapes:

```bash
node -e "require('fs').writeFileSync('packages/rules/test/fixtures/sources/fx-eu-guidance.md', 'If you arrived at your final destination with a delay of 3 hours or more, you are entitled to compensation, unless the delay was due to “extraordinary circumstances”.\n\nCompensation is 250 euro for flights of 1 500 km or less.\n')"
```

- [ ] **Step 2: Write the failing test**

`packages/rules/test/quotes.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRules, loadSources } from '../src/load';
import { checkQuotes, checkSupports, normalizeText, sourceTextPath } from '../src/quotes';
import type { Rule } from '../src/schema';
import { FIXTURES } from './helpers';

const sources = loadSources(join(FIXTURES, 'sources.yaml'));
const rules = loadRules({ dataDir: join(FIXTURES, 'rules'), sources });
const texts = Object.fromEntries(
  Object.keys(sources).map((key) => [key, readFileSync(join(FIXTURES, 'sources', `${key}.md`), 'utf8')]),
);
const rule = (id: string): Rule => structuredClone(rules.find((r) => r.id === id)!);

test('normalizeText folds quotes, NBSP and whitespace but keeps case', () => {
  assert.equal(normalizeText('  “Hi” there\n\tit’s  '), '"Hi" there it\'s');
  assert.notEqual(normalizeText('Refund'), normalizeText('refund'));
});

test('sourceTextPath follows each detector layout', () => {
  assert.equal(sourceTextPath(sources['fx-eu-guidance']!, '/v'), '/v/Example EU Guidance/Official Guidance.md');
  assert.equal(sourceTextPath(sources['fx-dot-refunds']!, '/v'), '/v/eCFR/title-14-part-260.md');
  assert.equal(
    sourceTextPath({ key: 'k', url: 'https://x.gov', kind: 'government_page', detector: { changedetection: { watch_uuid: 'u' } } }, '/v'),
    '/v/changedetection/k.md',
  );
});

test('every fixture quote is found, across line wraps, NBSP and curly quotes', () => {
  assert.deepEqual(checkQuotes(rules, texts), []);
});

test('a changed sentence is reported as not_found', () => {
  const changed = { ...texts, 'fx-carrier-coc': texts['fx-carrier-coc']!.replace('no extra charge', 'a $75 fee') };
  assert.deepEqual(checkQuotes([rule('fx-missed-connection-single-ticket')], changed), [
    {
      rule_id: 'fx-missed-connection-single-ticket',
      source_key: 'fx-carrier-coc',
      quote: 'Example Air will rebook a passenger who misses a connection on the same ticket on the next available flight at no extra charge.',
      reason: 'not_found',
    },
  ]);
});

test('a source with no tracked text reports every quote as source_missing', () => {
  const issues = checkQuotes([rule('fx-us-refund-cancelled-flight')], {});
  assert.equal(issues.length, 2);
  assert.ok(issues.every((i) => i.reason === 'source_missing'));
});

test('checkSupports passes on fixtures and catches gaps', () => {
  for (const r of rules) assert.deepEqual(checkSupports(r), [], r.id);
  const broken = rule('fx-us-refund-cancelled-flight');
  broken.sources[0]!.quotes = [{ text: 'x', supports: ['summary', 'entitlement.nope'] }];
  assert.deepEqual(checkSupports(broken), [
    'fx-us-refund-cancelled-flight: supports path "entitlement.nope" does not exist on the rule',
    'fx-us-refund-cancelled-flight: no quote supports "entitlement"',
  ]);
});

test('array indexes work in supports paths', () => {
  const r = rule('fx-us-refund-cancelled-flight');
  r.sources[0]!.quotes[0]!.supports.push('how_to_claim.steps.1');
  assert.deepEqual(checkSupports(r), []);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/quotes.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/quotes`.

- [ ] **Step 4: Implement quote checking**

`packages/rules/src/quotes.ts`:

```ts
import { join } from 'node:path';
import type { Rule, Source } from './schema';

/** NFKC, curly quotes → straight, all whitespace runs → one space, trimmed. Case-sensitive. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Where a source's current text lives inside a checkout of elsewhere-sources-versions. */
export function sourceTextPath(source: Source, versionsDir: string): string {
  const { detector } = source;
  if ('ota' in detector) return join(versionsDir, detector.ota.service, `${detector.ota.terms_type}.md`);
  if ('ecfr' in detector) return join(versionsDir, 'eCFR', `title-${detector.ecfr.title}-part-${detector.ecfr.part}.md`);
  return join(versionsDir, 'changedetection', `${source.key}.md`);
}

export interface QuoteIssue {
  rule_id: string;
  source_key: string;
  quote: string;
  reason: 'not_found' | 'source_missing';
}

export function checkQuotes(rules: Rule[], sourceTexts: Record<string, string>): QuoteIssue[] {
  const normalized = new Map<string, string>();
  const textOf = (key: string): string | undefined => {
    if (!(key in sourceTexts)) return undefined;
    if (!normalized.has(key)) normalized.set(key, normalizeText(sourceTexts[key] ?? ''));
    return normalized.get(key);
  };

  const issues: QuoteIssue[] = [];
  for (const rule of rules) {
    for (const ref of rule.sources) {
      const text = textOf(ref.source);
      for (const quote of ref.quotes) {
        if (text === undefined) {
          issues.push({ rule_id: rule.id, source_key: ref.source, quote: quote.text, reason: 'source_missing' });
        } else if (!text.includes(normalizeText(quote.text))) {
          issues.push({ rule_id: rule.id, source_key: ref.source, quote: quote.text, reason: 'not_found' });
        }
      }
    }
  }
  return issues;
}

function pathExists(target: unknown, path: string): boolean {
  let current: unknown = target;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return false;
    current = (current as Record<string, unknown>)[segment];
    if (current === undefined) return false;
  }
  return true;
}

/** Every path in any quote's `supports` must exist on the rule; `summary` and
 *  `entitlement` must each be supported at least once. Returns messages. */
export function checkSupports(rule: Rule): string[] {
  const messages: string[] = [];
  const paths = [...new Set(rule.sources.flatMap((ref) => ref.quotes.flatMap((quote) => quote.supports)))];
  const existing = paths.filter((path) => pathExists(rule, path));
  for (const path of paths) {
    if (!existing.includes(path)) messages.push(`${rule.id}: supports path "${path}" does not exist on the rule`);
  }
  for (const required of ['summary', 'entitlement']) {
    if (!existing.some((p) => p === required || p.startsWith(`${required}.`))) {
      messages.push(`${rule.id}: no quote supports "${required}"`);
    }
  }
  return messages;
}
```

A `supports` path that doesn't exist on the rule never counts toward the required `summary` or `entitlement` coverage.

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 59`, `ℹ fail 0`, clean tsc.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Check every quote against its source's tracked text

Normalization folds whitespace, NBSP and curly quotes but stays
case-sensitive, so a quote matches the source or it does not.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 6: Library build and the history-derived changes feed

**Files:**
- Create: `packages/rules/src/library.ts`, `packages/rules/test/library.test.ts`

**Interfaces:**
- Consumes: `Rule`, `RuleStatus`, `Source` (schema); `loadRules`, `loadSources` (load, tests only).
- Produces (public):
  - `RuleChange`
  - `RulesLibrary { schema_version: 1, library_version, generated_at, rules, sources, changes }`
  - `buildLibrary({ rules, sources, now? })`. `sources` is only the cited ones, and they are excluded from the hash.
  - `changesFromHistory(rules)`. It returns changes newest first: by date, then rule id, then later entries before earlier ones.
- `library_version` = `<UTC date of now>.<first 7 hex of sha256(canonical JSON of the id-sorted rules)>`.

- [ ] **Step 1: Write the failing test**

`packages/rules/test/library.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { buildLibrary, changesFromHistory } from '../src/library';
import { loadRules, loadSources } from '../src/load';
import type { Rule } from '../src/schema';
import { FIXTURES } from './helpers';

const sources = loadSources(join(FIXTURES, 'sources.yaml'));
const rules = loadRules({ dataDir: join(FIXTURES, 'rules'), sources });
const now = new Date('2026-10-06T12:00:00Z');

test('buildLibrary stamps schema and library versions', () => {
  const library = buildLibrary({ rules, sources, now });
  assert.equal(library.schema_version, 1);
  assert.match(library.library_version, /^2026-10-06\.[0-9a-f]{7}$/);
  assert.equal(library.generated_at, '2026-10-06T12:00:00.000Z');
  assert.deepEqual(library.rules.map((r) => r.id), [...rules.map((r) => r.id)].sort());
});

test('buildLibrary ships only the sources rules cite', () => {
  const cited = rules.filter((r) => r.id !== 'fx-24h-free-cancellation');
  assert.deepEqual(Object.keys(buildLibrary({ rules: cited, sources, now }).sources), ['fx-carrier-coc', 'fx-dot-refunds', 'fx-eu-guidance']);
});

test('library_version depends on rule content only', () => {
  const a = buildLibrary({ rules, sources, now });
  assert.equal(buildLibrary({ rules: [...rules].reverse(), sources, now }).library_version, a.library_version);
  assert.equal(buildLibrary({ rules, sources: {}, now }).library_version, a.library_version);
  const edited = rules.map((r, i) => (i === 0 ? { ...r, title: `${r.title}!` } : r));
  assert.notEqual(buildLibrary({ rules: edited, sources, now }).library_version, a.library_version);
});

test('changesFromHistory turns consecutive entries into changes, newest first', () => {
  const base = rules.find((r) => r.id === 'fx-us-refund-cancelled-flight')!;
  const rule: Rule = {
    ...base,
    version: 2,
    status: 'verified',
    history: [
      { version: 1, status: 'draft', date: '2026-10-01' },
      { version: 1, status: 'verified', date: '2026-10-06' },
      { version: 2, status: 'needs_review', date: '2026-11-02', note: 'source amended: § 1' },
      { version: 2, status: 'verified', date: '2026-11-02' },
    ],
  };
  assert.deepEqual(changesFromHistory([rule]), [
    { rule_id: rule.id, from_version: 2, to_version: 2, from_status: 'needs_review', to_status: 'verified', date: '2026-11-02' },
    { rule_id: rule.id, from_version: 1, to_version: 2, from_status: 'verified', to_status: 'needs_review', date: '2026-11-02' },
    { rule_id: rule.id, from_version: 1, to_version: 1, from_status: 'draft', to_status: 'verified', date: '2026-10-06' },
    { rule_id: rule.id, from_version: null, to_version: 1, from_status: null, to_status: 'draft', date: '2026-10-01' },
  ]);
});

test('changes across rules sort by date, then rule id', () => {
  const ids = changesFromHistory(rules).slice(0, 4).map((c) => `${c.date} ${c.rule_id}`);
  assert.deepEqual(ids, [
    '2026-10-06 fx-24h-free-cancellation',
    '2026-10-06 fx-eu261-delay-compensation',
    '2026-10-06 fx-missed-connection-single-ticket',
    '2026-10-06 fx-us-refund-cancelled-flight',
  ]);
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/library.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/library`.

- [ ] **Step 3: Implement the library builder**

`packages/rules/src/library.ts`:

```ts
import { createHash } from 'node:crypto';
import type { Rule, RuleStatus, Source } from './schema';

export interface RuleChange {
  rule_id: string;
  from_version: number | null;
  to_version: number;
  from_status: RuleStatus | null;
  to_status: RuleStatus;
  date: string;
}

export interface RulesLibrary {
  schema_version: 1;
  library_version: string;
  generated_at: string;
  rules: Rule[];
  sources: Record<string, Source>;
  changes: RuleChange[];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Derives the changes feed from each rule's `history` (no git needed, so it is
 *  identical in CI, on Vercel's shallow clones, and locally). Consecutive entries
 *  become one RuleChange; the first entry has from_version/from_status = null.
 *  Newest first: by date, then rule id, then later entries before earlier ones. */
export function changesFromHistory(rules: Rule[]): RuleChange[] {
  const ordered: { change: RuleChange; index: number }[] = [];
  for (const rule of rules) {
    rule.history.forEach((entry, index) => {
      const previous = rule.history[index - 1];
      ordered.push({
        index,
        change: {
          rule_id: rule.id,
          from_version: previous?.version ?? null,
          to_version: entry.version,
          from_status: previous?.status ?? null,
          to_status: entry.status,
          date: entry.date,
        },
      });
    });
  }
  return ordered
    .sort(
      (a, b) =>
        b.change.date.localeCompare(a.change.date) ||
        a.change.rule_id.localeCompare(b.change.rule_id) ||
        b.index - a.index,
    )
    .map((entry) => entry.change);
}

export function buildLibrary(opts: { rules: Rule[]; sources: Record<string, Source>; now?: Date }): RulesLibrary {
  const now = opts.now ?? new Date();
  const rules = [...opts.rules].sort((a, b) => a.id.localeCompare(b.id));
  const cited = [...new Set(rules.flatMap((rule) => rule.sources.map((ref) => ref.source)))].sort();
  const sources = Object.fromEntries(
    cited.filter((key) => opts.sources[key]).map((key) => [key, opts.sources[key] as Source]),
  );
  const hash = createHash('sha256').update(canonicalJson(rules)).digest('hex').slice(0, 7);
  return {
    schema_version: 1,
    library_version: `${now.toISOString().slice(0, 10)}.${hash}`,
    generated_at: now.toISOString(),
    rules,
    sources,
    changes: changesFromHistory(rules),
  };
}
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 64`, `ℹ fail 0`, clean tsc.

- [ ] **Step 5: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Build the rules library with a history-derived changes feed

The feed comes from each rule's own history, so it is identical in CI,
locally, and on Vercel's shallow clones.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 7: The build and quote-check CLIs, and the public index

**Files:**
- Create: `packages/rules/src/history.ts`, `packages/rules/src/cli/build.ts`, `packages/rules/src/cli/check-quotes.ts`, `packages/rules/src/index.ts`, `packages/rules/test/cli.test.ts`
- Modify: `packages/rules/package.json` (`scripts`)

**Interfaces:**
- Consumes: everything from Tasks 1–6.
- Produces:
  - `npm run rules:build -- [--data-dir D] [--sources F] [--out O]` writes `dist/rules.json` (default `packages/rules/dist/rules.json`, which is gitignored by the root `dist/` rule).
  - `npm run rules:check-quotes -- --versions <dir> [--data-dir D] [--sources F] [--write-needs-review]` returns:
    - exit 0 when clean
    - exit 1 on any quote or supports issue
    - exit 2 on usage errors
  - With `--write-needs-review`, each failing `verified` rule becomes `needs_review` and gets a history entry: `{ version, status: needs_review, date: today, note: "quote not found in <keys>" }`.
  - Internal: `appendHistory(doc, entry)`, which writes the entry as a one-line flow map.
  - `src/index.ts` is the whole public surface. It uses explicit named re-exports, so internal helpers stay private.

- [ ] **Step 1: Add the scripts**

In `packages/rules/package.json`, replace the `scripts` block with:

```json
  "scripts": {
    "test": "node --import tsx --test \"test/**/*.test.ts\"",
    "typecheck": "tsc --noEmit",
    "rules:build": "tsx src/cli/build.ts",
    "rules:check-quotes": "tsx src/cli/check-quotes.ts"
  },
```

- [ ] **Step 2: Write the failing CLI test**

`packages/rules/test/cli.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './helpers';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'src/cli', script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

/** A versions checkout laid out the way sourceTextPath expects, from the fixture texts. */
function fixtureVersions(): string {
  const dir = mkdtempSync(join(tmpdir(), 'versions-'));
  const put = (path: string, key: string) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), readFileSync(join(FIXTURES, 'sources', `${key}.md`), 'utf8'));
  };
  put('eCFR/title-14-part-260.md', 'fx-dot-refunds');
  put('eCFR/title-14-part-259.md', 'fx-dot-reservations');
  put('Example EU Guidance/Official Guidance.md', 'fx-eu-guidance');
  put('Example Air/Conditions of Carriage.md', 'fx-carrier-coc');
  return dir;
}

function fixtureData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'data-'));
  cpSync(join(FIXTURES, 'rules'), join(dir, 'flights'), { recursive: true });
  return dir;
}

const fixtureArgs = (dataDir: string) => ['--data-dir', dataDir, '--sources', join(FIXTURES, 'sources.yaml')];

test('rules:build writes the library JSON', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'out-')), 'rules.json');
  const result = run('build.ts', [...fixtureArgs(fixtureData()), '--out', out]);
  assert.equal(result.status, 0, result.stderr);
  const library = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(library.schema_version, 1);
  assert.equal(library.rules.length, 5);
  assert.deepEqual(Object.keys(library.sources).sort(), ['fx-carrier-coc', 'fx-dot-refunds', 'fx-dot-reservations', 'fx-eu-guidance']);
  assert.equal(library.changes[0].date, '2026-10-06');
  assert.match(result.stdout, /Built 5 rules/);
});

test('rules:build exits 1 with the issue list on invalid rules', () => {
  const dataDir = fixtureData();
  writeFileSync(join(dataDir, 'flights/broken.yaml'), 'id: broken\n');
  const result = run('build.ts', [...fixtureArgs(dataDir), '--out', join(dataDir, 'out.json')]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /broken\.yaml/);
});

test('rules:check-quotes passes when every quote is present', () => {
  const result = run('check-quotes.ts', [...fixtureArgs(fixtureData()), '--versions', fixtureVersions()]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /All quotes found in 5 rule\(s\)/);
});

test('rules:check-quotes --write-needs-review flips only failing verified rules', () => {
  const dataDir = fixtureData();
  const versions = fixtureVersions();
  const coc = join(versions, 'Example Air/Conditions of Carriage.md');
  writeFileSync(coc, readFileSync(coc, 'utf8').replace('no extra charge', 'a $75 fee'));

  const result = run('check-quotes.ts', [...fixtureArgs(dataDir), '--versions', versions, '--write-needs-review']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /fx-missed-connection-single-ticket: not_found in fx-carrier-coc/);
  const flipped = readFileSync(join(dataDir, 'flights/fx-missed-connection-single-ticket.yaml'), 'utf8');
  assert.match(flipped, /^status: needs_review$/m);
  assert.match(flipped, /status: needs_review[\s\S]*note: quote not found in fx-carrier-coc/);
  assert.match(readFileSync(join(dataDir, 'flights/fx-us-refund-cancelled-flight.yaml'), 'utf8'), /^status: verified$/m);
});

test('rules:check-quotes reports sources with no tracked text', () => {
  const result = run('check-quotes.ts', [...fixtureArgs(fixtureData()), '--versions', mkdtempSync(join(tmpdir(), 'empty-'))]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /source_missing/);
});

test('rules:check-quotes requires --versions', () => {
  assert.equal(run('check-quotes.ts', []).status, 2);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/cli.test.ts`
Expected: FAIL. The first test's `assert.equal(result.status, 0, …)` reports exit 1, because `src/cli/build.ts` is missing.

- [ ] **Step 4: Implement the history helper, the CLIs, and the index**

`packages/rules/src/history.ts`:

```ts
import { isMap, type Document } from 'yaml';
import type { RuleHistoryEntry } from './schema';

/** Appends one history entry to a rule file's YAML document, written as a one-line flow map. */
export function appendHistory(doc: Document, entry: RuleHistoryEntry): void {
  const node = doc.createNode(entry);
  if (isMap(node)) node.flow = true;
  doc.addIn(['history'], node);
}
```

`packages/rules/src/cli/build.ts`:

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildLibrary } from '../library';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, PACKAGE_ROOT, loadRules, loadSources, RulesValidationError } from '../load';

const { values } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
    out: { type: 'string', default: join(PACKAGE_ROOT, 'dist', 'rules.json') },
  },
});

try {
  const sources = loadSources(values.sources);
  const rules = loadRules({ dataDir: values['data-dir'], sources });
  const library = buildLibrary({ rules, sources });
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(library, null, 2)}\n`);
  console.log(`Built ${library.rules.length} rules (library ${library.library_version}) → ${values.out}`);
} catch (error) {
  if (error instanceof RulesValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
```

`packages/rules/src/cli/check-quotes.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { parseDocument } from 'yaml';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, loadRuleFiles, loadSources, RulesValidationError } from '../load';
import { appendHistory } from '../history';
import { checkQuotes, checkSupports, sourceTextPath } from '../quotes';

const { values } = parseArgs({
  options: {
    versions: { type: 'string' },
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
    'write-needs-review': { type: 'boolean', default: false },
  },
});

if (!values.versions) {
  console.error('Usage: rules:check-quotes --versions <checkout of elsewhere-sources-versions> [--write-needs-review]');
  process.exit(2);
}

let entries;
let sources;
try {
  sources = loadSources(values.sources);
  entries = loadRuleFiles({ dataDir: values['data-dir'], sources }).filter((e) => e.rule.status !== 'retired');
} catch (error) {
  if (error instanceof RulesValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const texts: Record<string, string> = {};
for (const key of new Set(entries.flatMap((e) => e.rule.sources.map((ref) => ref.source)))) {
  const path = sourceTextPath(sources[key]!, values.versions);
  if (existsSync(path)) texts[key] = readFileSync(path, 'utf8');
}

const quoteIssues = checkQuotes(entries.map((e) => e.rule), texts);
const supportIssues = entries.flatMap((e) => checkSupports(e.rule));

for (const issue of quoteIssues) {
  console.log(`${issue.rule_id}: ${issue.reason} in ${issue.source_key}: "${issue.quote.slice(0, 120)}"`);
}
for (const message of supportIssues) console.log(message);

if (values['write-needs-review']) {
  const today = new Date().toISOString().slice(0, 10);
  for (const { rule, file } of entries) {
    const failingSources = [...new Set(quoteIssues.filter((i) => i.rule_id === rule.id).map((i) => i.source_key))];
    if (rule.status !== 'verified' || failingSources.length === 0) continue;
    const doc = parseDocument(readFileSync(file, 'utf8'));
    doc.set('status', 'needs_review');
    appendHistory(doc, {
      version: rule.version,
      status: 'needs_review',
      date: today,
      note: `quote not found in ${failingSources.join(', ')}`,
    });
    writeFileSync(file, String(doc));
    console.log(`${rule.id}: status set to needs_review`);
  }
}

const total = quoteIssues.length + supportIssues.length;
console.log(total ? `${total} issue(s) in ${entries.length} rule(s)` : `All quotes found in ${entries.length} rule(s)`);
process.exit(total ? 1 : 0);
```

`packages/rules/src/index.ts`:

```ts
export {
  RULE_STATUSES,
  DOMAINS,
  CHARACTERS,
  ENTITLEMENT_KINDS,
  SOURCE_KINDS,
  JURISDICTION_PATTERN,
  RuleSchema,
  SourceSchema,
  type RuleStatus,
  type Domain,
  type Character,
  type SourceKind,
  type Primitive,
  type Condition,
  type ConditionGroup,
  type ConditionNode,
  type Quote,
  type RuleSourceRef,
  type Rule,
  type RuleHistoryEntry,
  type Detector,
  type Source,
} from './schema';
export { FACTS, FactValueError, validateSituation, type FactDef, type FactName, type Situation } from './facts';
export { matchRule, matchRules, type MatchOutcome, type MatchResult } from './match';
export { loadRules, loadSources, RulesValidationError } from './load';
export { buildLibrary, changesFromHistory, type RuleChange, type RulesLibrary } from './library';
export { normalizeText, sourceTextPath, checkQuotes, checkSupports, type QuoteIssue } from './quotes';
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 70`, `ℹ fail 0`, clean tsc.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Add rules:build, rules:check-quotes and the public index

check-quotes --write-needs-review is the deterministic backstop: any
verified rule whose quote vanished from its source flips to needs_review
with a history entry naming the source.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

---

## Part 2 — Sources and detection

### Task 8: The tracked source list

**Files:**
- Create: `packages/rules/sources.yaml`, `packages/rules/ota-overrides.yaml`, `packages/rules/test/sources-file.test.ts`
- Modify: `packages/rules/package.json` (add `build`)

**Interfaces:**
- Produces: the source keys that rules cite. Rules 1–10 (Tasks 19–21) need:
  - `ecfr-14-cfr-250`
  - `ecfr-14-cfr-259`
  - `ecfr-14-cfr-260`
  - `youreurope-air-passenger-rights`
  - `eurlex-261-2004`
- Produces: `npm run build -w @elsewhere/rules`, so turbo's `build` builds the library before any app that depends on it.

Reachability on 2026-10-01, from this machine (Task 10 re-checks everything through the real tracker):

| Sources | Status |
|---|---|
| All `ecfr-*` | 200 via the API |
| `youreurope-air-passenger-rights` | 200, recorded by OTA |
| `dot-refunds` | 403 to curl, but recorded by OTA |
| Other `dot-*` | 403 to curl, same site template |
| `eurlex-261-2004` | Recorded by OTA with client scripts |
| `uk-caa-delays-cancellations` | 200 |
| `tsa-real-id` | 200 |
| `eu-ees` | 200 |
| `uk-eta` | 200 |
| `eu-etias` | 200, but a 1.5 KB JS shell |
| `state-passports` | 403 to curl |
| `dl-*` | Recorded by OTA |
| `wn-*` (PDFs), `as-*`, `f9-*` | 200 |
| `aa-*`, `g4-*`, `ha-*` | 403 to curl |
| `b6-*` | 406 to curl |
| `ua-*`, `nk-*` | Timed out to curl |

The card-issuer benefit guides and the remaining airlines' customer service plans aren't in this first list. Each is added in the PR of the first rule that cites it (RESEARCH.md step 1).

- [ ] **Step 1: Write the failing test**

`packages/rules/test/sources-file.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadSources } from '../src/load';

const sources = loadSources();

test('sources.yaml loads and every source is https', () => {
  for (const source of Object.values(sources)) assert.ok(source.url.startsWith('https://'), source.key);
});

test('the sources the first ten rules need are tracked', () => {
  for (const key of ['ecfr-14-cfr-250', 'ecfr-14-cfr-259', 'ecfr-14-cfr-260', 'youreurope-air-passenger-rights']) {
    assert.ok(sources[key], key);
  }
});

test('regulations are tracked through the eCFR API, not page scraping', () => {
  for (const source of Object.values(sources)) {
    if (source.url.startsWith('https://www.ecfr.gov/')) assert.ok('ecfr' in source.detector, source.key);
  }
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/sources-file.test.ts`
Expected: FAIL with `ENOENT` for `sources.yaml`.

- [ ] **Step 3: Write the source list and the overrides**

`packages/rules/sources.yaml`:

```yaml
# Every primary source the rules library may quote, and the detector that watches it.
# Keys are stable. Rules cite them in sources[].source. Adding a source is part of the
# same PR as the first rule that cites it.

# US federal regulations (eCFR versioning API)
ecfr-14-cfr-250:
  url: https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-250
  kind: regulation
  detector: { ecfr: { title: 14, part: 250 } }
ecfr-14-cfr-254:
  url: https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-254
  kind: regulation
  detector: { ecfr: { title: 14, part: 254 } }
ecfr-14-cfr-259:
  url: https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-259
  kind: regulation
  detector: { ecfr: { title: 14, part: 259 } }
ecfr-14-cfr-260:
  url: https://www.ecfr.gov/current/title-14/chapter-II/subchapter-A/part-260
  kind: regulation
  detector: { ecfr: { title: 14, part: 260 } }
ecfr-14-cfr-399:
  url: https://www.ecfr.gov/current/title-14/chapter-II/subchapter-F/part-399
  kind: regulation
  detector: { ecfr: { title: 14, part: 399 } }
ecfr-16-cfr-464:
  url: https://www.ecfr.gov/current/title-16/chapter-I/subchapter-D/part-464
  kind: regulation
  detector: { ecfr: { title: 16, part: 464 } }

# US DOT consumer guidance (Open Terms Archive)
dot-refunds:
  url: https://www.transportation.gov/individuals/aviation-consumer-protection/refunds
  kind: agency_guidance
  detector: { ota: { service: "US DOT Refunds", terms_type: "Official Guidance" } }
dot-bumping-oversales:
  url: https://www.transportation.gov/individuals/aviation-consumer-protection/bumping-oversales
  kind: agency_guidance
  detector: { ota: { service: "US DOT Bumping and Oversales", terms_type: "Official Guidance" } }
dot-delays-cancellations:
  url: https://www.transportation.gov/individuals/aviation-consumer-protection/flight-delays-cancellations
  kind: agency_guidance
  detector: { ota: { service: "US DOT Flight Delays and Cancellations", terms_type: "Official Guidance" } }
dot-tarmac-delays:
  url: https://www.transportation.gov/individuals/aviation-consumer-protection/tarmac-delays
  kind: agency_guidance
  detector: { ota: { service: "US DOT Tarmac Delays", terms_type: "Official Guidance" } }
dot-mishandled-baggage:
  url: https://www.transportation.gov/individuals/aviation-consumer-protection/mishandled-baggage
  kind: agency_guidance
  detector: { ota: { service: "US DOT Mishandled Baggage", terms_type: "Official Guidance" } }
dot-customer-service-dashboard:
  url: https://www.transportation.gov/airconsumer/airline-customer-service-dashboard
  kind: agency_guidance
  detector: { ota: { service: "US DOT Airline Customer Service Dashboard", terms_type: "Official Guidance" } }

# EU and UK
youreurope-air-passenger-rights:
  url: https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm
  kind: agency_guidance
  detector: { ota: { service: "EU Your Europe Air Passenger Rights", terms_type: "Official Guidance" } }
eurlex-261-2004:
  url: https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32004R0261
  kind: regulation
  detector: { ota: { service: "EUR-Lex Regulation 261-2004", terms_type: "Official Guidance" } }
uk-caa-delays-cancellations:
  url: https://www.caa.co.uk/passengers-and-public/resolving-travel-problems/delays-and-cancellations/
  kind: agency_guidance
  detector: { ota: { service: "UK CAA Delays and Cancellations", terms_type: "Official Guidance" } }

# Entry and documents
state-passports:
  url: https://travel.state.gov/content/travel/en/passports.html
  kind: government_page
  detector: { ota: { service: "US State Department Passports", terms_type: "Official Guidance" } }
tsa-real-id:
  url: https://www.tsa.gov/real-id
  kind: government_page
  detector: { ota: { service: "TSA REAL ID", terms_type: "Official Guidance" } }
eu-etias:
  url: https://travel-europe.europa.eu/etias_en
  kind: government_page
  detector: { ota: { service: "EU ETIAS", terms_type: "Official Guidance" } }
eu-ees:
  url: https://travel-europe.europa.eu/ees_en
  kind: government_page
  detector: { ota: { service: "EU Entry Exit System", terms_type: "Official Guidance" } }
uk-eta:
  url: https://www.gov.uk/guidance/apply-for-an-electronic-travel-authorisation-eta
  kind: government_page
  detector: { ota: { service: "UK ETA", terms_type: "Official Guidance" } }

# Airline contracts of carriage and customer service plans
aa-contract-of-carriage:
  url: https://www.aa.com/i18n/customer-service/support/conditions-of-carriage.jsp
  kind: contract_of_carriage
  detector: { ota: { service: "American Airlines", terms_type: "Conditions of Carriage" } }
aa-customer-service-plan:
  url: https://www.aa.com/i18n/customer-service/support/customer-service-plan.jsp
  kind: customer_service_plan
  detector: { ota: { service: "American Airlines", terms_type: "Customer Service Plan" } }
dl-contract-of-carriage:
  url: https://www.delta.com/us/en/legal/contract-of-carriage-dgr
  kind: contract_of_carriage
  detector: { ota: { service: "Delta Air Lines", terms_type: "Conditions of Carriage" } }
dl-customer-service-plan:
  url: https://www.delta.com/us/en/about-delta/customer-service-plan
  kind: customer_service_plan
  detector: { ota: { service: "Delta Air Lines", terms_type: "Customer Service Plan" } }
ua-contract-of-carriage:
  url: https://www.united.com/en/us/fly/contract-of-carriage.html
  kind: contract_of_carriage
  detector: { ota: { service: "United Airlines", terms_type: "Conditions of Carriage" } }
ua-customer-service-plan:
  url: https://www.united.com/en/us/fly/customer-service-plan.html
  kind: customer_service_plan
  detector: { ota: { service: "United Airlines", terms_type: "Customer Service Plan" } }
wn-contract-of-carriage:
  url: https://www.southwest.com/assets/pdfs/corporate-commitments/contract-of-carriage.pdf
  kind: contract_of_carriage
  detector: { ota: { service: "Southwest Airlines", terms_type: "Conditions of Carriage" } }
wn-customer-service-plan:
  url: https://www.southwest.com/assets/pdfs/corporate-commitments/customer-service-plan.pdf
  kind: customer_service_plan
  detector: { ota: { service: "Southwest Airlines", terms_type: "Customer Service Plan" } }
as-contract-of-carriage:
  url: https://www.alaskaair.com/content/legal/contract-of-carriage
  kind: contract_of_carriage
  detector: { ota: { service: "Alaska Airlines", terms_type: "Conditions of Carriage" } }
b6-contract-of-carriage:
  url: https://www.jetblue.com/legal/contract-of-carriage
  kind: contract_of_carriage
  detector: { ota: { service: "JetBlue", terms_type: "Conditions of Carriage" } }
nk-contract-of-carriage:
  url: https://www.spirit.com/legal/contract-of-carriage
  kind: contract_of_carriage
  detector: { ota: { service: "Spirit Airlines", terms_type: "Conditions of Carriage" } }
f9-contract-of-carriage:
  url: https://www.flyfrontier.com/legal/contract-of-carriage/
  kind: contract_of_carriage
  detector: { ota: { service: "Frontier Airlines", terms_type: "Conditions of Carriage" } }
g4-contract-of-carriage:
  url: https://www.allegiantair.com/legal/contract-of-carriage
  kind: contract_of_carriage
  detector: { ota: { service: "Allegiant Air", terms_type: "Conditions of Carriage" } }
ha-contract-of-carriage:
  url: https://www.hawaiianairlines.com/legal/list-of-all-contracts/contract-of-carriage
  kind: contract_of_carriage
  detector: { ota: { service: "Hawaiian Airlines", terms_type: "Conditions of Carriage" } }
```

`packages/rules/ota-overrides.yaml`:

```yaml
# Open Terms Archive fetch tuning per source key. Defaults: select "body", client scripts
# decided by the engine. Narrow `select` to the main content so navigation changes don't
# record as new versions. Verified in the 2026-10-01 spike unless marked otherwise.
dot-refunds: { select: main }
dot-bumping-oversales: { select: main }            # same DOT template, not yet run
dot-delays-cancellations: { select: main }         # same DOT template, not yet run
dot-tarmac-delays: { select: main }                # same DOT template, not yet run
dot-mishandled-baggage: { select: main }           # same DOT template, not yet run
dot-customer-service-dashboard: { select: main }   # same DOT template, not yet run
youreurope-air-passenger-rights: { select: main }
eurlex-261-2004: { execute_client_scripts: true }  # plain fetch returns an empty body
tsa-real-id: { select: main }
uk-eta: { select: main }
uk-caa-delays-cancellations: { select: main }
dl-contract-of-carriage: { select: main }
```

In `packages/rules/package.json`, add `"build": "npm run rules:build",` to `scripts`, directly after `"typecheck"`.

- [ ] **Step 4: Run the tests, typecheck, and a real build**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit && npm run rules:build`
Expected: `ℹ pass 73`, `ℹ fail 0`, clean tsc, and `Built 0 rules (library <today>.<hash>) → …/packages/rules/dist/rules.json`.

- [ ] **Step 5: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Track the initial primary-source set

Regulations come from the eCFR API; agency pages, EU/UK guidance,
entry rules and airline contracts go through Open Terms Archive.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 9: Open Terms Archive declarations generated from sources.yaml

**Files:**
- Create: `packages/rules/src/ota.ts`, `packages/rules/src/cli/declarations.ts`, `packages/rules/test/ota.test.ts`
- Modify: `packages/rules/package.json` (add `rules:declarations`)

**Interfaces:**
- Consumes: `loadSources`, `PACKAGE_ROOT`, `RulesValidationError`, `DEFAULT_SOURCES_FILE` (load); `Source` (schema).
- Produces (internal):
  - `OtaOverride`, `OtaTerms`, `OtaDeclaration`
  - `loadOtaOverrides(file)`
  - `buildDeclarations(sources, overrides): Record<service, OtaDeclaration>`
  - `npm run rules:declarations -- --out <dir> [--sources F] [--overrides F]`. It writes `<service>.json`, deletes stale `*.json` (keeping `*.history.json`), and exits 1 on clashes.

- [ ] **Step 1: Add the script**

In `packages/rules/package.json`, add `"rules:declarations": "tsx src/cli/declarations.ts",` after `rules:check-quotes`.

- [ ] **Step 2: Write the failing test**

`packages/rules/test/ota.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources, PACKAGE_ROOT, RulesValidationError } from '../src/load';
import { buildDeclarations, loadOtaOverrides } from '../src/ota';
import type { Source } from '../src/schema';

const src = (key: string, url: string, service: string, terms_type: string): Source => ({
  key, url, kind: 'government_page', detector: { ota: { service, terms_type } },
});

const sources: Record<string, Source> = {
  'a-guidance': src('a-guidance', 'https://a.gov/refunds', 'A Agency', 'Official Guidance'),
  'b-coc': src('b-coc', 'https://b.com/coc.pdf', 'B Air', 'Conditions of Carriage'),
  'b-plan': src('b-plan', 'https://b.com/plan', 'B Air', 'Customer Service Plan'),
  'ecfr-x': { key: 'ecfr-x', url: 'https://www.ecfr.gov/x', kind: 'regulation', detector: { ecfr: { title: 14, part: 260 } } },
};

test('groups ota sources by service and skips other detectors', () => {
  const declarations = buildDeclarations(sources, { 'a-guidance': { select: 'main', remove: ['.feedback'], execute_client_scripts: true } });
  assert.deepEqual(Object.keys(declarations).sort(), ['A Agency', 'B Air']);
  assert.deepEqual(declarations['A Agency'], {
    name: 'A Agency',
    terms: { 'Official Guidance': { fetch: 'https://a.gov/refunds', select: 'main', remove: ['.feedback'], executeClientScripts: true } },
  });
  assert.deepEqual(declarations['B Air']!.terms, {
    'Conditions of Carriage': { fetch: 'https://b.com/coc.pdf' },
    'Customer Service Plan': { fetch: 'https://b.com/plan', select: 'body' },
  });
});

test('two sources cannot share a service and terms type', () => {
  const clash = { ...sources, 'b-dup': src('b-dup', 'https://b.com/other', 'B Air', 'Customer Service Plan') };
  assert.throws(() => buildDeclarations(clash, {}), RulesValidationError);
});

test('overrides must point at ota sources and PDFs take no selectors', () => {
  assert.throws(() => buildDeclarations(sources, { 'ecfr-x': { select: 'main' } }), RulesValidationError);
  assert.throws(() => buildDeclarations(sources, { 'b-coc': { select: 'main' } }), RulesValidationError);
});

test('rules:declarations writes one file per service and prunes stale ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decl-'));
  const sourcesFile = join(dir, 'sources.yaml');
  writeFileSync(sourcesFile, 'a-guidance:\n  url: https://a.gov/refunds\n  kind: government_page\n  detector: { ota: { service: "A Agency", terms_type: "Official Guidance" } }\n');
  const out = join(dir, 'declarations');
  const run = () =>
    spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/cli/declarations.ts', import.meta.url)),
      '--sources', sourcesFile, '--overrides', join(dir, 'none.yaml'), '--out', out], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  writeFileSync(join(out, 'Old Service.json'), '{}');
  writeFileSync(join(out, 'A Agency.history.json'), '{}');
  assert.equal(run().status, 0);
  assert.deepEqual(readdirSync(out).sort(), ['A Agency.history.json', 'A Agency.json']);
  assert.equal(JSON.parse(readFileSync(join(out, 'A Agency.json'), 'utf8')).terms['Official Guidance'].select, 'body');
});

test('the real sources.yaml and ota-overrides.yaml build without clashes', () => {
  const declarations = buildDeclarations(loadSources(), loadOtaOverrides(join(PACKAGE_ROOT, 'ota-overrides.yaml')));
  assert.equal(declarations['EUR-Lex Regulation 261-2004']?.terms['Official Guidance']?.executeClientScripts, true);
  assert.deepEqual(Object.keys(declarations['Delta Air Lines']!.terms).sort(), ['Conditions of Carriage', 'Customer Service Plan']);
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/ota.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/ota`.

- [ ] **Step 4: Implement the generator**

`packages/rules/src/ota.ts`:

```ts
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';
import { RulesValidationError } from './load';
import type { Source } from './schema';

const Selectors = z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]);

const OtaOverrideSchema = z.strictObject({
  select: Selectors.optional(),
  remove: Selectors.optional(),
  execute_client_scripts: z.boolean().optional(),
});
export type OtaOverride = z.infer<typeof OtaOverrideSchema>;

export interface OtaTerms {
  fetch: string;
  select?: string | string[];
  remove?: string | string[];
  executeClientScripts?: boolean;
}

export interface OtaDeclaration {
  name: string;
  terms: Record<string, OtaTerms>;
}

export function loadOtaOverrides(file: string): Record<string, OtaOverride> {
  const raw: unknown = parse(readFileSync(file, 'utf8')) ?? {};
  const result = z.record(z.string(), OtaOverrideSchema).safeParse(raw);
  if (!result.success) {
    throw new RulesValidationError(result.error.issues.map((i) => ({ file, path: i.path.join('.'), message: i.message })));
  }
  return result.data;
}

const isPdf = (url: string) => new URL(url).pathname.toLowerCase().endsWith('.pdf');

/** One Open Terms Archive declaration per service, from the `ota` sources. */
export function buildDeclarations(
  sources: Record<string, Source>,
  overrides: Record<string, OtaOverride>,
): Record<string, OtaDeclaration> {
  const issues: { file: string; path: string; message: string }[] = [];
  const declarations: Record<string, OtaDeclaration> = {};

  for (const key of Object.keys(overrides)) {
    const source = sources[key];
    if (!source || !('ota' in source.detector)) {
      issues.push({ file: 'ota-overrides.yaml', path: key, message: 'override for a source that is not an ota source' });
    }
  }

  for (const source of Object.values(sources).sort((a, b) => a.key.localeCompare(b.key))) {
    if (!('ota' in source.detector)) continue;
    const { service, terms_type } = source.detector.ota;
    const override = overrides[source.key] ?? {};
    const declaration = (declarations[service] ??= { name: service, terms: {} });
    if (declaration.terms[terms_type]) {
      issues.push({ file: 'sources.yaml', path: source.key, message: `"${service}" already has a "${terms_type}" document` });
      continue;
    }
    if (isPdf(source.url)) {
      if (override.select || override.remove) {
        issues.push({ file: 'ota-overrides.yaml', path: source.key, message: 'PDF sources take no selectors' });
      }
      declaration.terms[terms_type] = { fetch: source.url };
      continue;
    }
    declaration.terms[terms_type] = {
      fetch: source.url,
      select: override.select ?? 'body',
      ...(override.remove ? { remove: override.remove } : {}),
      ...(override.execute_client_scripts !== undefined ? { executeClientScripts: override.execute_client_scripts } : {}),
    };
  }

  if (issues.length) throw new RulesValidationError(issues);
  return declarations;
}
```

`packages/rules/src/cli/declarations.ts`:

```ts
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_SOURCES_FILE, PACKAGE_ROOT, loadSources, RulesValidationError } from '../load';
import { buildDeclarations, loadOtaOverrides } from '../ota';

const { values } = parseArgs({
  options: {
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
    overrides: { type: 'string', default: join(PACKAGE_ROOT, 'ota-overrides.yaml') },
    out: { type: 'string' },
  },
});

if (!values.out) {
  console.error('Usage: rules:declarations --out <declarations dir of elsewhere-sources-declarations>');
  process.exit(2);
}

try {
  const overrides = existsSync(values.overrides) ? loadOtaOverrides(values.overrides) : {};
  const declarations = buildDeclarations(loadSources(values.sources), overrides);
  mkdirSync(values.out, { recursive: true });
  const written = new Set<string>();
  for (const [service, declaration] of Object.entries(declarations)) {
    const file = `${service}.json`;
    writeFileSync(join(values.out, file), `${JSON.stringify(declaration, null, 2)}\n`);
    written.add(file);
  }
  for (const file of readdirSync(values.out)) {
    if (file.endsWith('.json') && !file.endsWith('.history.json') && !written.has(file)) {
      rmSync(join(values.out, file));
      console.log(`removed ${file}`);
    }
  }
  console.log(`Wrote ${written.size} declaration(s) → ${values.out}`);
} catch (error) {
  if (error instanceof RulesValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 78`, `ℹ fail 0`, clean tsc.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Generate Open Terms Archive declarations from sources.yaml

sources.yaml stays the single list of sources; per-page fetch tuning
lives in ota-overrides.yaml.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 10: Tracker spike on the real sources (the spec's first implementation step)

This answers the spec's open question: can regulations and government pages go on Open Terms Archive, or do they need changedetection.io? It also tunes every source before the tracker goes live.

**Decision recorded by this plan:**
- **OTA tracks every web source, and changedetection.io is not used.**
- **Evidence:** the engine checks terms types only in `ota validate`, never in `ota track`. The 2026-10-01 spike recorded "Official Guidance" and "Customer Service Plan" versions with engine 16.3.0.
- **Terms types:**
  - Government and agency pages use the custom type "Official Guidance", and customer service plans use "Customer Service Plan".
  - Airline contracts use the listed type "Conditions of Carriage".
  - CI never runs `ota validate`, because our generator and its tests are the declaration validator.
- **The `changedetection` detector variant stays in the contract unused.** This step confirms the decision on the full source set.
- **Fallback:** if a source can't be fetched even with client scripts, replace it with another primary source for the same rule, or drop it if no rule in Tasks 19–21 needs it.

**Files:**
- Modify: `packages/rules/sources.yaml`, `packages/rules/ota-overrides.yaml` (only as the spike dictates)
- Scratch only: `$TMPDIR/ota-spike/` (never committed)

- [ ] **Step 1: Build a throwaway collection**

```bash
REPO="$(git rev-parse --show-toplevel)"
SPIKE="${TMPDIR:-/tmp}/ota-spike" && rm -rf "$SPIKE" && mkdir -p "$SPIKE/config" && cd "$SPIKE"
cat > package.json <<'EOF'
{ "private": true, "type": "module", "dependencies": { "@opentermsarchive/engine": "16.3.0" } }
EOF
cat > config/default.json <<'EOF'
{ "@opentermsarchive/engine": { "fetcher": { "language": "en-US, en" } } }
EOF
npm install
cd "$REPO" && npm run -s rules:declarations -w @elsewhere/rules -- --out "$SPIKE/declarations"
```

Expected: `Wrote 24 declaration(s) → …/ota-spike/declarations`. This config has no `reporter`, so the spike never touches GitHub.

- [ ] **Step 2: Track everything once**

```bash
cd "${TMPDIR:-/tmp}/ota-spike" && npx ota track 2>&1 | tee track.log
find data/versions -name '*.md' | sort
```

Expected: a `Recorded first version` line per working document, plus a `cannot be accessed` warning for each failure. Version files appear under `data/versions/<service>/<terms type>.md`.

- [ ] **Step 3: Fix each failure, one service at a time**

For each service with a warning:
1. Add `execute_client_scripts: true` to its key in `ota-overrides.yaml`.
2. Regenerate the declarations: `(cd "$REPO" && npm run -s rules:declarations -w @elsewhere/rules -- --out "$SPIKE/declarations")`.
3. Re-run only that service: `npx ota track --services "<service>"`.
4. If it still fails, find the page's current URL on the same official site. Update `sources.yaml` and re-run.
5. If no URL works and no rule in Tasks 19–21 cites the source, delete it from `sources.yaml` and from `ota-overrides.yaml`.

- [ ] **Step 4: Narrow noisy selectors**

For each recorded version, check that it starts near the document's real content, not the site navigation:

```bash
for f in data/versions/*/*.md; do printf '%s\t%s\n' "$(head -c 120 "$f" | tr '\n' ' ')" "$f"; done
```

Where navigation leads, inspect `data/snapshots/<service>/<terms type>.html` for the narrowest element that holds the whole text (`main`, `article`, `#main-content`, `[role=main]`). Set it as `select` in `ota-overrides.yaml`. Regenerate and re-run the service until the version opens on the document's first heading.

- [ ] **Step 5: Confirm the rule-critical sources hold their key text**

```bash
grep -c "3 hours or more" "data/versions/EU Your Europe Air Passenger Rights/Official Guidance.md"
grep -c "Article 7" "data/versions/EUR-Lex Regulation 261-2004/Official Guidance.md"
```

Expected: both counts are 1 or more.

- [ ] **Step 6: Run the package tests and commit any source changes**

Run: `npm test -w @elsewhere/rules`
Expected: `ℹ pass 78`, `ℹ fail 0`.

```bash
git add packages/rules/sources.yaml packages/rules/ota-overrides.yaml
git commit -F - <<'EOF'
Tune tracked sources after the Open Terms Archive spike

Decision: Open Terms Archive tracks every web source; terms types are
only checked by `ota validate`, which we do not run, so government pages
use "Official Guidance". changedetection.io is not needed.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

If the spike changed nothing, skip the commit, and record the decision in Task 12's first commit message instead.

### Task 11: eCFR fetcher

**Files:**
- Create: `packages/rules/src/ecfr.ts`, `packages/rules/src/cli/fetch-ecfr.ts`, `packages/rules/test/ecfr.test.ts`, `packages/rules/test/fixtures/ecfr/title-14-part-260.xml`
- Modify: `packages/rules/package.json` (add `rules:fetch-ecfr`)

**Interfaces:**
- Consumes: `loadSources`, `DEFAULT_SOURCES_FILE` (load); `sourceTextPath` (quotes).
- Produces (internal):
  - `FetchLike`
  - `ecfrXmlToText(xml)`
  - `fetchEcfrPart({ title, part }, fetchImpl?): Promise<{ text, amendedOn, asOf }>`. The file text is `# <T> CFR Part <P> (amended <date>)` followed by the body.
  - `npm run rules:fetch-ecfr -- --versions <dir> [--sources F]`. It writes `eCFR/title-<T>-part-<P>.md` only when the text changed. It exits 1 if any part fails and 2 on usage errors.

- [ ] **Step 1: Add the script**

In `packages/rules/package.json`, add `"rules:fetch-ecfr": "tsx src/cli/fetch-ecfr.ts",` after `rules:declarations`.

- [ ] **Step 2: Write the XML fixture**

This is trimmed from the real 2026-09-29 response for Part 260, with an `&amp;` added to cover entity decoding.

`packages/rules/test/fixtures/ecfr/title-14-part-260.xml`:

```xml
<?xml version="1.0"?>
<DIV5 N="260" TYPE="PART" VOLUME="4" hierarchy_metadata="{&amp;quot;path&amp;quot;:&amp;quot;/on/_SUBSTITUTE_DATE_/title-14/part-260&amp;quot;}">
<HEAD>PART 260&#x2014;REFUNDS FOR AIRLINE FARE AND ANCILLARY SERVICE FEES
</HEAD>
<AUTH>
<HED>Authority:</HED><PSPACE>49 U.S.C. 40101(a), 41702, 41712, and 42305.
</PSPACE></AUTH>
<SOURCE>
<HED>Source:</HED><PSPACE>DOT-OST-2022-0089 and DOT-OST-2016-0208, 89 FR 32832, Apr. 26, 2024, unless otherwise noted.
</PSPACE></SOURCE>
<DIV8 N="260.1" TYPE="SECTION" hierarchy_metadata="{&quot;citation&quot;:&quot;14 CFR 260.1&quot;}">
<HEAD>&#xA7; 260.1 Purpose.</HEAD>
<P>The purpose of this part is to ensure that carriers promptly refund consumers for:</P>
<P>(a) Fees for ancillary services related to air travel that consumers paid for but were not provided;</P>
<P>(c) Airfare including nonrefundable airfare for a flight that is cancelled or significantly changed where the consumer does not accept the significantly changed flight &amp; rebooking.</P>
<CITA TYPE="N">[DOT-OST-2022-0089, 89 FR 32832, Apr. 26, 2024]
</CITA>
</DIV8>
<DIV8 N="260.2" TYPE="SECTION">
<HEAD>&#xA7; 260.2 Definitions.</HEAD>
<P><I>Air carrier</I> means a citizen of the United States undertaking by any means to provide air transportation.</P>
</DIV8>
</DIV5>
```

- [ ] **Step 3: Write the failing test**

`packages/rules/test/ecfr.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ecfrXmlToText, fetchEcfrPart, type FetchLike } from '../src/ecfr';
import { FIXTURES } from './helpers';

const xml = readFileSync(join(FIXTURES, 'ecfr/title-14-part-260.xml'), 'utf8');

test('ecfrXmlToText keeps headings and paragraphs, drops notes and markup', () => {
  assert.equal(
    ecfrXmlToText(xml),
    [
      '## PART 260—REFUNDS FOR AIRLINE FARE AND ANCILLARY SERVICE FEES',
      '## § 260.1 Purpose.',
      'The purpose of this part is to ensure that carriers promptly refund consumers for:',
      '(a) Fees for ancillary services related to air travel that consumers paid for but were not provided;',
      '(c) Airfare including nonrefundable airfare for a flight that is cancelled or significantly changed where the consumer does not accept the significantly changed flight & rebooking.',
      '## § 260.2 Definitions.',
      'Air carrier means a citizen of the United States undertaking by any means to provide air transportation.',
    ].join('\n\n'),
  );
});

test('fetchEcfrPart asks for the title date, the part meta, then the compressed XML', async () => {
  const calls: { url: string; headers?: Record<string, string> }[] = [];
  const fake: FetchLike = async (url, init) => {
    calls.push({ url, headers: init?.headers });
    const body: unknown = url.endsWith('/titles.json')
      ? { titles: [{ number: 14, up_to_date_as_of: '2026-09-30' }] }
      : url.includes('/versions/')
        ? { meta: { latest_amendment_date: '2024-08-12' } }
        : xml;
    return { ok: true, status: 200, text: async () => body as string, json: async () => body };
  };
  const part = await fetchEcfrPart({ title: 14, part: 260 }, fake);
  assert.deepEqual(calls.map((c) => c.url), [
    'https://www.ecfr.gov/api/versioner/v1/titles.json',
    'https://www.ecfr.gov/api/versioner/v1/versions/title-14.json?part=260',
    'https://www.ecfr.gov/api/versioner/v1/full/2026-09-30/title-14.xml?part=260',
  ]);
  assert.equal(calls[2]?.headers?.['Accept-Encoding'], 'gzip');
  assert.equal(part.amendedOn, '2024-08-12');
  assert.ok(part.text.startsWith('# 14 CFR Part 260 (amended 2024-08-12)\n\n## PART 260'));
});

test('fetchEcfrPart surfaces HTTP errors', async () => {
  const fake: FetchLike = async () => ({ ok: false, status: 503, text: async () => '', json: async () => ({}) });
  await assert.rejects(fetchEcfrPart({ title: 14, part: 260 }, fake), /eCFR 503/);
});
```

- [ ] **Step 4: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/ecfr.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/ecfr`.

- [ ] **Step 5: Implement the fetcher**

`packages/rules/src/ecfr.ts`:

```ts
export type FetchLike = (
  url: string,
  init?: { headers?: Record<string, string> },
) => Promise<{ ok: boolean; status: number; text(): Promise<string>; json(): Promise<unknown> }>;

const API = 'https://www.ecfr.gov/api/versioner/v1';
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity[0] === '#') {
      const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return String.fromCodePoint(code);
    }
    return NAMED[entity.toLowerCase()] ?? `&${entity};`;
  });
}

/** eCFR XML → plain text: headings as `## `, one paragraph per <P>, citations and authority notes dropped. */
export function ecfrXmlToText(xml: string): string {
  const stripped = xml
    .replace(/<\?xml[^>]*\?>/g, '')
    .replace(/<(CITA|AUTH|SOURCE|EDNOTE|SECAUTH)\b[^>]*>[\s\S]*?<\/\1>/g, '')
    .replace(/<HEAD>/g, '\n\n## ')
    .replace(/<\/HEAD>/g, '\n\n')
    .replace(/<(P|FP)\b[^>]*>/g, '\n\n')
    .replace(/<[^>]+>/g, '');
  return decodeEntities(stripped)
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function getJson<T>(fetchImpl: FetchLike, url: string): Promise<T> {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`eCFR ${response.status} for ${url}`);
  return (await response.json()) as T;
}

export interface EcfrPart {
  text: string;
  amendedOn: string;
  asOf: string;
}

/** Current text of one CFR part, as of the title's latest published date. */
export async function fetchEcfrPart(ref: { title: number; part: number }, fetchImpl: FetchLike = fetch): Promise<EcfrPart> {
  const titles = await getJson<{ titles: { number: number; up_to_date_as_of: string }[] }>(fetchImpl, `${API}/titles.json`);
  const asOf = titles.titles.find((t) => t.number === ref.title)?.up_to_date_as_of;
  if (!asOf) throw new Error(`eCFR has no title ${ref.title}`);

  const versions = await getJson<{ meta: { latest_amendment_date: string } }>(
    fetchImpl,
    `${API}/versions/title-${ref.title}.json?part=${ref.part}`,
  );

  const url = `${API}/full/${asOf}/title-${ref.title}.xml?part=${ref.part}`;
  const response = await fetchImpl(url, { headers: { 'Accept-Encoding': 'gzip' } });
  if (!response.ok) throw new Error(`eCFR ${response.status} for ${url}`);
  const amendedOn = versions.meta.latest_amendment_date;
  const body = ecfrXmlToText(await response.text());
  return { text: `# ${ref.title} CFR Part ${ref.part} (amended ${amendedOn})\n\n${body}\n`, amendedOn, asOf };
}
```

`packages/rules/src/cli/fetch-ecfr.ts`:

```ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchEcfrPart } from '../ecfr';
import { DEFAULT_SOURCES_FILE, loadSources } from '../load';
import { sourceTextPath } from '../quotes';

const { values } = parseArgs({
  options: {
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
    versions: { type: 'string' },
  },
});

if (!values.versions) {
  console.error('Usage: rules:fetch-ecfr --versions <checkout of elsewhere-sources-versions>');
  process.exit(2);
}

let failed = 0;
for (const source of Object.values(loadSources(values.sources))) {
  if (!('ecfr' in source.detector)) continue;
  const path = sourceTextPath(source, values.versions);
  try {
    const part = await fetchEcfrPart(source.detector.ecfr);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (current === part.text) {
      console.log(`${source.key}: unchanged (amended ${part.amendedOn})`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, part.text);
    console.log(`${source.key}: ${current ? 'updated' : 'first record'} (amended ${part.amendedOn}, as of ${part.asOf})`);
  } catch (error) {
    failed++;
    console.error(`${source.key}: ${(error as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
```

- [ ] **Step 6: Run the tests, typecheck, and one live fetch**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 81`, `ℹ fail 0`, clean tsc.

Run: `npm run -s rules:fetch-ecfr -w @elsewhere/rules -- --versions "${TMPDIR:-/tmp}/ecfr-live" && head -5 "${TMPDIR:-/tmp}/ecfr-live/eCFR/title-14-part-260.md"`
Expected: six `first record` lines, then `# 14 CFR Part 260 (amended 2024-08-12)` (or a later date, if the part has since been amended) and `## PART 260—REFUNDS FOR AIRLINE FARE AND ANCILLARY SERVICE FEES`.

- [ ] **Step 7: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Fetch regulation text from the eCFR versioning API

Regulations are tracked through the API rather than page scraping, so a
version only changes when the part is actually amended.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 12: Source repositories and the daily tracker

**Files:**
- Create: `.github/workflows/sources-track.yml`
- Create in the new repo `ifaemuh/elsewhere-sources-declarations`: `package.json`, `package-lock.json`, `config/default.json`, `.gitignore`, `README.md`, `declarations/*.json`
- Create in `ifaemuh/elsewhere-sources-versions` and `ifaemuh/elsewhere-sources-snapshots`: `README.md`

**Interfaces:**
- Consumes: `rules:declarations` (Task 9), `rules:fetch-ecfr` (Task 11).
- Produces: the daily `sources-track.yml` run (06:17 UTC, also run by hand with `workflow_dispatch`). It leaves `ifaemuh/elsewhere-sources-versions` holding:
  - `<service>/<terms type>.md` for web sources
  - `eCFR/title-<T>-part-<P>.md` for regulations

  Each new version is one commit. Tasks 13 and 16–21 read this repo.

- [ ] **Step 1: FOUNDER CONFIRMATION — put this work on `main`**

Ask the founder: "GitHub only runs scheduled workflows from `main`. May I open a PR from this branch into `main` and merge it?" On yes:

```bash
gh pr create --base main --head "$(git branch --show-current)" --title "Rules library (track A, Tasks 1–11)" --body "Track A: @elsewhere/rules package, sources, OTA declarations, eCFR fetcher. Plan: docs/superpowers/plans/2026-10-01-track-a-rules-library.md"
gh pr merge "$(git branch --show-current)" --merge
```

If the founder wants a different integration path, follow it. Tasks 12–17 need the workflows on `main` before they can run on a schedule.

- [ ] **Step 2: FOUNDER CONFIRMATION — create the three private repositories**

Ask: "May I create three private repos under ifaemuh: elsewhere-sources-declarations, elsewhere-sources-versions, elsewhere-sources-snapshots?" On yes:

```bash
gh repo create ifaemuh/elsewhere-sources-declarations --private --description "Open Terms Archive declarations for the Elsewhere rules library (generated from elsewhere/packages/rules/sources.yaml)"
gh repo create ifaemuh/elsewhere-sources-versions --private --description "Tracked text of every source the Elsewhere rules library quotes"
gh repo create ifaemuh/elsewhere-sources-snapshots --private --description "Raw snapshots behind elsewhere-sources-versions"
```

- [ ] **Step 3: Seed the collection repository**

```bash
REPO="$(git rev-parse --show-toplevel)"
WORK="${TMPDIR:-/tmp}/sources-seed" && rm -rf "$WORK" && mkdir -p "$WORK" && cd "$WORK"
gh repo clone ifaemuh/elsewhere-sources-declarations decl && cd decl
mkdir -p config
```

`package.json`:

```json
{
  "name": "elsewhere-sources-declarations",
  "private": true,
  "type": "module",
  "scripts": {
    "track": "ota track"
  },
  "dependencies": {
    "@opentermsarchive/engine": "16.3.0"
  }
}
```

`config/default.json`:

```json
{
  "@opentermsarchive/engine": {
    "recorder": {
      "versions": {
        "storage": {
          "git": {
            "snapshotIdentiferTemplate": "https://github.com/ifaemuh/elsewhere-sources-snapshots/commit/%SNAPSHOT_ID",
            "author": { "name": "elsewhere-sources-bot", "email": "elsewhere-sources-bot@users.noreply.github.com" }
          }
        }
      },
      "snapshots": {
        "storage": {
          "git": {
            "author": { "name": "elsewhere-sources-bot", "email": "elsewhere-sources-bot@users.noreply.github.com" }
          }
        }
      }
    },
    "fetcher": {
      "language": "en-US, en"
    },
    "reporter": {
      "type": "github",
      "repositories": {
        "declarations": "ifaemuh/elsewhere-sources-declarations",
        "versions": "ifaemuh/elsewhere-sources-versions",
        "snapshots": "ifaemuh/elsewhere-sources-snapshots"
      }
    }
  }
}
```

`.gitignore`:

```
node_modules/
data/
```

`README.md`:

```markdown
# elsewhere-sources-declarations

Open Terms Archive collection for the Elsewhere rules library. `declarations/` is
generated from `packages/rules/sources.yaml` in `ifaemuh/elsewhere` by the daily
"Track rule sources" workflow there. Do not edit declarations by hand.
```

Then generate the declarations, install, and push (this is a new repo the founder just approved):

```bash
cd "$REPO" && npm run -s rules:declarations -w @elsewhere/rules -- --out "$WORK/decl/declarations"
cd "$WORK/decl" && npm install
git add -A && git commit -F - <<'EOF'
Seed the collection: engine 16.3.0, config, generated declarations

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
git push -u origin HEAD:main
```

- [ ] **Step 4: Give the versions and snapshots repositories a first commit**

`actions/checkout` can't check out an empty repository, so each gets a README:

```bash
for repo in versions snapshots; do
  cd "$WORK" && gh repo clone "ifaemuh/elsewhere-sources-$repo" "$repo" && cd "$repo"
  printf '# elsewhere-sources-%s\n\nWritten by the "Track rule sources" workflow in ifaemuh/elsewhere. Do not edit by hand.\n' "$repo" > README.md
  git add README.md && git commit -m "Start the $repo record" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
  git push -u origin HEAD:main
done
```

- [ ] **Step 5: FOUNDER ACTION — create the token and store it as a secret**

A fine-grained personal access token can only be created in the GitHub UI. Ask the founder to:

1. Open github.com → Settings → Developer settings → Fine-grained tokens → **Generate new token**.
2. Fill in:
   - Name: `elsewhere-sources`
   - Resource owner: `ifaemuh`
   - Expiration: 1 year
3. Under Repository access, choose **Only select repositories** and pick the three `elsewhere-sources-*` repos.
4. Set permissions: **Contents** read and write, **Issues** read and write, **Metadata** read.
5. Store the token as a secret on the app repo by running this in the Claude Code prompt and pasting the token when asked:

   ```
   ! gh secret set SOURCES_REPOS_TOKEN --repo ifaemuh/elsewhere
   ```

Verify: `gh secret list --repo ifaemuh/elsewhere` shows `SOURCES_REPOS_TOKEN`.

- [ ] **Step 6: Write the tracker workflow**

`.github/workflows/sources-track.yml`:

````yaml
name: Track rule sources

on:
  schedule:
    - cron: '17 6 * * *'
  workflow_dispatch: {}

permissions:
  contents: read

concurrency:
  group: sources-track
  cancel-in-progress: false

jobs:
  track:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Check out the source collection
        uses: actions/checkout@v4
        with:
          repository: ifaemuh/elsewhere-sources-declarations
          token: ${{ secrets.SOURCES_REPOS_TOKEN }}
          path: ota

      - name: Sync declarations from sources.yaml
        run: |
          npm run -s rules:declarations -w @elsewhere/rules -- --out "$GITHUB_WORKSPACE/ota/declarations"
          cd ota
          git config user.name "elsewhere-sources-bot"
          git config user.email "elsewhere-sources-bot@users.noreply.github.com"
          git add -A declarations
          if ! git diff --cached --quiet; then
            git commit -m "Sync declarations from elsewhere sources.yaml@${GITHUB_SHA::7}"
            git push
          fi

      - name: Check out versions
        uses: actions/checkout@v4
        with:
          repository: ifaemuh/elsewhere-sources-versions
          token: ${{ secrets.SOURCES_REPOS_TOKEN }}
          path: ota/data/versions
          fetch-depth: 0

      - name: Check out snapshots
        uses: actions/checkout@v4
        with:
          repository: ifaemuh/elsewhere-sources-snapshots
          token: ${{ secrets.SOURCES_REPOS_TOKEN }}
          path: ota/data/snapshots
          fetch-depth: 0

      - name: Track web sources with Open Terms Archive
        working-directory: ota
        env:
          OTA_ENGINE_GITHUB_TOKEN: ${{ secrets.SOURCES_REPOS_TOKEN }}
        run: |
          npm ci
          npx ota track

      - name: Track eCFR parts
        if: ${{ !cancelled() }}
        run: |
          npm run -s rules:fetch-ecfr -w @elsewhere/rules -- --versions "$GITHUB_WORKSPACE/ota/data/versions"
          cd ota/data/versions
          git config user.name "elsewhere-sources-bot"
          git config user.email "elsewhere-sources-bot@users.noreply.github.com"
          git add -A eCFR
          if ! git diff --cached --quiet; then
            parts=$(git diff --cached --name-only | sed 's#^eCFR/##; s#\.md$##' | paste -sd, -)
            git commit -m "Record eCFR changes: ${parts}"
          fi

      - name: Publish versions and snapshots
        if: ${{ !cancelled() }}
        run: |
          git -C ota/data/versions push
          git -C ota/data/snapshots push
````

Two notes on this workflow:
- **Which token does what.** `OTA_ENGINE_GITHUB_TOKEN` lets the engine open an issue in the declarations repo when a document fails to fetch, and close it once it's fixed. Rule statuses never change on a fetch failure, because an outage isn't a change.
- **Why `!cancelled()`.** The eCFR and publish steps still run if OTA reports failures, so nothing that was recorded gets lost.

- [ ] **Step 7: FOUNDER CONFIRMATION — commit to `main` and run it once**

```bash
git add .github/workflows/sources-track.yml
git commit -F - <<'EOF'
Track rule sources daily with Open Terms Archive and the eCFR API

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
git push origin HEAD:main
gh workflow run sources-track.yml --repo ifaemuh/elsewhere
gh run watch --repo ifaemuh/elsewhere "$(gh run list --repo ifaemuh/elsewhere --workflow sources-track.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: the run succeeds.

- [ ] **Step 8: Verify the first records**

```bash
gh api repos/ifaemuh/elsewhere-sources-versions/contents/eCFR --jq '.[].name'
gh api "repos/ifaemuh/elsewhere-sources-versions/contents/EU%20Your%20Europe%20Air%20Passenger%20Rights" --jq '.[].name'
```

Expected: `title-14-part-250.md`, `title-14-part-254.md`, `title-14-part-259.md`, `title-14-part-260.md`, `title-14-part-399.md`, `title-16-part-464.md`, and `Official Guidance.md`.

### Task 13: PR CI and the nightly quote backstop

**Files:**
- Create: `.github/workflows/rules-ci.yml`, `.github/workflows/rules-backstop.yml`

**Interfaces:**
- Consumes: `rules:check-quotes` (Task 7), the versions repo (Task 12), and the `SOURCES_REPOS_TOKEN` secret.
- Produces:
  - **"Rules CI".** Runs on PRs touching rules, and on pushes to `main`. It runs the tests, the typecheck, `rules:build`, and the quote check against the versions repo.
  - **"Rules quote backstop".** Runs nightly at 07:41 UTC, after the tracker. It opens a `rules/backstop-<date>` PR labelled `rules-backstop` whenever a verified rule's quote has disappeared.

- [ ] **Step 1: Write both workflows**

`.github/workflows/rules-ci.yml`:

````yaml
name: Rules CI

on:
  pull_request:
    paths:
      - 'packages/rules/**'
      - '.github/workflows/rules-*.yml'
      - '.github/workflows/sources-track.yml'
  push:
    branches: [main]
    paths:
      - 'packages/rules/**'

permissions:
  contents: read

jobs:
  rules:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci
      - run: npm test -w @elsewhere/rules
      - run: npm run typecheck -w @elsewhere/rules
      - run: npm run rules:build -w @elsewhere/rules

      - name: Check out versions
        uses: actions/checkout@v4
        with:
          repository: ifaemuh/elsewhere-sources-versions
          token: ${{ secrets.SOURCES_REPOS_TOKEN }}
          path: .sources-versions

      - name: Every quote must be in its source's tracked text
        run: npm run rules:check-quotes -w @elsewhere/rules -- --versions "$GITHUB_WORKSPACE/.sources-versions"
````

`.github/workflows/rules-backstop.yml`:

````yaml
name: Rules quote backstop

on:
  schedule:
    - cron: '41 7 * * *'
  workflow_dispatch: {}

permissions:
  contents: write
  pull-requests: write

jobs:
  backstop:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: Check out versions
        uses: actions/checkout@v4
        with:
          repository: ifaemuh/elsewhere-sources-versions
          token: ${{ secrets.SOURCES_REPOS_TOKEN }}
          path: .sources-versions

      - name: Flip verified rules whose quotes no longer match
        run: |
          set +e
          npm run -s rules:check-quotes -w @elsewhere/rules -- \
            --versions "$GITHUB_WORKSPACE/.sources-versions" --write-needs-review > backstop.txt
          cat backstop.txt

      - name: Open a PR when any rule was flipped
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          if git diff --quiet -- packages/rules/data; then
            echo "No rule flipped."
            exit 0
          fi
          branch="rules/backstop-$(date -u +%F)"
          if git ls-remote --exit-code --heads origin "$branch" > /dev/null; then
            echo "$branch already exists."
            exit 0
          fi
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git switch -c "$branch"
          git add packages/rules/data
          git commit -m "Flag rules whose quotes no longer match their sources" -m "$(cat backstop.txt)"
          git push -u origin "$branch"
          gh label create rules-backstop --force --color D93F0B --description "Nightly quote backstop"
          { echo "The nightly quote check could not find these quotes in the latest tracked source text."; \
            echo "Each failing verified rule is now needs_review. Re-verify with packages/rules/RESEARCH.md."; \
            echo; echo '```'; cat backstop.txt; echo '```'; } > body.md
          gh pr create --base main --head "$branch" --label rules-backstop \
            --title "Rules backstop: quotes not found ($(date -u +%F))" --body-file body.md
````

A PR opened with `github.token` gets no automatic workflow run until a maintainer clicks "Approve workflows to run" (or closes and reopens the PR), and a `workflow_dispatch` run does not count as the required "Rules CI / rules" check. So the backstop does not dispatch anything (final re-review fix); its PR body tells the founder to approve the workflow run. In CI, `rules:check-quotes --base-ref` also stops a flagged rule from failing: a quote that is new or changed relative to the merge-base must be found, but an unchanged quote of a rule that is no longer `verified` only warns, so the backstop PR (which flips status and changes no quote) goes green once approved. The PR body also carries the full check output.

- [ ] **Step 2: FOUNDER CONFIRMATION — let Actions open PRs**

Ask: "May I enable 'Allow GitHub Actions to create and approve pull requests' on ifaemuh/elsewhere so the backstop can open its PR?" On yes:

```bash
gh api -X PUT repos/ifaemuh/elsewhere/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true
```

- [ ] **Step 3: FOUNDER CONFIRMATION — commit to `main` and run the backstop once**

```bash
git add .github/workflows/rules-ci.yml .github/workflows/rules-backstop.yml
git commit -F - <<'EOF'
Check quotes on every rules PR and flip stale rules nightly

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
git push origin HEAD:main
gh workflow run rules-backstop.yml --repo ifaemuh/elsewhere
```

Expected: the backstop run succeeds and logs `All quotes found in 0 rule(s)` then `No rule flipped.`, because no real rules exist yet. The push also triggers "Rules CI" on `main`, which succeeds.

### Task 14: Weekly staleness issue

**Files:**
- Create: `packages/rules/src/stale.ts`, `packages/rules/src/cli/stale.ts`, `packages/rules/test/stale.test.ts`, `.github/workflows/rules-staleness.yml`
- Modify: `packages/rules/package.json` (add `rules:stale`)

**Interfaces:**
- Consumes: `loadRules`, `loadSources` (load); `Rule` (schema).
- Produces (internal):
  - `addDays(isoDate, days)`, which Task 15 reuses
  - `rulesDueForReview(rules, now, withinDays)`
  - `staleReport(rules)`
  - `npm run rules:stale -- [--within 14]`, which prints one markdown checkbox line per due rule and nothing when none are due
- Workflow: "Rules staleness", Mondays 13:00 UTC. It keeps one open issue labelled `rules-staleness` current, and closes it when nothing is due.

- [ ] **Step 1: Add the script**

In `packages/rules/package.json`, add `"rules:stale": "tsx src/cli/stale.ts",` after `rules:fetch-ecfr`.

- [ ] **Step 2: Write the failing test**

`packages/rules/test/stale.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { loadRules, loadSources } from '../src/load';
import { addDays, rulesDueForReview, staleReport } from '../src/stale';
import { FIXTURES } from './helpers';

const rules = loadRules({ dataDir: join(FIXTURES, 'rules'), sources: loadSources(join(FIXTURES, 'sources.yaml')) });

test('addDays crosses month and year boundaries', () => {
  assert.equal(addDays('2026-10-06', 90), '2027-01-04');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('rulesDueForReview uses review_by within the window and ignores drafts', () => {
  assert.deepEqual(rulesDueForReview(rules, new Date('2026-12-15T00:00:00Z'), 14), []);
  const due = rulesDueForReview(rules, new Date('2026-12-21T00:00:00Z'), 14);
  assert.equal(due.length, 4);
  assert.ok(due.every((r) => r.status === 'verified'));
  assert.equal(
    staleReport(due.slice(0, 1)),
    '- [ ] `fx-24h-free-cancellation` — Fixture: 24-hour free cancellation (review by 2027-01-04)',
  );
});
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `cd packages/rules && node --import tsx --test test/stale.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/stale`.

- [ ] **Step 4: Implement**

`packages/rules/src/stale.ts`:

```ts
import type { Rule } from './schema';

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Verified or needs_review rules whose review_by falls on or before now + withinDays. */
export function rulesDueForReview(rules: Rule[], now: Date, withinDays: number): Rule[] {
  const cutoff = addDays(now.toISOString().slice(0, 10), withinDays);
  return rules
    .filter((r) => (r.status === 'verified' || r.status === 'needs_review') && r.review_by !== null && r.review_by <= cutoff)
    .sort((a, b) => (a.review_by ?? '').localeCompare(b.review_by ?? '') || a.id.localeCompare(b.id));
}

export function staleReport(rules: Rule[]): string {
  return rules.map((r) => `- [ ] \`${r.id}\` — ${r.title} (review by ${r.review_by})`).join('\n');
}
```

`packages/rules/src/cli/stale.ts`:

```ts
import { parseArgs } from 'node:util';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, loadRules, loadSources } from '../load';
import { rulesDueForReview, staleReport } from '../stale';

const { values } = parseArgs({
  options: {
    within: { type: 'string', default: '14' },
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
  },
});

const rules = loadRules({ dataDir: values['data-dir'], sources: loadSources(values.sources) });
const report = staleReport(rulesDueForReview(rules, new Date(), Number(values.within)));
if (report) console.log(report);
```

`.github/workflows/rules-staleness.yml`:

````yaml
name: Rules staleness

on:
  schedule:
    - cron: '0 13 * * 1'
  workflow_dispatch: {}

permissions:
  contents: read
  issues: write

jobs:
  staleness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - run: npm ci

      - name: List rules due within 14 days
        run: npm run -s rules:stale -w @elsewhere/rules -- --within 14 > stale.md

      - name: Open, update or close the staleness issue
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh label create rules-staleness --force --color FBCA04 --description "Rules due for re-verification"
          existing=$(gh issue list --label rules-staleness --state open --json number --jq '.[0].number // empty')
          if [ ! -s stale.md ]; then
            if [ -n "$existing" ]; then gh issue close "$existing" --comment "Nothing is due in the next 14 days."; fi
            exit 0
          fi
          { echo "These rules reach their review_by date within 14 days."; \
            echo "Re-verify each one with packages/rules/RESEARCH.md, then run rules:verify."; \
            echo; cat stale.md; } > body.md
          if [ -n "$existing" ]; then
            gh issue edit "$existing" --body-file body.md
          else
            gh issue create --title "Rules due for re-verification" --label rules-staleness --body-file body.md
          fi
````

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 83`, `ℹ fail 0`, clean tsc.

- [ ] **Step 6: FOUNDER CONFIRMATION — commit to `main` and run it once**

```bash
git add packages/rules .github/workflows/rules-staleness.yml
git commit -F - <<'EOF'
Open a weekly issue for rules due for re-verification

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
git push origin HEAD:main
gh workflow run rules-staleness.yml --repo ifaemuh/elsewhere
```

Expected: the run succeeds, and no issue is opened because nothing is due.

---

## Part 3 — Research tooling, the Dot, and the acceptance test

### Task 15: Approval tooling, data cases, and the research guide

**Files:**
- Create: `packages/rules/src/verify.ts`, `packages/rules/src/cli/verify.ts`, `packages/rules/test/verify.test.ts`, `packages/rules/test/data-cases.test.ts`, `packages/rules/RESEARCH.md`
- Modify: `packages/rules/package.json` (add `rules:verify`)

**Interfaces:**
- Consumes: `appendHistory` (Task 7), `addDays` (Task 14), `loadRuleFiles`, `loadRules`, `loadSources` (Task 4), and `matchRule` (Task 3).
- Produces:
  - **`markVerified(yamlText, { by, date })` (internal).** It sets `status: verified`, `last_verified`, `verified_by`, and `review_by` (+90 days), and appends a `{ version, status: verified, date }` history entry. It refuses retired rules.
  - **`npm run rules:verify -- <id...> --by <handle> [--date YYYY-MM-DD]`.**
  - **The data-case test.** Every non-retired rule in `data/` must have `test/data-cases/<id>.yaml`. Each case file covers `applies`, `may_apply`, and `does_not_apply`, and every case must match.

- [ ] **Step 1: Add the script**

In `packages/rules/package.json`, add `"rules:verify": "tsx src/cli/verify.ts"` as the last entry of `scripts`. Add a comma to the line before it so the JSON stays valid. The finished block reads:

```json
  "scripts": {
    "test": "node --import tsx --test \"test/**/*.test.ts\"",
    "typecheck": "tsc --noEmit",
    "build": "npm run rules:build",
    "rules:build": "tsx src/cli/build.ts",
    "rules:check-quotes": "tsx src/cli/check-quotes.ts",
    "rules:declarations": "tsx src/cli/declarations.ts",
    "rules:fetch-ecfr": "tsx src/cli/fetch-ecfr.ts",
    "rules:stale": "tsx src/cli/stale.ts",
    "rules:verify": "tsx src/cli/verify.ts"
  },
```

- [ ] **Step 2: Write the failing tests**

`packages/rules/test/verify.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { RuleSchema } from '../src/schema';
import { markVerified } from '../src/verify';
import { FIXTURES } from './helpers';

const draftYaml = () => readFileSync(join(FIXTURES, 'rules/fx-draft-cancellation-note.yaml'), 'utf8');

test('markVerified sets the verification fields, appends history and keeps comments', () => {
  const out = markVerified(draftYaml().replace('status: draft', 'status: draft # awaiting founder'), { by: 'ifaemuh', date: '2026-10-06' });
  const rule = RuleSchema.parse(parse(out));
  assert.equal(rule.status, 'verified');
  assert.equal(rule.last_verified, '2026-10-06');
  assert.equal(rule.verified_by, 'ifaemuh');
  assert.equal(rule.review_by, '2027-01-04');
  assert.deepEqual(rule.history.at(-1), { version: 1, status: 'verified', date: '2026-10-06' });
  assert.match(out, /# awaiting founder/);
  assert.match(out, /^ {2}- \{ version: 1, status: verified, date: 2026-10-06 \}$/m);
});

test('markVerified refuses retired rules', () => {
  assert.throws(() => markVerified(draftYaml().replace('status: draft', 'status: retired'), { by: 'x', date: '2026-10-06' }), /retired/);
});
```

`packages/rules/test/data-cases.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Situation } from '../src/facts';
import { loadRules } from '../src/load';
import { matchRule, type MatchOutcome } from '../src/match';

interface CaseFile {
  rule: string;
  cases: { name: string; situation: Situation; outcome: MatchOutcome; missing_facts?: string[] }[];
}

const casesDir = fileURLToPath(new URL('./data-cases/', import.meta.url));
const rules = loadRules().filter((r) => r.status !== 'retired');
const files = existsSync(casesDir) ? readdirSync(casesDir).filter((f) => f.endsWith('.yaml')).sort() : [];

test('every live rule in data/ has a cases file', () => {
  const missing = rules.filter((r) => !files.includes(`${r.id}.yaml`)).map((r) => `test/data-cases/${r.id}.yaml`);
  assert.deepEqual(missing, []);
});

for (const file of files) {
  const spec = parse(readFileSync(join(casesDir, file), 'utf8')) as CaseFile;
  const rule = rules.find((r) => r.id === spec.rule);

  test(`${file}: names a live rule and covers applies, may_apply and does_not_apply`, () => {
    assert.equal(`${spec.rule}.yaml`, file);
    assert.ok(rule, `no live rule ${spec.rule} in data/`);
    const outcomes = new Set(spec.cases.map((c) => c.outcome));
    for (const outcome of ['applies', 'may_apply', 'does_not_apply'] as const) assert.ok(outcomes.has(outcome), `needs a ${outcome} case`);
  });

  for (const c of spec.cases) {
    test(`${spec.rule}: ${c.name}`, () => {
      assert.ok(rule);
      const result = matchRule(rule, c.situation);
      assert.equal(result.outcome, c.outcome);
      assert.deepEqual(result.missing_facts, c.missing_facts ?? []);
    });
  }
}
```

- [ ] **Step 3: Run them to make sure verify fails**

Run: `cd packages/rules && node --import tsx --test test/verify.test.ts test/data-cases.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/verify`. The data-case test passes, with one test, because `data/` is still empty.

- [ ] **Step 4: Implement verify and write the guide**

`packages/rules/src/verify.ts`:

```ts
import { parseDocument } from 'yaml';
import { appendHistory } from './history';
import { addDays } from './stale';

/** Marks one rule file's YAML as verified by `by` on `date`, with review due 90 days later. */
export function markVerified(yamlText: string, opts: { by: string; date: string }): string {
  const doc = parseDocument(yamlText);
  const status = doc.get('status');
  if (status === 'retired') throw new Error(`${String(doc.get('id'))} is retired and cannot be verified`);
  doc.set('status', 'verified');
  doc.set('last_verified', opts.date);
  doc.set('verified_by', opts.by);
  doc.set('review_by', addDays(opts.date, 90));
  appendHistory(doc, { version: Number(doc.get('version')), status: 'verified', date: opts.date });
  return String(doc);
}
```

`packages/rules/src/cli/verify.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, loadRuleFiles, loadSources } from '../load';
import { markVerified } from '../verify';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    by: { type: 'string' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
  },
});

if (!values.by || positionals.length === 0) {
  console.error('Usage: rules:verify <rule-id> [...] --by <github handle> [--date YYYY-MM-DD]');
  process.exit(2);
}

const files = new Map(loadRuleFiles({ dataDir: values['data-dir'], sources: loadSources(values.sources) }).map((e) => [e.rule.id, e.file]));
const missing = positionals.filter((id) => !files.has(id));
if (missing.length) {
  console.error(`Unknown rule id(s): ${missing.join(', ')}`);
  process.exit(1);
}
for (const id of positionals) {
  const file = files.get(id)!;
  writeFileSync(file, markVerified(readFileSync(file, 'utf8'), { by: values.by, date: values.date }));
  console.log(`${id}: verified by ${values.by} on ${values.date}`);
}
```

`packages/rules/RESEARCH.md`:

````markdown
# Researching a rule

How a rule gets from the backlog into `data/`. Every step is required. The quote check and
the data-case test enforce most of it. The rest is on the researcher.

## 1. Pick the item and its sources

- Take the next backlog item (track A spec, "Initial backlog"), or a rule named in a
  staleness, backstop, or refresh PR.
- List the primary sources that state the rule: the regulation, the government agency,
  the EU or UK authority, the airline's own contract of carriage or customer service
  plan, or the card issuer's benefit guide. Blogs, news, forums, and OTAs are never
  sources.
- Every source must be a key in `sources.yaml`. If one is missing, add it in the same PR,
  plus an `ota-overrides.yaml` entry if the page needs a narrower `select` or client
  scripts. Then dispatch the tracker so its text exists before you quote it:
  `gh workflow run sources-track.yml --repo ifaemuh/elsewhere`.

## 2. Quote the tracked text, not the live page

The quote check reads `elsewhere-sources-versions`, so copy quotes from there:

```bash
git clone https://github.com/ifaemuh/elsewhere-sources-versions /tmp/sources-versions \
  || git -C /tmp/sources-versions pull
```

| Detector | File |
|---|---|
| `ota` | `<service>/<terms_type>.md` |
| `ecfr` | `eCFR/title-<title>-part-<part>.md` |

## 3. Write the rule file

Create `data/<domain>/<id>.yaml`. Field by field:

| Field | Rule |
|---|---|
| `id` | kebab-case, prefixed by its family (`us-dot-`, `eu261-`, `uk261-`, `dl-`, `chase-`). Never changes |
| `version`, `status` | `1`, `draft` |
| `last_verified`, `verified_by`, `review_by` | `null` |
| `history` | one entry: `- { version: 1, status: draft, date: <today> }` |
| `title` | ≤ 120 characters. The traveler's question, answered: "Cancelled flight? You're owed cash, not a voucher" |
| `summary` | ≤ 400 characters. What the rule gives and when. No hedging the source doesn't use |
| `applies_when` | Only facts from `src/facts.ts`. Mirror the source's scope and thresholds exactly. For exceptions the airline has to prove (extraordinary circumstances), use `event.cause in [controllable, unknown]`: an unknown cause still applies, and an absent cause makes the rule `may_apply` so Assist asks |
| `entitlement` | `kind`, then `amount` and `timing` exactly as the source states them |
| `how_to_claim.steps` | What the traveler does, in order, imperative mood |
| `how_to_claim.templates` | snake_case names of message templates track C renders, e.g. `airline_refund_request`, `eu261_claim_letter` |
| `exceptions` | Every limitation the source states |
| `sources[].quotes` | See below |
| `lead_character` | See below |
| `tags` | Lowercase topic words |

If a condition needs a fact that doesn't exist, stop. First amend
`docs/superpowers/plans/2026-10-01-rules-package-interface.md` and `src/facts.ts` in their
own commit, then write the rule.

**Quotes**
- Copy contiguous text from the tracked file. Never paraphrase, fix a typo, or join two
  sentences.
- A quote must not cross markdown formatting in the tracked file (link brackets, `**`,
  `_`, list markers, headings). If a sentence contains a link or emphasis, quote the part
  before or after it, or use two quotes.
- `supports` lists every rule field the quote backs: `summary`, `applies_when`,
  `entitlement.amount`, `exceptions`, `how_to_claim.steps.0`. Both `summary` and
  `entitlement` must be backed.

**Lead character**

| Topic | Character |
|---|---|
| It already went wrong: bumping, tarmac delays, missed connections, lost bags | `raccoon` |
| Rules and deadlines: the 24-hour rule, passport validity, entry permits | `owl` |
| Money owed and perks: refunds, compensation, card coverage | `pigeon` |
| The calm fix: right to care, what happens next | `capybara` |

## 4. Write the cases

Create `test/data-cases/<id>.yaml` with at least one `applies`, one `may_apply`, and one
`does_not_apply` case. Put cases on both sides of every threshold (179 and 180 minutes).

```yaml
rule: us-dot-refund-cancelled-flight
cases:
  - name: declined the rebooking
    situation: { event.type: cancellation, flight.touches_us: true, passenger.accepted_alternative: false }
    outcome: applies
  - name: has not decided yet
    situation: { event.type: cancellation, flight.touches_us: true }
    outcome: may_apply
    missing_facts: [passenger.accepted_alternative]
  - name: took the voucher
    situation: { event.type: cancellation, flight.touches_us: true, passenger.accepted_alternative: true }
    outcome: does_not_apply
```

## 5. Check locally

```bash
npm test -w @elsewhere/rules
npm run rules:build -w @elsewhere/rules
npm run rules:check-quotes -w @elsewhere/rules -- --versions /tmp/sources-versions
```

All three must pass before the PR.

## 6. Open the PR (the founder confirms before it is opened)

Branch `rules/add-<short-name>`, title `Rules: add <ids>`. Body, once per rule:

```markdown
### <id> — <title>
**Says:** <summary>
**Applies when:** <the conditions in plain words>
**Sources:** <key> — <section or heading the quotes come from>
**Quotes:**
> <quote 1>
> <quote 2>
**Unsure about:** <anything a reviewer should look at first, or "nothing">
```

## 7. Approval

The founder reviews, at about two minutes per rule, and merges. Then, from a fresh branch
off `main` (main is protected; nothing is pushed to it directly):

```bash
git switch main && git pull && git switch -c rules/verify-<date>
npm run rules:verify -w @elsewhere/rules -- <id> [<id> ...] --by ifaemuh
git commit -am "Verify rules: <ids>"
git push -u origin HEAD && gh pr create --base main --fill
```

`rules:verify` sets `status: verified`, `last_verified`, `verified_by`, and `review_by`
(+90 days), and appends the verified history entry. Merge that PR once Rules CI is green.

## Changing a verified rule

- **What the rule says changes:** `version` + 1, `status: needs_review`, and append
  `- { version: <new>, status: needs_review, date: <today>, note: "<one line: what changed>" }`.
  Same PR flow. After approval, `rules:verify` appends the verified entry.
- **A quote's wording moved but the meaning didn't:** update the quote `text` only. No
  version, status, or history change.
- **Retiring:** `status: retired`, append a retired history entry with a note, and set
  `replaced_by` if another rule supersedes it.
- **Never** edit or delete past history entries.
````

- [ ] **Step 5: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 86`, `ℹ fail 0`, clean tsc.

- [ ] **Step 6: Commit**

```bash
git add packages/rules
git commit -F - <<'EOF'
Add rules:verify, per-rule data cases, and the research guide

Approval appends a verified history entry; every rule must ship match
cases that cover applies, may_apply and does_not_apply.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### Task 16: The Rules Keeper Dot

> **Final-review note (I4, M2):** the files in `packages/rules/dot/` are authoritative; the copies embedded below predate the final review. It changed `goal.md` (OTA commit titles mapped by file path, a Federal Register `lte` bound, `needs_review` on every version bump) and `setup.md` ("Do not allow bypassing" on branch protection, a recorded connector identity and `workflows`-permission check, and the soft-limit caveat when the connector is the founder's own account).

**Files:**
- Create: `packages/rules/dot/goal.md`, `packages/rules/dot/setup.md`

**Interfaces:**
- Consumes:
  - commits to `ifaemuh/elsewhere-sources-versions` (Task 12)
  - the history contract (Task 2)
  - the "Rules CI" check (Task 13)
  - the Federal Register API
- Produces:
  - `rules/refresh-<source key>-<YYYY-MM-DD>` PRs into `main` with rule updates. A substantive change bumps `version`, sets `needs_review`, and appends a history entry.
  - Weekly `Federal Register watch` issues labelled `rules-watch`.

- [ ] **Step 1: Write the goal prompt and the setup record**

`packages/rules/dot/goal.md`:

````markdown
# Rules Keeper — goal

You keep Elsewhere's travel rules library (`packages/rules/` in `ifaemuh/elsewhere`) in
step with the primary sources it quotes. A founder approves everything you propose. You
never merge.

## What you watch

1. **New commits in `ifaemuh/elsewhere-sources-versions`.** Each commit records a new
   version of one source:
   - Open Terms Archive commits are titled like "Record new changes of <service>'s
     <terms type>" or "First record of …". The file is `<service>/<terms type>.md`.
   - eCFR commits are titled "Record eCFR changes: title-14-part-260, …". The files are
     `eCFR/title-<T>-part-<P>.md`.
   Ignore "First record" commits: nothing was quoted from a document before it existed.
2. **Every Monday, the Federal Register** (see the last section).

## For each new source version

1. Map the changed file to its source key in `packages/rules/sources.yaml`:
   - `<service>/<terms type>.md` is the source whose `detector.ota` has that `service`
     and `terms_type`.
   - `eCFR/title-<T>-part-<P>.md` is the source whose `detector.ecfr` is
     `{ title: T, part: P }`.
2. Find every rule in `packages/rules/data/**/*.yaml` whose `sources[].source` is that
   key. If there are none, stop and do nothing.
3. Read the diff of that file (previous version → this one) and each affected rule.
4. Classify each affected rule:
   - **no-impact.** Every quote still appears word for word (ignoring whitespace and
     curly vs straight quotes), and nothing the rule says changed. Do nothing.
   - **quote-moved.** The meaning is unchanged, but a quote's wording or punctuation
     changed so it no longer matches. Replace only that quote's `text` with the new exact
     wording. Change nothing else.
   - **substantive.** What the source says about this rule changed: an amount, threshold,
     deadline, scope, or exception, or the text the rule relies on was removed. Update the
     affected fields and quotes from the new text. Increment `version` by 1, set
     `status: needs_review`, and append one history entry:
     `- { version: <new version>, status: needs_review, date: <today>, note: "<what changed, one line>" }`.
   - If you are unsure whether a change is substantive, treat it as substantive.
5. If any rule is quote-moved or substantive, open ONE pull request:
   - Branch `rules/refresh-<source key>-<YYYY-MM-DD>` from `main`.
   - Title: `Rules refresh: <source key> changed on <date>`.
   - Body: a link to the versions commit, then for each rule its classification, the old
     and new source text, what you changed, and anything you are unsure about.
6. CI (the "Rules CI" check) must pass. If it fails, read the log, fix the rule files,
   and push to the same branch. After two failed attempts, comment on the PR asking the
   founder, and stop.

## Never

- Edit or delete existing history entries. Only append.
- Change `last_verified`, `verified_by`, `review_by`, or a rule's `id`.
- Edit anything outside `packages/rules/data/`, including `sources.yaml` and
  `ota-overrides.yaml`. If a source needs a change, say so in the PR body.
- Merge, push to `main`, or touch any other repository.
- Quote anything that is not in the tracked text.

## Weekly Federal Register watch (Mondays)

Fetch:

```
https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=transportation-department&conditions[term]=airline+passengers&conditions[type][]=RULE&conditions[type][]=PRORULE&conditions[publication_date][gte]=<7 days ago, YYYY-MM-DD>&order=newest&per_page=50&fields[]=title&fields[]=type&fields[]=publication_date&fields[]=effective_on&fields[]=html_url
```

For each result about refunds, delays, cancellations, denied boarding, baggage, tarmac
delays, customer service plans, fees, or fare disclosure, open ONE issue in
`ifaemuh/elsewhere` titled `Federal Register watch: week of <Monday's date>` with the
label `rules-watch`. List each document's title, type, effective date, link, and which rule
ids or backlog items it may affect. If nothing is relevant, do nothing.

## Style

Plain and specific. Quote exact text. Never present a guess as fact.
````

`packages/rules/dot/setup.md`:

````markdown
# Rules Keeper — Dot setup

Dots are configured in ChatGPT, not by API, so this file records the exact settings. If
you change a setting in ChatGPT, change it here in the same week.

| Setting | Value |
|---|---|
| Plan | ChatGPT Pro (the founder's account) |
| Name | Rules Keeper |
| Goal | The full contents of `packages/rules/dot/goal.md` at the commit noted below |
| Connector | GitHub, authorized for `ifaemuh/elsewhere` (read and write) and `ifaemuh/elsewhere-sources-versions` (read) |
| Web access | `www.federalregister.gov` |

**Custom Rules**

| Allow | Require approval | Prohibit |
|---|---|---|
| Read both repositories | Any change to `packages/rules/sources.yaml` or `packages/rules/ota-overrides.yaml` | Merging pull requests |
| Create branches named `rules/refresh-*` in `ifaemuh/elsewhere` | Any change outside `packages/rules/data/` | Pushing to `main` |
| Commit to its own `rules/refresh-*` branches | | Deleting branches it didn't create |
| Open pull requests from those branches to `main`, and comment on them | | Any other repository |
| Open or comment on issues labelled `rules-watch` | | Repository settings, secrets, or workflows |
| Fetch the Federal Register API | | |
````

- [ ] **Step 2: FOUNDER CONFIRMATION — commit to `main`**

```bash
git add packages/rules/dot
git commit -F - <<'EOF'
Version the Rules Keeper Dot's goal prompt and configuration

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
git push origin HEAD:main
gh label create rules-watch --repo ifaemuh/elsewhere --force --color 5319E7 --description "Federal Register watch from the Rules Keeper Dot"
```

- [ ] **Step 3: FOUNDER ACTION — create the Dot in ChatGPT**

Dots have no API, so the founder does this in ChatGPT on the Pro account. Give them this checklist:
1. ChatGPT → Dots → New dot. Name it **Rules Keeper**.
2. Goal: paste the full text of `packages/rules/dot/goal.md` from `main`. Raw link: `https://github.com/ifaemuh/elsewhere/blob/main/packages/rules/dot/goal.md`.
3. Connect GitHub. Authorize `ifaemuh/elsewhere` (read and write) and `ifaemuh/elsewhere-sources-versions` (read). If the connector can't be scoped per repository, the Custom Rules below enforce the scope.
4. Allow web access to `www.federalregister.gov`.
5. Enter the Custom Rules exactly as in the table in `packages/rules/dot/setup.md`.
6. Fill in the "Connector identity" and "Connector scopes" rows of `setup.md` (the account the connector authenticates as; confirmation that it has no `workflows` or Actions write permission), and confirm the server-side guards there are already in place.
7. Reply with the date and confirm the Dot is running.

- [ ] **Step 4: Record the configuration**

```bash
printf '\n**Configured:** %s from goal.md at commit %s.\n' "$(date -u +%F)" "$(git rev-parse --short origin/main)" >> packages/rules/dot/setup.md
git add packages/rules/dot/setup.md
git commit -F - <<'EOF'
Record when the Rules Keeper Dot was configured

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
git push origin HEAD:main
```

(The push is covered by the confirmation in Step 2. Ask again if the session changed.)

### Task 17: Planted-change acceptance test

Before trusting the loop, prove both paths on a page we control. Path A: the Dot turns a source change into a correct PR. Path B: with the Dot paused, the nightly backstop still flips the rule.

**Files:**
- Create (temporarily, deleted in Step 7): `packages/rules/data/flights/canary-acceptance-test.yaml`, `packages/rules/test/data-cases/canary-acceptance-test.yaml`
- Modify (temporarily): `packages/rules/sources.yaml`, `packages/rules/ota-overrides.yaml`
- Create: the public repo `ifaemuh/elsewhere-canary` with GitHub Pages

**Interfaces:**
- Consumes: Tasks 12–16 (the tracker, CI, backstop, data-case test, and the running Dot).

- [ ] **Step 1: FOUNDER CONFIRMATION — create the canary page**

Ask: "May I create a public repo ifaemuh/elsewhere-canary with a one-sentence GitHub Pages page for the acceptance test?" On yes:

```bash
CANARY="${TMPDIR:-/tmp}/elsewhere-canary" && rm -rf "$CANARY"
gh repo create ifaemuh/elsewhere-canary --public --description "Canary page for the Elsewhere rules refresh acceptance test"
gh repo clone ifaemuh/elsewhere-canary "$CANARY" && cd "$CANARY"
cat > index.html <<'EOF'
<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Elsewhere canary</title></head>
<body><main><h1>Elsewhere canary</h1>
<p>Passengers on canary flights receive a refund within 7 business days.</p>
</main></body></html>
EOF
git add index.html && git commit -m "Canary page" && git push -u origin HEAD:main
gh api -X POST repos/ifaemuh/elsewhere-canary/pages -f "source[branch]=main" -f "source[path]=/"
```

Wait until `curl -s https://ifaemuh.github.io/elsewhere-canary/ | grep -c "7 business days"` prints `1`. That takes up to a few minutes.

- [ ] **Step 2: Track it and cite it from a canary rule**

Append to `packages/rules/sources.yaml`:

```yaml

# Acceptance-test canary (Task 17). Removed after the test.
canary-page:
  url: https://ifaemuh.github.io/elsewhere-canary/
  kind: government_page
  detector: { ota: { service: "Elsewhere Canary", terms_type: "Official Guidance" } }
```

Append to `packages/rules/ota-overrides.yaml`:

```yaml
canary-page: { select: main }
```

`packages/rules/data/flights/canary-acceptance-test.yaml`:

```yaml
id: canary-acceptance-test
version: 1
status: verified
domain: flights
jurisdiction: "country:US"
title: "Canary (internal acceptance-test rule)"
summary: "Internal test rule. Passengers on canary flights receive a refund within 7 business days."
applies_when:
  all:
    - fact: event.type
      in: [cancellation]
    - fact: flight.touches_us
      eq: true
entitlement:
  kind: refund
  timing: "7 business days"
how_to_claim:
  steps:
    - "Not a real rule."
  templates: []
exceptions: []
sources:
  - id: s1
    source: canary-page
    quotes:
      - text: "Passengers on canary flights receive a refund within 7 business days."
        supports: [summary, entitlement.timing]
lead_character: capybara
tags: [internal]
last_verified: 2026-10-01
verified_by: ifaemuh
review_by: 2026-12-30
history:
  - { version: 1, status: verified, date: 2026-10-01, note: "acceptance-test canary" }
```

Replace the three `2026-10-01` dates and the `review_by` with today and today + 90 days.

`packages/rules/test/data-cases/canary-acceptance-test.yaml`:

```yaml
rule: canary-acceptance-test
cases:
  - name: canary cancellation
    situation: { event.type: cancellation, flight.touches_us: true }
    outcome: applies
  - name: route unknown
    situation: { event.type: cancellation }
    outcome: may_apply
    missing_facts: [flight.touches_us]
  - name: not a cancellation
    situation: { event.type: delay, flight.touches_us: true }
    outcome: does_not_apply
```

A new source and a rule citing it cannot pass CI in one PR, because the source's text does not exist in `elsewhere-sources-versions` until the tracker has run. So this goes in two PRs (final-review fix I5): first the source only (`sources.yaml` and `ota-overrides.yaml`), merged, then `gh workflow run sources-track.yml --repo ifaemuh/elsewhere` and wait for the text to appear; then the rule and its data-case file in a second PR. Main is protected, so neither is pushed directly.

FOUNDER CONFIRMATION, then open the source PR and record a first version:

```bash
npm test -w @elsewhere/rules
git switch -c rules/add-canary-source
git add packages/rules/sources.yaml packages/rules/ota-overrides.yaml && git commit -F - <<'EOF'
Add the acceptance-test canary source (temporary)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
git push -u origin HEAD
gh pr create --base main --fill   # merge once Rules CI is green
git switch main && git pull
gh workflow run sources-track.yml --repo ifaemuh/elsewhere
```

After the tracker run, open the second PR with the rule and its data-case file:

```bash
git switch -c rules/add-canary-rule
git add packages/rules/data packages/rules/test/data-cases && git commit -m "Add the acceptance-test canary rule (temporary)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
git push -u origin HEAD
gh pr create --base main --fill   # merge once Rules CI is green
```

Expected: after the run, `gh api "repos/ifaemuh/elsewhere-sources-versions/contents/Elsewhere%20Canary"` lists `Official Guidance.md`. "Rules CI" on `main` passes, so the quote is found.

- [ ] **Step 3: Path A — change the sentence and wait for the Dot**

```bash
cd "${TMPDIR:-/tmp}/elsewhere-canary"
sed -i.bak 's/within 7 business days/within 20 business days/' index.html && rm index.html.bak
git commit -am "Canary: change refund timing" && git push
```

After Pages updates, run `gh workflow run sources-track.yml --repo ifaemuh/elsewhere`. Then wait up to 24 hours for the Dot. Pass when a PR `rules/refresh-canary-page-<date>`:

| Check | Expected |
|---|---|
| Classification in the body | substantive |
| `version` | 2 |
| `status` | `needs_review` |
| `history` | one appended entry `{ version: 2, status: needs_review, date: <today>, note: … }`; earlier entries untouched |
| Quote and `entitlement.timing` | say 20 business days |
| `last_verified`, `verified_by`, `review_by` | unchanged |
| "Rules CI" | green |

Record the PR URL in the PR's closing comment, then close it without merging: `gh pr close <number> --comment "Acceptance test path A passed." --delete-branch`.

If no PR arrives in 24 hours, ask the founder to open the Dot's activity view. Fix `goal.md` (commit and push), have the founder paste the new goal, and repeat this step.

- [ ] **Step 4: FOUNDER ACTION — pause the Dot**

Ask the founder to pause Rules Keeper in ChatGPT and confirm.

- [ ] **Step 5: Path B — the backstop alone**

```bash
cd "${TMPDIR:-/tmp}/elsewhere-canary"
sed -i.bak 's/within 20 business days/within 30 business days/' index.html && rm index.html.bak
git commit -am "Canary: change again with the Dot paused" && git push
```

After Pages updates, run:

```bash
gh workflow run sources-track.yml --repo ifaemuh/elsewhere   # wait for success
gh workflow run rules-backstop.yml --repo ifaemuh/elsewhere
```

Pass when a PR `rules/backstop-<date>` labelled `rules-backstop` meets all of these:
- It changes only `canary-acceptance-test.yaml`.
- It sets `status: needs_review`.
- It appends `{ version: 1, status: needs_review, date: <today>, note: quote not found in canary-page }`.

Close it: `gh pr close <number> --comment "Acceptance test path B passed." --delete-branch`.

- [ ] **Step 6: FOUNDER ACTION — resume the Dot**

Ask the founder to resume Rules Keeper and confirm.

- [ ] **Step 7: FOUNDER CONFIRMATION — remove the canary**

Delete `packages/rules/data/flights/canary-acceptance-test.yaml` and `packages/rules/test/data-cases/canary-acceptance-test.yaml`, plus the `canary-page` blocks you appended to `sources.yaml` and `ota-overrides.yaml`. Then:

```bash
npm test -w @elsewhere/rules
git switch -c rules/remove-canary
git add -A packages/rules && git commit -F - <<'EOF'
Remove the acceptance-test canary

Path A (Dot PR) and path B (nightly backstop with the Dot paused) both
passed; see the closed refresh and backstop PRs.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
git push -u origin HEAD
gh pr create --base main --fill   # merge once Rules CI is green
git switch main && git pull
gh workflow run sources-track.yml --repo ifaemuh/elsewhere
```

The next tracker run prunes `Elsewhere Canary.json` from the declarations repo. Keep `ifaemuh/elsewhere-canary` for re-running this test after any change to `goal.md`, and tell the founder it can be deleted whenever they want.

---

## Part 4 — The first 10 rules

### Task 18: Two facts the first rules need

> **Controller note (2026-10-02), contract 30b549f:** `flight.scheduled_duration_minutes` was replaced by the itinerary facts `trip.itinerary_domestic_us` and `trip.us_foreign_nonstop_minutes`, because 14 CFR 260.2 sets its thresholds per itinerary. Where this task says `flight.scheduled_duration_minutes` or uses `flight.is_domestic_us` for a Part 260 threshold, use the itinerary facts instead.

Part 250 (bumping) covers flights departing the US, and `flight.touches_us` can't express that. Part 260's "significantly delayed bag" thresholds depend on how long the flight is scheduled to take. Per the contract, the interface change lands first, in its own commit.

**Files:**
- Modify: `docs/superpowers/plans/2026-10-01-rules-package-interface.md`, `packages/rules/src/facts.ts`, `packages/rules/test/facts.test.ts`

**Interfaces:**
- Produces two new public facts: `flight.departs_us` (boolean, "The flight departs from a US airport.") and `flight.scheduled_duration_minutes` (number, "Scheduled gate-to-gate time of the flight, in minutes."). Tracks C and D read `FACTS` at runtime, so both pick up the new facts. Track C's situation builder should fill them from booking segments.

- [ ] **Step 1: Amend the contract**

In `docs/superpowers/plans/2026-10-01-rules-package-interface.md`, inside `export const FACTS: {`, add these two lines after the `'flight.single_ticket'` line:

```ts
  'flight.departs_us': FactDef;          // boolean
  'flight.scheduled_duration_minutes': FactDef; // number
```

```bash
git add docs/superpowers/plans/2026-10-01-rules-package-interface.md
git commit -F - <<'EOF'
Contract: add flight.departs_us and flight.scheduled_duration_minutes

Part 250 bumping covers flights departing the US, and Part 260's
delayed-bag thresholds depend on scheduled flight length; neither fits
the existing facts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

- [ ] **Step 2: Write the failing test**

Append to `packages/rules/test/facts.test.ts`:

```ts

test('the departure and duration facts exist', () => {
  validateSituation({ 'flight.departs_us': true, 'flight.scheduled_duration_minutes': 780 });
  assert.throws(() => validateSituation({ 'flight.scheduled_duration_minutes': '13h' }), /expects a number/);
});
```

Run: `cd packages/rules && node --import tsx --test test/facts.test.ts`
Expected: FAIL with `Unknown fact "flight.departs_us"`.

- [ ] **Step 3: Add the facts**

In `packages/rules/src/facts.ts`, inside `FACTS`, add after the `'flight.single_ticket'` entry:

```ts
  'flight.departs_us': { type: 'boolean', description: 'The flight departs from a US airport.' },
  'flight.scheduled_duration_minutes': {
    type: 'number',
    description: 'Scheduled gate-to-gate time of the flight, in minutes.',
  },
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd packages/rules && node --import tsx --test "test/**/*.test.ts" && npx tsc --noEmit`
Expected: `ℹ pass 87`, `ℹ fail 0`, clean tsc.

- [ ] **Step 5: Commit**

```bash
git add packages/rules/src/facts.ts packages/rules/test/facts.test.ts
git commit -F - <<'EOF'
Add the departs-US and scheduled-duration facts

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

### How to execute Tasks 19–21

Each task is one research PR that follows `packages/rules/RESEARCH.md` from step 1 to step 7. The rule content (quotes, exact amounts, thresholds) comes from the tracked source text at execution time. This plan fixes everything else: ids, sources, the facts each rule may use, entitlement kinds, characters, and the cases that must exist.

The same acceptance checks apply to every rule:

| # | Check |
|---|---|
| A1 | `npm test -w @elsewhere/rules` passes, including the rule's `test/data-cases/<id>.yaml` (≥ 1 `applies`, ≥ 1 `may_apply`, ≥ 1 `does_not_apply`, with cases on both sides of every threshold) |
| A2 | `npm run rules:build -w @elsewhere/rules` passes |
| A3 | `npm run rules:check-quotes -w @elsewhere/rules -- --versions /tmp/sources-versions` reports `All quotes found` |
| A4 | Every number in `entitlement` and every threshold in `applies_when` appears in a quote that `supports` it |
| A5 | "Rules CI" is green on the PR |
| A6 | After the founder merges, `rules:verify` has run on `main`, and the rule's last history entry is `verified` |

Before writing the first rule of each task, check the Federal Register for pending changes to that task's CFR parts. DOT published "Airline Refunds and Other Consumer Protections" and "One-Page Document on Passenger Rights" in 2026. Mention anything pending in the PR's "Unsure about" line.

### Task 19: Rules 1–4, the 14 CFR Part 260 refund family

> **Controller note (2026-10-02), contract 30b549f:** `flight.scheduled_duration_minutes` was replaced by the itinerary facts `trip.itinerary_domestic_us` and `trip.us_foreign_nonstop_minutes`, because 14 CFR 260.2 sets its thresholds per itinerary. Where this task says `flight.scheduled_duration_minutes` or uses `flight.is_domestic_us` for a Part 260 threshold, use the itinerary facts instead.

**Files:**
- Create: `packages/rules/data/flights/{us-dot-refund-cancelled-flight,us-dot-refund-significant-change,us-dot-bag-fee-refund-delayed-bag,us-dot-refund-service-not-provided}.yaml` and the matching `packages/rules/test/data-cases/<id>.yaml`

**Interfaces:**
- Consumes: source `ecfr-14-cfr-260` (`eCFR/title-14-part-260.md`). `dot-refunds` is optional, as supporting guidance.
- Produces: four verified rules with jurisdiction `US-DOT`, domain `flights`, lead character `pigeon`, and template `airline_refund_request`.

| Rule id | Where the text is | `applies_when` uses | Entitlement |
|---|---|---|---|
| `us-dot-refund-cancelled-flight` | § 260.6 (refund on cancellation), § 260.2 (definitions), § 260.3 (applicability; confirm whether `flight.touches_us` captures it), § 260.10 (prompt-refund timing) | `event.type in [cancellation]`, `flight.touches_us`, `passenger.accepted_alternative eq false` | `refund`, with amount basis and timing as § 260.6 and § 260.10 state them |
| `us-dot-refund-significant-change` | § 260.2 "significant change of flight itinerary" (time-based triggers only; list the other triggers as backlog items in the PR), § 260.6 | `event.type in [delay, schedule_change]`, `flight.touches_us`, `passenger.accepted_alternative eq false`, and an `any` of `{flight.is_domestic_us eq true, event.delay_minutes gte <domestic hours × 60>}` / `{flight.is_domestic_us eq false, event.delay_minutes gte <international hours × 60>}` using the hours § 260.2 states | `refund` |
| `us-dot-bag-fee-refund-delayed-bag` | § 260.5, § 260.2 "significantly delayed checked bag" | `any` of `{event.type in [bag_lost]}` and `{event.type in [bag_delayed]}` together with the domestic and international `event.delay_minutes` thresholds from § 260.2. The international threshold splits on `flight.scheduled_duration_minutes` at the flight length § 260.2 names. Plus `flight.touches_us` | `refund` of the bag fee. If § 260.5 requires a mishandled-baggage report, put it in `how_to_claim.steps` and `exceptions` |
| `us-dot-refund-service-not-provided` | § 260.4 | `event.type in [service_not_provided]`, `flight.touches_us` | `refund` of the ancillary fee |

Required data cases beyond the minimum:
- **`us-dot-refund-significant-change`:** the domestic threshold minus 1 minute and exactly at the threshold, the same pair for international, and `flight.is_domestic_us` absent, which gives `may_apply`.
- **`us-dot-bag-fee-refund-delayed-bag`:** each threshold minus 1 minute and exactly at it, plus the long-flight branch.

- [ ] **Step 1:** Clone or pull `elsewhere-sources-versions` to `/tmp/sources-versions` (RESEARCH.md step 2), and read `eCFR/title-14-part-260.md` §§ 260.2–260.6 and 260.10 in full.
- [ ] **Step 2:** Draft the four rule files and four case files (RESEARCH.md steps 3–4). Each rule gets `history: [{ version: 1, status: draft, date: <today> }]`.
- [ ] **Step 3:** Run checks A1–A4 locally. Fix until all pass.
- [ ] **Step 4:** Commit on branch `rules/add-us-dot-refunds`:

```bash
git switch -c rules/add-us-dot-refunds
git add packages/rules/data/flights packages/rules/test/data-cases
git commit -F - <<'EOF'
Rules: add the 14 CFR Part 260 refund family (drafts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

- [ ] **Step 5: FOUNDER CONFIRMATION.** Push and open the PR, using the body template from RESEARCH.md step 6:

```bash
git push -u origin rules/add-us-dot-refunds
gh pr create --base main --title "Rules: add us-dot-refund-cancelled-flight, us-dot-refund-significant-change, us-dot-bag-fee-refund-delayed-bag, us-dot-refund-service-not-provided" --body-file pr-body.md
```

Write `pr-body.md` from the template first, and delete it after the PR is open.

- [ ] **Step 6:** Wait for check A5. The founder reviews and merges.
- [ ] **Step 7: FOUNDER CONFIRMATION.** Verify on a branch cut from `main` and open a PR (main is protected):

```bash
git switch main && git pull && git switch -c rules/verify-$(date +%F)
npm run rules:verify -w @elsewhere/rules -- us-dot-refund-cancelled-flight us-dot-refund-significant-change us-dot-bag-fee-refund-delayed-bag us-dot-refund-service-not-provided --by ifaemuh
npm test -w @elsewhere/rules
git commit -am "Verify rules: us-dot-refund-cancelled-flight, us-dot-refund-significant-change, us-dot-bag-fee-refund-delayed-bag, us-dot-refund-service-not-provided" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
git push -u origin HEAD
gh pr create --base main --fill   # main is protected: merge once Rules CI is green
```

Check A6 passes when each file's last history entry is `{ version: 1, status: verified, date: <today> }`.

### Task 20: Rules 5–7, the 24-hour rule, bumping, and tarmac delays

**Files:**
- Create: `packages/rules/data/flights/{us-dot-24-hour-cancellation,us-dot-bumping-compensation,us-dot-tarmac-delay-limits}.yaml` and the matching data-case files

**Interfaces:**
- Consumes: sources `ecfr-14-cfr-259` and `ecfr-14-cfr-250`, and the Task 18 facts.
- Produces: three verified `US-DOT` rules in domain `flights`.

| Rule id | Character | Where the text is | `applies_when` uses | Entitlement |
|---|---|---|---|---|
| `us-dot-24-hour-cancellation` | `owl` | § 259.5, the 24-hour hold or cancel commitment. § 259.5 was amended 2026-07-02, so read the current paragraph and don't rely on the old (b)(4) numbering | `trip.hours_since_booking lte 24`, `trip.days_until_departure gte <the days § 259.5 states>`, `trip.booked_via eq direct`, `flight.touches_us` | `refund`. If the regulation lets carriers choose between holding and cancelling, say so in `summary`, and quote it |
| `us-dot-bumping-compensation` | `raccoon` | § 250.2 (applicability), § 250.5 (amounts, amended 2025-01-22), § 250.6 (exceptions) | `event.type in [denied_boarding]`, `flight.departs_us eq true`, and the arrival-delay tiers from § 250.5 split by `flight.is_domestic_us` | `compensation`. `amount` holds each tier's percentage of the one-way fare and its dollar cap, word for word. Template `denied_boarding_claim` |
| `us-dot-tarmac-delay-limits` | `raccoon` | § 259.4 | `event.type in [tarmac_delay]`, `flight.touches_us`, `event.delay_minutes` at the food-and-water threshold. The deplaning thresholds (domestic and international) go in `summary` and `how_to_claim.steps`, quoted | `care` |

Required data cases beyond the minimum:
- **Bumping:** each tier boundary minus 1 minute and exactly at it, domestic and international, plus `flight.departs_us` absent (`may_apply`) and `false` (`does_not_apply`).
- **24-hour rule:** 24 and 25 hours since booking, and the departure threshold minus 1 and exactly at it.

- [ ] **Step 1:** Pull `/tmp/sources-versions`. Read `eCFR/title-14-part-259.md` §§ 259.2–259.5 and `eCFR/title-14-part-250.md` §§ 250.1, 250.2, 250.5, 250.6, and 250.9 in full.
- [ ] **Step 2:** Draft the three rules and case files (RESEARCH.md steps 3–4).
- [ ] **Step 3:** Run checks A1–A4 locally.
- [ ] **Step 4:** Commit on branch `rules/add-us-dot-259-250`:

```bash
git switch main && git pull && git switch -c rules/add-us-dot-259-250
git add packages/rules/data/flights packages/rules/test/data-cases
git commit -F - <<'EOF'
Rules: add the 24-hour, bumping and tarmac-delay rules (drafts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

- [ ] **Step 5: FOUNDER CONFIRMATION.** Push and open the PR:

```bash
git push -u origin rules/add-us-dot-259-250
gh pr create --base main --title "Rules: add us-dot-24-hour-cancellation, us-dot-bumping-compensation, us-dot-tarmac-delay-limits" --body-file pr-body.md
```

- [ ] **Step 6:** Wait for check A5. The founder reviews and merges.
- [ ] **Step 7: FOUNDER CONFIRMATION.** Verify on a branch cut from `main` and open a PR (main is protected):

```bash
git switch main && git pull && git switch -c rules/verify-$(date +%F)
npm run rules:verify -w @elsewhere/rules -- us-dot-24-hour-cancellation us-dot-bumping-compensation us-dot-tarmac-delay-limits --by ifaemuh
npm test -w @elsewhere/rules
git commit -am "Verify rules: us-dot-24-hour-cancellation, us-dot-bumping-compensation, us-dot-tarmac-delay-limits" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
git push -u origin HEAD
gh pr create --base main --fill   # main is protected: merge once Rules CI is green
```

### Task 21: Rules 8–10, EU261

**Files:**
- Create: `packages/rules/data/flights/{eu261-delay-compensation,eu261-cancellation-compensation,eu261-right-to-care}.yaml` and the matching data-case files

**Interfaces:**
- Consumes: sources `eurlex-261-2004` (the regulation: Articles 3, 5, 6, 7, 9) and `youreurope-air-passenger-rights` (the Commission's guidance, which states the three-hour delay compensation).
- Produces: three verified rules with jurisdiction `EU-261` and domain `flights`, using templates `eu261_claim_letter` (compensation) and `airline_care_request` (care).

Scope in every rule:

```yaml
- any:
    - fact: flight.departs_eu
      eq: true
    - all:
        - fact: flight.arrives_eu
          eq: true
        - fact: flight.carrier_is_eu
          eq: true
```

Confirm this against Article 3 and Your Europe's "EU air passenger rights apply" list, and quote both.

| Rule id | Character | Additional `applies_when` | Entitlement |
|---|---|---|---|
| `eu261-delay-compensation` | `pigeon` | `event.type in [delay]`, `event.delay_minutes gte 180` (quote Your Europe's "3 hours or more"), and `event.cause in [controllable, unknown]` | `compensation`. `amount` holds the three distance bands and amounts from Article 7, word for word. The extraordinary-circumstances exception goes in `exceptions` |
| `eu261-cancellation-compensation` | `pigeon` | `event.type in [cancellation]`, `event.notice_days lt 14`, `event.cause in [controllable, unknown]` | `compensation`, with the same bands. Article 5's rerouting exceptions go in `exceptions`, quoted |
| `eu261-right-to-care` | `capybara` | an `any` of `{event.type in [cancellation]}` and `{event.type in [delay]}` with Article 6's distance-and-delay thresholds, built from `flight.distance_km` and `event.delay_minutes`. The intra-EU-over-1500 km band applies when `flight.departs_eu` and `flight.arrives_eu` are both true. No `event.cause` condition, because care is owed regardless of cause | `care`. Article 9's list goes in `summary` and `how_to_claim.steps`, quoted |

Required data cases beyond the minimum:
- **Paris outbound** (DL, JFK to CDG): `does_not_apply` for all three rules.
- **Paris return** (CDG to JFK): `applies`.
- **Cause:** `uncontrollable` gives `does_not_apply` for the two compensation rules and still `applies` for care. Cause absent gives `may_apply` for the compensation rules.
- **Thresholds:** 179 and 180 minutes, notice of 13 and 14 days, and each Article 6 band boundary.

- [ ] **Step 1:** Pull `/tmp/sources-versions`. Read `EUR-Lex Regulation 261-2004/Official Guidance.md` Articles 3, 5, 6, 7, and 9, and `EU Your Europe Air Passenger Rights/Official Guidance.md` in full.
- [ ] **Step 2:** Draft the three rules and case files (RESEARCH.md steps 3–4).
- [ ] **Step 3:** Run checks A1–A4 locally.
- [ ] **Step 4:** Commit on branch `rules/add-eu261`:

```bash
git switch main && git pull && git switch -c rules/add-eu261
git add packages/rules/data/flights packages/rules/test/data-cases
git commit -F - <<'EOF'
Rules: add EU261 delay, cancellation and care (drafts)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
EOF
```

- [ ] **Step 5: FOUNDER CONFIRMATION.** Push and open the PR:

```bash
git push -u origin rules/add-eu261
gh pr create --base main --title "Rules: add eu261-delay-compensation, eu261-cancellation-compensation, eu261-right-to-care" --body-file pr-body.md
```

- [ ] **Step 6:** Wait for check A5. The founder reviews and merges.
- [ ] **Step 7: FOUNDER CONFIRMATION.** Verify on a branch cut from `main` and open a PR (main is protected):

```bash
git switch main && git pull && git switch -c rules/verify-$(date +%F)
npm run rules:verify -w @elsewhere/rules -- eu261-delay-compensation eu261-cancellation-compensation eu261-right-to-care --by ifaemuh
npm test -w @elsewhere/rules
git commit -am "Verify rules: eu261-delay-compensation, eu261-cancellation-compensation, eu261-right-to-care" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
git push -u origin HEAD
gh pr create --base main --fill   # main is protected: merge once Rules CI is green
```

Track A's first deliverable is done when `npm run rules:build -w @elsewhere/rules` prints `Built 10 rules`, and every rule shows `status: verified`.

Rules 11–30 follow the same three-step pattern: a contract amendment if a new fact is needed, a research PR, and a verify commit. Use the backlog order in the spec. Rule 6 (airline commitments) and rule 12 (missed connections) cite the airline contracts and plans that Task 10 confirmed are trackable.

---

## Self-review

**Spec coverage** (spec section → task):

| Spec section | Where |
|---|---|
| Package layout, schema, facts, matcher, loader, `rules:build`, `dist/rules.json` envelope, golden fixtures | Tasks 1–7 |
| `sources.yaml` and the initial source set | Task 8. Card guides and the other airlines' plans are added with their first rule (noted in Task 8) |
| Rule file format, including the contract's history and `replaced_by` additions | Tasks 2, 4, 6 |
| Research workflow (draft, check, approve) | Task 15, used by Tasks 17 and 19–21 |
| Detection: OTA collection repos, generator, daily Action, the "first implementation step" decision, eCFR | Tasks 9–12 |
| Interpretation: the Dot (connectors, goal in repo, Custom Rules, Federal Register watch) | Task 16 |
| Planted-change acceptance test | Task 17 |
| Nightly backstop | Task 13 |
| Staleness | Task 14 |
| Status contract for consumers | Enforced by `matchRules` defaults (Task 3). The consumer-side rules are tracks B, C, and D |
| Error handling | Source unreachable: OTA's GitHub reporter (Task 12). Restructured source: Task 10, plus the backstop flipping rules. Bad Dot output: CI gate and activity view (Tasks 13, 16). Conflicting sources: separate rules per jurisdiction (RESEARCH.md) |
| Testing | Every list item in the spec maps to a test file in Tasks 1–7, 9, 11, 14, and 15, plus the end-to-end Task 17 |
| Deliverable 4 (first 10 rules within the first week) | Tasks 19–21 |
| Rules 11–30 | Follow the same pattern, outside this plan's scope |

**Deviations from the spec, stated:**
- **OTA opens its failure issue on the first failed fetch, not after three days.** The spec asked for three days running. This uses the engine's built-in reporter instead of custom code, and the issue closes itself when the fetch recovers.
- **A source restructure is caught by the backstop, not a dedicated rule.** The spec's "restructured source → needs_review" is enforced indirectly: once a filter extracts nothing, the quotes vanish and the nightly backstop flips the rule. Task 10 Step 4 tunes filters up front.

**Placeholder scan:**
- No TBD or TODO markers.
- **The `<today>` and `<date>` tokens are execution-time values.** They appear in commands and checklists, each with the exact way to fill it in.
- **Rule content is specified as a procedure.** Tasks 19–21 give the procedure plus fixed ids, sources, facts, characters, and cases, because quotes must come from the tracked text.

**Type consistency.** Names match the contract (commit `8a0da4a`): `matchRule`, `matchRules`, `MatchResult.rule_id/rule_version/outcome/missing_facts`, `loadRules`, `loadSources`, `RulesValidationError.issues`, `buildLibrary({ rules, sources, now })`, `changesFromHistory`, `RulesLibrary.sources`, `RuleHistoryEntry`, `normalizeText`, `sourceTextPath`, `checkQuotes`, `checkSupports`, and `QuoteIssue.reason`. Internal names (`loadRuleFiles`, `appendHistory`, `addDays`, `markVerified`, `buildDeclarations`, `fetchEcfrPart`) are defined once and used with the same signatures.
