# Track D — Rules API and MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the verified rules library as a public read API and a read-only MCP server inside the Elsewhere web app, so AI agents and partners answer from cited rules and link back to the rule pages that carry the paid offer.

**Architecture:** Route handlers in the merged Next.js 16.3 app (`apps/web`) import `@elsewhere/rules` and the built `packages/rules/dist/rules.json`. Small pure modules under `apps/web/lib/rules-api/` (projection, envelope, search, matching, changes, auth, rate limits, analytics) back both surfaces. The MCP server (`mcp-handler` 2.2 on MCP SDK v2) registers five read-only tools over the same modules, so the API, MCP, and Assist share one `matchRules()`.

**Tech Stack:** Next.js 16.3, TypeScript 5.5+, zod 4.6, `@elsewhere/rules`, `mcp-handler` 2.2.0, `@modelcontextprotocol/server` 2.2.0, `@modelcontextprotocol/client` 2.2.0 (tests), `@vercel/firewall` 1.2.5, Supabase (`@supabase/supabase-js` 2.x), Vitest 5.0.3, yaml 2.9.

**Spec:** [`specs/2026-10-01-rules-api-mcp-design.md`](../specs/2026-10-01-rules-api-mcp-design.md). **Interface contract:** [`2026-10-01-rules-package-interface.md`](2026-10-01-rules-package-interface.md).

**Depends on (do not start before both are true):**
1. **Track A** has implemented `@elsewhere/rules` per the interface contract, including `packages/rules/test/fixtures/match/*.yaml`, `packages/rules/test/fixtures/rules/*.yaml`, and the `rules:build` script.
2. **Track C1's restructure task** has merged `apps/web` + `apps/api` into one Next.js 16.3 app at `apps/web`, with `apps/web/lib/supabase/admin.ts` exporting `createAdminClient()` (moved unchanged from `apps/api/lib/supabase/admin.ts`, per the track C spec's "Reused" row).

Tasks 13–15 additionally need the production domain, a deployed production build, and the first 10 verified rules (Task 15 needs all 30).

## Global Constraints

- Node **24 LTS** for all `apps/web` work. Vitest 5.0.3 declares `engines.node: ^22.12.0 || ^24.0.0 || >=26.0.0`; the founder's Mac runs Node 25.4, which is outside that range. Run `nvm use 24` (or `fnm use 24`) before any step.
- Versions: `next@^16.3.8`, `zod@^4.6.5`, `mcp-handler@^2.2.0`, `@modelcontextprotocol/server@^2.2.0`, `@modelcontextprotocol/client@^2.2.0` (dev), `@vercel/firewall@^1.2.5`, `vitest@^5.0.3` (dev), `yaml@^2.9.1` (dev).
- Rule objects keep the contract's **snake_case** keys everywhere. No camelCase transform.
- **Drafts are never returned** on any surface: not in `rules.json`, search, get, match, changes, or any MCP tool. A draft ID and an unknown ID return the identical 404 shape.
- Every API envelope is `{ schema_version, library_version, data, attribution }` with attribution text exactly `Rules verified by Elsewhere from primary sources. Not legal advice.` and `required: true`.
- `ETag` is `"<library_version>"` (quoted). Anonymous cacheable reads send `Cache-Control: public, s-maxage=3600, stale-while-revalidate=86400` and `Vary: Authorization`. `POST /api/rules/match` sends `Cache-Control: no-store`.
- Every `page_url` is `<NEXT_PUBLIC_APP_URL>/rules/<id>?utm_source=<api|mcp>&utm_medium=<client or partner>&utm_campaign=rules`.
- Anonymous limits: **60 API requests/min** and **30 MCP requests/min** per IP, enforced by Vercel Firewall rules with IDs `rules-api-anon` and `rules-mcp-anon`. Partners use the rule named in their `api_keys.rate_limit_rule` row (default `rules-partner`), keyed by key ID.
- IP addresses are never stored. Search queries are stored truncated to 200 characters with emails and 10+-digit phone numbers replaced by `[redacted]`. Only known fact **names** (never values, except `event.type`) are stored.
- Every MCP tool has `annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }` and a `title`.
- Route files under `app/` export only `GET`/`POST`. Shared handlers live in `lib/` (Next 16 rejects unknown route exports).
- Outward-facing steps — Supabase production migration, Vercel Firewall rules, ChatGPT/Claude connections, MCP registry publish, directory submissions — need the founder's explicit go-ahead at execution time, even though this plan was approved.
- Every commit message ends with these two lines:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc
  ```

---

## File Structure

```
packages/rules/                                  (owned by Track A; Track D adds one test)
  test/track-d-preconditions.test.ts            precondition test (Task 1)

apps/web/
  vitest.config.ts                               test runner config (create if C1 didn't)
  test/setup.ts                                  global mocks: library, next/server.after, firewall, supabase
  test/helpers/library-holder.ts                 test-controlled getLibrary()
  test/helpers/supabase-fake.ts                  in-memory api_keys / rules_api_events
  test/helpers/fixture-library.ts                makeRule, makeLibrary, standard rules, golden cases
  lib/rules/parse-library.ts                     parseLibrary(raw) + LibraryLoadError (pure)
  lib/rules/library.ts                           getLibrary(): loads dist/rules.json once
  lib/rules-api/types.ts                         PublicRule, RuleSummary, ApiCaller, ATTRIBUTION, …
  lib/rules-api/links.ts                         appOrigin, sanitizeMedium, rulePageUrl
  lib/rules-api/projection.ts                    isPublic, toPublicRule, toRuleSummary
  lib/rules-api/envelope.ts                      envelope, etagFor, jsonOk (ETag/304), jsonError
  lib/rules-api/auth.ts                          bearerToken, hashKey, generateKey, lookupKey, resolveCaller
  lib/rules-api/rate-limit.ts                    enforceRateLimit via @vercel/firewall
  lib/rules-api/analytics.ts                     sanitizeQuery, scheduleEvent (after → Supabase)
  lib/rules-api/handle.ts                        withRulesApi: auth → limit → library → run → analytics
  lib/rules-api/facts-vocabulary.ts              factsVocabulary()
  lib/rules-api/search.ts                        tokenize, searchRules, parseSearchParams
  lib/rules-api/changes.ts                       publicChangesSince, isIsoDate, defaultSince
  lib/rules-api/situation.ts                     parseSituation (facts validation)
  lib/rules-api/match-situation.ts               matchSituation → MatchResponse
  lib/rules-api/report.ts                        aggregateReport (weekly markdown)
  lib/mcp/instructions.ts                        SERVER_INFO, SERVER_INSTRUCTIONS
  lib/mcp/client-info.ts                         requestContext, clientFromContext, callerFromContext
  lib/mcp/text.ts                                DISCLAIMER + text blocks per tool
  lib/mcp/tools.ts                               registerRuleTools(server)
  lib/mcp/route-handler.ts                       handleMcp(req)
  app/api/rules.json/route.ts                    GET full artifact
  app/api/rules/route.ts                         GET search
  app/api/rules/[id]/route.ts                    GET one rule
  app/api/rules/match/route.ts                   POST match
  app/api/rules/changes/route.ts                 GET changes
  app/api/rules/facts/route.ts                   GET facts vocabulary
  app/api/mcp/route.ts                           GET/POST MCP
  app/(public)/rules/terms/page.tsx              terms of use
  scripts/create-partner-key.ts                  mint a partner key (prints once)
  scripts/rules-api-report.ts                    weekly report (IO wrapper)
  mcp/server.json                                MCP registry listing
  public/.well-known/openai-apps-challenge       ChatGPT directory domain check (Task 15)
  test/rules-api/*.test.ts, test/mcp/*.test.ts   Vitest suites

supabase/migrations/00020_rules_api.sql          api_keys + rules_api_events
.github/workflows/rules-api-report.yml           weekly report → GitHub issue
docs/superpowers/acceptance/track-d.md           acceptance + distribution log
```

The migration is numbered `00020` so it never collides with track C's `00012`+ series; Supabase applies migrations in name order and these tables depend on nothing else.

---

### Task 1: Precondition: the library carries `sources`, `replaced_by`, and `history`

The interface contract already includes these (commit `8a0da4a`), and Track A implements
them: `RulesLibrary.sources` (every source any rule cites, excluded from the
`library_version` hash), optional `Rule.replaced_by` (retired rules only), and
`Rule.history`, from which `changesFromHistory` derives `changes`. This task only proves
they exist before Track D builds on them. If any check fails, stop and finish Track A
first. Track D does not change the package.

**Files:**
- Test: `packages/rules/test/track-d-preconditions.test.ts`

**Interfaces:**
- Consumes: `buildLibrary({ rules, sources, now? })`, `RulesLibrary.sources`, `Rule.replaced_by`, `Rule.history`, `changesFromHistory(rules)` from `@elsewhere/rules`
- Produces: nothing new

- [ ] **Step 1: Write the precondition test**

```ts
// packages/rules/test/track-d-preconditions.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLibrary, changesFromHistory, type Rule, type Source } from '../src/index.ts';

const source: Source = {
  key: 'test-source',
  url: 'https://example.gov/rule',
  kind: 'regulation',
  detector: { changedetection: { watch_uuid: '00000000-0000-0000-0000-000000000000' } },
};

const base: Rule = {
  id: 'test-old-rule',
  version: 2,
  status: 'retired',
  domain: 'flights',
  jurisdiction: 'US-DOT',
  title: 'Old rule',
  summary: 'A refund is owed.',
  applies_when: { all: [{ fact: 'event.type', in: ['cancellation'] }] },
  entitlement: { kind: 'refund' },
  how_to_claim: { steps: ['Ask.'], templates: [] },
  exceptions: [],
  sources: [{ id: 's1', source: 'test-source', quotes: [{ text: 'a refund is owed', supports: ['summary', 'entitlement'] }] }],
  lead_character: 'pigeon',
  tags: [],
  last_verified: '2026-10-06',
  verified_by: 'ifaemuh',
  review_by: '2027-01-04',
  replaced_by: 'test-new-rule',
  history: [
    { version: 1, status: 'verified', date: '2026-10-06' },
    { version: 2, status: 'retired', date: '2026-11-01', note: 'superseded' },
  ],
};

test('library carries cited sources, and changes come from history', () => {
  const lib = buildLibrary({ rules: [base], sources: { 'test-source': source }, now: new Date('2026-11-02T00:00:00Z') });
  assert.deepEqual(Object.keys(lib.sources), ['test-source']);
  assert.equal(lib.rules[0].replaced_by, 'test-new-rule');
  assert.deepEqual(changesFromHistory([base]).map((c) => [c.from_version, c.to_version, c.to_status]), [
    [1, 2, 'retired'],
    [null, 1, 'verified'],
  ]);
});
```

- [ ] **Step 2: Run it**

Run: `npm test -w @elsewhere/rules -- --test-name-pattern="library carries cited sources"`
Expected: PASS. If it fails, Track A is incomplete. Stop and finish Track A's tasks for
`buildLibrary`, `changesFromHistory`, and the `history`/`replaced_by` schema fields.

- [ ] **Step 3: Commit**

```bash
git add packages/rules/test/track-d-preconditions.test.ts
git commit -m "test(rules): pin the library fields Track D depends on

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

### Task 2: Web app test harness and library loader

**Files:**
- Modify: `apps/web/package.json`
- Create (if absent): `apps/web/vitest.config.ts`
- Create: `apps/web/test/setup.ts`, `apps/web/test/helpers/library-holder.ts`, `apps/web/test/helpers/supabase-fake.ts`, `apps/web/test/helpers/fixture-library.ts`
- Create: `apps/web/lib/rules/parse-library.ts`, `apps/web/lib/rules/library.ts` (see Step 1)
- Test: `apps/web/test/rules-api/parse-library.test.ts`

**Interfaces:**
- Consumes: `RulesLibrary`, `RuleSchema`, `buildLibrary`, `Rule`, `RuleChange`, `Source`, `Situation`, `MatchOutcome` from `@elsewhere/rules`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `getLibrary(): RulesLibrary` and `class LibraryLoadError` from `@/lib/rules/library`; `parseLibrary(raw: unknown): RulesLibrary` from `@/lib/rules/parse-library`; test helpers `setLibrary`, `fakeDb`, `makeRule`, `makeLibrary`, `standardRules`, `standardChanges`, `standardLibrary`, `goldenCases`, `fixtureRule`.

- [ ] **Step 1: Check what C1 already created**

Run:
```bash
ls apps/web/vitest.config.ts apps/web/lib/rules/library.ts apps/web/lib/supabase/admin.ts 2>&1
grep -n '"test"\|"prebuild"\|"pretypecheck"' apps/web/package.json
grep -n "turbopack\|outputFileTracingRoot" apps/web/next.config.ts
```
- `apps/web/lib/supabase/admin.ts` must exist and export `createAdminClient`. If it doesn't, stop: Track C1's restructure isn't done.
- If `apps/web/lib/rules/library.ts` exists, keep its existing exports for C1's callers. Make sure it also exports exactly `getLibrary(): RulesLibrary` and `LibraryLoadError` (add thin wrappers if C1 named them differently), and have it use `parseLibrary` from Step 4. Then skip the library.ts part of Step 4.
- If `vitest.config.ts` exists, make sure it contains the `@/` alias, `setupFiles: ['./test/setup.ts']`, and `clearMocks: true` from Step 2, merging rather than replacing.
- `next.config.ts` must set `turbopack.root` (or `outputFileTracingRoot`) to the monorepo root so `apps/web` can import `packages/rules/dist/rules.json`. If C1 didn't, add `turbopack: { root: path.join(__dirname, '../..') }`.

- [ ] **Step 2: Install dependencies and add scripts**

Run:
```bash
npm i -w @elsewhere/web zod@^4.6.5 mcp-handler@^2.2.0 @modelcontextprotocol/server@^2.2.0 @vercel/firewall@^1.2.5
npm i -w @elsewhere/web -D vitest@^5.0.3 @modelcontextprotocol/client@^2.2.0 yaml@^2.9.1
```

In `apps/web/package.json` `scripts`, ensure these exist (keep any C1 entries; add the `npm run rules:build` call to C1's existing `prebuild`/`pretypecheck` if they exist):
```json
"test": "vitest run",
"prebuild": "npm run rules:build -w @elsewhere/rules",
"pretypecheck": "npm run rules:build -w @elsewhere/rules"
```

Create `apps/web/vitest.config.ts` (if absent):
```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = fileURLToPath(new URL('./', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: root }],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['./test/setup.ts'],
    clearMocks: true,
  },
});
```

- [ ] **Step 3: Create the test helpers**

Create `apps/web/test/helpers/library-holder.ts`:
```ts
import type { RulesLibrary } from '@elsewhere/rules';

export class LibraryLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryLoadError';
  }
}

let current: RulesLibrary | null = null;

export function setLibrary(library: RulesLibrary | null): void {
  current = library;
}

export function getLibrary(): RulesLibrary {
  if (!current) throw new LibraryLoadError('No rules library set for this test');
  return current;
}
```

Create `apps/web/test/helpers/supabase-fake.ts`:
```ts
export interface KeyRow {
  id: string;
  partner_id: string;
  key_hash: string;
  rate_limit_rule: string;
  revoked_at: string | null;
}

export const fakeDb = {
  apiKeys: [] as KeyRow[],
  events: [] as Record<string, unknown>[],
  funnel: [] as { event_name: string; metadata: Record<string, unknown> }[],
  reset(): void {
    fakeDb.apiKeys = [];
    fakeDb.events = [];
    fakeDb.funnel = [];
  },
};

export const supabaseFake = {
  from(table: string) {
    if (table === 'api_keys') {
      const filters: Array<(row: KeyRow) => boolean> = [];
      const query = {
        select: (_columns: string) => query,
        eq: (column: keyof KeyRow, value: unknown) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        is: (column: keyof KeyRow, value: null) => {
          filters.push((row) => row[column] === value);
          return query;
        },
        maybeSingle: async () => {
          const row = fakeDb.apiKeys.find((r) => filters.every((f) => f(r)));
          return {
            data: row ? { id: row.id, partner_id: row.partner_id, rate_limit_rule: row.rate_limit_rule } : null,
            error: null,
          };
        },
      };
      return query;
    }
    if (table === 'rules_api_events') {
      return {
        insert: async (row: Record<string, unknown>) => {
          fakeDb.events.push(row);
          return { error: null };
        },
      };
    }
    throw new Error(`supabaseFake: unexpected table ${table}`);
  },
};
```

Create `apps/web/test/helpers/fixture-library.ts`:
```ts
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  buildLibrary,
  RuleSchema,
  type MatchOutcome,
  type Rule,
  type RuleChange,
  type RulesLibrary,
  type Situation,
  type Source,
} from '@elsewhere/rules';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RULES_FIXTURES = path.resolve(HERE, '../../../../packages/rules/test/fixtures');

export const TEST_SOURCE: Source = {
  key: 'test-source',
  url: 'https://example.test/source',
  kind: 'regulation',
  detector: { changedetection: { watch_uuid: 'test-source' } },
};

export function makeRule(overrides: Partial<Rule> = {}): Rule {
  return RuleSchema.parse({
    id: 'test-cancelled-refund',
    version: 1,
    status: 'verified',
    domain: 'flights',
    jurisdiction: 'US-DOT',
    title: 'Cancelled flight refund',
    summary: 'If the airline cancels and you decline the alternative, you get a refund.',
    applies_when: {
      all: [
        { fact: 'event.type', in: ['cancellation'] },
        { fact: 'flight.touches_us', eq: true },
        { fact: 'passenger.accepted_alternative', eq: false },
      ],
    },
    entitlement: { kind: 'refund', amount: { basis: 'full_ticket_price' } },
    how_to_claim: { steps: ['Ask for a refund in writing.'], templates: ['airline_refund_request'] },
    exceptions: ['Not if you accept the alternative flight.'],
    sources: [{ id: 's1', source: TEST_SOURCE.key, quotes: [{ text: 'a refund is owed', supports: ['summary', 'entitlement'] }] }],
    lead_character: 'pigeon',
    tags: ['refund', 'cancellation'],
    last_verified: '2026-10-06',
    verified_by: 'tester',
    review_by: '2027-01-04',
    ...overrides,
  });
}

/** One rule per status. The retired and draft rules reuse the verified rule's conditions on purpose. */
export function standardRules(): Rule[] {
  return [
    makeRule(),
    makeRule({
      id: 'test-tarmac-delay',
      status: 'needs_review',
      title: 'Tarmac delay limits',
      summary: 'Airlines must let you off after three hours on the tarmac on domestic flights.',
      applies_when: { all: [{ fact: 'event.type', in: ['tarmac_delay'] }, { fact: 'flight.is_domestic_us', eq: true }] },
      tags: ['tarmac', 'delay'],
      lead_character: 'raccoon',
    }),
    makeRule({
      id: 'test-old-voucher-rule',
      status: 'retired',
      replaced_by: 'test-cancelled-refund',
      title: 'Old voucher guidance',
      summary: 'Superseded guidance about vouchers.',
      tags: ['voucher'],
    }),
    makeRule({
      id: 'test-draft-rule',
      status: 'draft',
      title: 'Secret draft rule',
      summary: 'Draft summary that must never leak.',
      tags: ['draft'],
      last_verified: null,
      verified_by: null,
      review_by: null,
    }),
  ];
}

/** Newest first, as the contract requires. */
export function standardChanges(): RuleChange[] {
  return [
    { rule_id: 'test-tarmac-delay', from_version: 1, to_version: 2, from_status: 'verified', to_status: 'needs_review', date: '2026-10-05' },
    { rule_id: 'test-draft-rule', from_version: null, to_version: 1, from_status: null, to_status: 'draft', date: '2026-10-04' },
    { rule_id: 'test-cancelled-refund', from_version: null, to_version: 1, from_status: null, to_status: 'verified', date: '2026-10-01' },
  ];
}

export function makeLibrary(rules: Rule[], changes: RuleChange[] = []): RulesLibrary {
  const sources: Record<string, Source> = {};
  for (const rule of rules) {
    for (const ref of rule.sources) {
      sources[ref.source] =
        ref.source === TEST_SOURCE.key
          ? TEST_SOURCE
          : {
              key: ref.source,
              url: `https://example.test/${ref.source}`,
              kind: 'regulation',
              detector: { changedetection: { watch_uuid: ref.source } },
            };
    }
  }
  return buildLibrary({ rules, changes, sources, now: new Date('2026-10-06T12:00:00Z') });
}

export function standardLibrary(): RulesLibrary {
  return makeLibrary(standardRules(), standardChanges());
}

export interface GoldenCase {
  file: string;
  name: string;
  situation: Situation;
  rules: string[];
  expect: { rule_id: string; outcome: MatchOutcome; missing_facts: string[] }[];
}

export function goldenCases(): GoldenCase[] {
  const dir = path.join(RULES_FIXTURES, 'match');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml'))
    .sort()
    .map((file) => ({ file, ...(parse(readFileSync(path.join(dir, file), 'utf8')) as Omit<GoldenCase, 'file'>) }));
}

export function fixtureRule(id: string): Rule {
  return RuleSchema.parse(parse(readFileSync(path.join(RULES_FIXTURES, 'rules', `${id}.yaml`), 'utf8')));
}
```

Create `apps/web/test/setup.ts`:
```ts
import { beforeEach, vi } from 'vitest';

process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test';
delete process.env.VERCEL;

vi.mock('@/lib/rules/library', async () => {
  const holder = await import('./helpers/library-holder');
  return { getLibrary: holder.getLibrary, LibraryLoadError: holder.LibraryLoadError };
});

vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  after: vi.fn(),
}));

vi.mock('@vercel/firewall', () => ({
  checkRateLimit: vi.fn(async () => ({ rateLimited: false })),
}));

vi.mock('@/lib/supabase/admin', async () => {
  const fake = await import('./helpers/supabase-fake');
  return { createAdminClient: () => fake.supabaseFake };
});

beforeEach(async () => {
  const { fakeDb } = await import('./helpers/supabase-fake');
  const { setLibrary } = await import('./helpers/library-holder');
  fakeDb.reset();
  setLibrary(null);
});
```

- [ ] **Step 4: Write the failing test for the loader**

Create `apps/web/test/rules-api/parse-library.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { LibraryLoadError, parseLibrary } from '@/lib/rules/parse-library';
import { standardLibrary } from '../helpers/fixture-library';

describe('parseLibrary', () => {
  it('accepts a schema_version 1 library', () => {
    const lib = standardLibrary();
    expect(parseLibrary(JSON.parse(JSON.stringify(lib))).library_version).toBe(lib.library_version);
  });

  it('defaults a missing sources map to {}', () => {
    const { sources: _sources, ...withoutSources } = standardLibrary();
    expect(parseLibrary(withoutSources).sources).toEqual({});
  });

  it('rejects an unsupported schema_version', () => {
    expect(() => parseLibrary({ ...standardLibrary(), schema_version: 2 })).toThrow(LibraryLoadError);
  });

  it('rejects a non-object', () => {
    expect(() => parseLibrary(null)).toThrow(LibraryLoadError);
  });
});
```

Run: `cd apps/web && npx vitest run test/rules-api/parse-library.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rules/parse-library'`.

- [ ] **Step 5: Implement the loader**

Create `apps/web/lib/rules/parse-library.ts`:
```ts
import type { RulesLibrary } from '@elsewhere/rules';

export class LibraryLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LibraryLoadError';
  }
}

export const SUPPORTED_SCHEMA_VERSION = 1;

export function parseLibrary(raw: unknown): RulesLibrary {
  if (typeof raw !== 'object' || raw === null) {
    throw new LibraryLoadError('rules.json is not an object');
  }
  const lib = raw as Partial<RulesLibrary>;
  if (lib.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new LibraryLoadError(`Unsupported schema_version ${String(lib.schema_version)}`);
  }
  if (typeof lib.library_version !== 'string' || !Array.isArray(lib.rules) || !Array.isArray(lib.changes)) {
    throw new LibraryLoadError('rules.json is missing library_version, rules, or changes');
  }
  return { ...lib, sources: lib.sources ?? {} } as RulesLibrary;
}
```

Create `apps/web/lib/rules/library.ts` (skip if Step 1 found C1's version and you adapted it):
```ts
import type { RulesLibrary } from '@elsewhere/rules';
import raw from '../../../../packages/rules/dist/rules.json';
import { parseLibrary } from './parse-library';

export { LibraryLoadError } from './parse-library';

let cached: RulesLibrary | null = null;

/** The rules library baked into this deployment. Changes only by deploying. */
export function getLibrary(): RulesLibrary {
  cached ??= parseLibrary(raw);
  return cached;
}
```

- [ ] **Step 6: Run tests and typecheck**

Run: `cd apps/web && npx vitest run test/rules-api/parse-library.test.ts && npm run typecheck`
Expected: 4 tests PASS; typecheck clean (the `pretypecheck` hook builds `dist/rules.json` first).

- [ ] **Step 7: Commit**

```bash
git add apps/web/package.json package-lock.json apps/web/vitest.config.ts apps/web/test apps/web/lib/rules apps/web/next.config.ts
git commit -m "Add the rules library loader and the web test harness

getLibrary() reads the deployment's dist/rules.json once. Vitest runs
with in-memory stand-ins for the library, Supabase, the firewall, and
next/server's after().

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 3: Attribution links and the public rule projection

**Files:**
- Create: `apps/web/lib/rules-api/types.ts`, `apps/web/lib/rules-api/links.ts`, `apps/web/lib/rules-api/projection.ts`
- Test: `apps/web/test/rules-api/projection.test.ts`

**Interfaces:**
- Consumes: `Rule`, `RuleChange`, `RulesLibrary`, `Domain`, `FactName`, `RuleStatus` from `@elsewhere/rules`.
- Produces:
  - `types.ts`: `LinkAttribution`, `ApiCaller`, `Citation`, `PublicStatus`, `PublicRule`, `RuleSummary`, `MatchedRule`, `MatchResponse`, `Envelope<T>`, `ATTRIBUTION`.
  - `links.ts`: `appOrigin(): string`, `sanitizeMedium(raw: string | null | undefined): string`, `rulePageUrl(ruleId: string, attribution: LinkAttribution): string`.
  - `projection.ts`: `isPublic(rule: Rule): boolean`, `needsReviewSince(rule: Rule, changes: RuleChange[]): string`, `citationsFor(rule: Rule, library: RulesLibrary): Citation[]`, `toPublicRule(rule, library, attribution): PublicRule`, `toRuleSummary(rule, library, attribution): RuleSummary`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/rules-api/projection.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rulePageUrl, sanitizeMedium } from '@/lib/rules-api/links';
import { isPublic, toPublicRule, toRuleSummary } from '@/lib/rules-api/projection';
import { standardLibrary } from '../helpers/fixture-library';

const API = { source: 'api', medium: 'anonymous' } as const;

function rule(id: string) {
  const lib = standardLibrary();
  const found = lib.rules.find((r) => r.id === id);
  if (!found) throw new Error(`missing ${id}`);
  return { lib, rule: found };
}

describe('rulePageUrl', () => {
  it('tags the rule page with source, medium, and campaign', () => {
    expect(rulePageUrl('test-cancelled-refund', { source: 'mcp', medium: 'ChatGPT' })).toBe(
      'https://elsewhere.test/rules/test-cancelled-refund?utm_source=mcp&utm_medium=chatgpt&utm_campaign=rules',
    );
  });

  it('sanitizes the medium', () => {
    expect(sanitizeMedium('Claude Desktop/1.2 (mac)')).toBe('claude-desktop-1.2-mac');
    expect(sanitizeMedium('')).toBe('unknown');
    expect(sanitizeMedium(null)).toBe('unknown');
    expect(sanitizeMedium('x'.repeat(80))).toHaveLength(40);
  });
});

describe('toPublicRule', () => {
  it('projects a verified rule with citations and no internal fields', () => {
    const { lib, rule: r } = rule('test-cancelled-refund');
    const pub = toPublicRule(r, lib, API);
    expect(pub).toMatchObject({
      id: 'test-cancelled-refund',
      status: 'verified',
      how_to_claim: { steps: ['Ask for a refund in writing.'] },
      citations: [{ url: 'https://example.test/source', kind: 'regulation', quote: 'a refund is owed' }],
      page_url: 'https://elsewhere.test/rules/test-cancelled-refund?utm_source=api&utm_medium=anonymous&utm_campaign=rules',
    });
    expect(pub).not.toHaveProperty('notice');
    expect(pub).not.toHaveProperty('lead_character');
    expect(pub).not.toHaveProperty('verified_by');
    expect(pub).not.toHaveProperty('sources');
    expect(pub).not.toHaveProperty('applies_when');
    expect(pub.how_to_claim).not.toHaveProperty('templates');
  });

  it('adds a notice to a needs_review rule using the date it changed', () => {
    const { lib, rule: r } = rule('test-tarmac-delay');
    expect(toPublicRule(r, lib, API).notice).toBe('Being re-checked since 2026-10-05 after a source change.');
  });

  it('adds replaced_by to a retired rule', () => {
    const { lib, rule: r } = rule('test-old-voucher-rule');
    expect(toPublicRule(r, lib, API)).toMatchObject({ status: 'retired', replaced_by: 'test-cancelled-refund' });
  });

  it('refuses to project a draft', () => {
    const { lib, rule: r } = rule('test-draft-rule');
    expect(isPublic(r)).toBe(false);
    expect(() => toPublicRule(r, lib, API)).toThrow(/draft/);
  });
});

describe('toRuleSummary', () => {
  it('keeps only the summary fields', () => {
    const { lib, rule: r } = rule('test-tarmac-delay');
    expect(Object.keys(toRuleSummary(r, lib, API)).sort()).toEqual(
      ['domain', 'id', 'jurisdiction', 'notice', 'page_url', 'status', 'summary', 'title'].sort(),
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run test/rules-api/projection.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rules-api/links'`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/rules-api/types.ts`:
```ts
import type { Domain, FactName, Rule, RuleStatus } from '@elsewhere/rules';

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
```

Create `apps/web/lib/rules-api/links.ts`:
```ts
import type { LinkAttribution } from './types';

export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
}

export function sanitizeMedium(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'unknown';
}

export function rulePageUrl(ruleId: string, attribution: LinkAttribution): string {
  const url = new URL(`/rules/${encodeURIComponent(ruleId)}`, `${appOrigin()}/`);
  url.searchParams.set('utm_source', attribution.source);
  url.searchParams.set('utm_medium', sanitizeMedium(attribution.medium));
  url.searchParams.set('utm_campaign', 'rules');
  return url.toString();
}
```

Create `apps/web/lib/rules-api/projection.ts`:
```ts
import type { Rule, RuleChange, RulesLibrary } from '@elsewhere/rules';
import { rulePageUrl } from './links';
import type { Citation, LinkAttribution, PublicRule, PublicStatus, RuleSummary } from './types';

export function isPublic(rule: Rule): boolean {
  return rule.status !== 'draft';
}

export function needsReviewSince(rule: Rule, changes: RuleChange[]): string {
  const change = changes.find((c) => c.rule_id === rule.id && c.to_status === 'needs_review');
  return (change?.date ?? rule.last_verified ?? 'recently').slice(0, 10);
}

export function citationsFor(rule: Rule, library: RulesLibrary): Citation[] {
  return rule.sources.flatMap((ref) => {
    const source = library.sources[ref.source];
    if (!source) return [];
    return ref.quotes.map((quote) => ({ url: source.url, kind: source.kind, quote: quote.text }));
  });
}

export function toPublicRule(rule: Rule, library: RulesLibrary, attribution: LinkAttribution): PublicRule {
  if (!isPublic(rule)) throw new Error(`Refusing to project draft rule ${rule.id}`);
  const pub: PublicRule = {
    id: rule.id,
    version: rule.version,
    status: rule.status as PublicStatus,
    domain: rule.domain,
    jurisdiction: rule.jurisdiction,
    title: rule.title,
    summary: rule.summary,
    entitlement: rule.entitlement,
    how_to_claim: { steps: rule.how_to_claim.steps },
    exceptions: rule.exceptions,
    citations: citationsFor(rule, library),
    last_verified: rule.last_verified,
    review_by: rule.review_by,
    page_url: rulePageUrl(rule.id, attribution),
  };
  if (rule.status === 'needs_review') {
    pub.notice = `Being re-checked since ${needsReviewSince(rule, library.changes)} after a source change.`;
  }
  if (rule.status === 'retired' && rule.replaced_by) {
    pub.replaced_by = rule.replaced_by;
  }
  return pub;
}

export function toRuleSummary(rule: Rule, library: RulesLibrary, attribution: LinkAttribution): RuleSummary {
  const { id, title, summary, status, domain, jurisdiction, page_url, notice } = toPublicRule(rule, library, attribution);
  return { id, title, summary, status, domain, jurisdiction, page_url, ...(notice ? { notice } : {}) };
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx vitest run test/rules-api/projection.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rules-api/types.ts apps/web/lib/rules-api/links.ts apps/web/lib/rules-api/projection.ts apps/web/test/rules-api/projection.test.ts
git commit -m "Project rules into the public shape with tagged rule-page links

Drafts can't be projected. needs_review rules carry a re-check notice,
retired rules point at their replacement, and internal fields stay in.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 4: Response envelope, ETags, caching, and errors

**Files:**
- Create: `apps/web/lib/rules-api/envelope.ts`
- Test: `apps/web/test/rules-api/envelope.test.ts`

**Interfaces:**
- Consumes: `RulesLibrary`; `ApiCaller`, `Envelope`, `ATTRIBUTION` from `./types`.
- Produces: `envelope<T>(library, data: T): Envelope<T>`, `etagFor(library): string`, `cacheHeaders(caller: ApiCaller, cacheable: boolean): Record<string, string>`, `jsonOk(req: Request, library, body: unknown, caller: ApiCaller, opts?: { cacheable?: boolean }): Response`, `jsonError(status: number, code: string, message: string, opts?: { library?: RulesLibrary; details?: unknown; headers?: Record<string, string> }): Response`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/rules-api/envelope.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { envelope, etagFor, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { standardLibrary } from '../helpers/fixture-library';

const anon = { tier: 'anonymous' } as const;
const partner = { tier: 'partner', keyId: 'k1', partnerId: 'acme', rateLimitRule: 'rules-partner' } as const;

describe('envelope', () => {
  it('wraps data with versions and attribution', () => {
    const lib = standardLibrary();
    expect(envelope(lib, { ok: true })).toEqual({
      schema_version: 1,
      library_version: lib.library_version,
      data: { ok: true },
      attribution: { text: 'Rules verified by Elsewhere from primary sources. Not legal advice.', required: true },
    });
  });
});

describe('jsonOk', () => {
  it('sends public CDN caching and an ETag to anonymous callers', async () => {
    const lib = standardLibrary();
    const res = jsonOk(new Request('https://elsewhere.test/api/rules/facts'), lib, { a: 1 }, anon);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(res.headers.get('vary')).toBe('Authorization');
    expect(res.headers.get('etag')).toBe(etagFor(lib));
    expect(res.headers.get('x-library-version')).toBe(lib.library_version);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('answers 304 when If-None-Match matches, including weak and listed tags', () => {
    const lib = standardLibrary();
    for (const header of [etagFor(lib), `W/${etagFor(lib)}`, `"other", ${etagFor(lib)}`, '*']) {
      const req = new Request('https://elsewhere.test/api/rules/facts', { headers: { 'if-none-match': header } });
      const res = jsonOk(req, lib, { a: 1 }, anon);
      expect(res.status).toBe(304);
      expect(res.body).toBeNull();
    }
  });

  it('keeps partner responses out of shared caches', () => {
    const res = jsonOk(new Request('https://elsewhere.test/x'), standardLibrary(), {}, partner);
    expect(res.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
  });

  it('marks non-cacheable responses no-store without an ETag', () => {
    const res = jsonOk(new Request('https://elsewhere.test/x'), standardLibrary(), {}, anon, { cacheable: false });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('etag')).toBeNull();
  });
});

describe('jsonError', () => {
  it('returns an error body that is never cached', async () => {
    const lib = standardLibrary();
    const res = jsonError(429, 'rate_limited', 'Slow down.', { library: lib, headers: { 'Retry-After': '60' } });
    expect(res.status).toBe(429);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('retry-after')).toBe('60');
    expect(await res.json()).toEqual({
      schema_version: 1,
      library_version: lib.library_version,
      error: { code: 'rate_limited', message: 'Slow down.' },
    });
  });

  it('includes details only when given', async () => {
    const body = await jsonError(400, 'invalid_facts', 'Bad.', { details: { errors: [] } }).json();
    expect(body.error.details).toEqual({ errors: [] });
    expect(body.library_version).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run test/rules-api/envelope.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rules-api/envelope'`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/rules-api/envelope.ts`:
```ts
import type { RulesLibrary } from '@elsewhere/rules';
import { ATTRIBUTION, type ApiCaller, type Envelope } from './types';

export function envelope<T>(library: RulesLibrary, data: T): Envelope<T> {
  return {
    schema_version: library.schema_version,
    library_version: library.library_version,
    data,
    attribution: ATTRIBUTION,
  };
}

export function etagFor(library: RulesLibrary): string {
  return `"${library.library_version}"`;
}

export function cacheHeaders(caller: ApiCaller, cacheable: boolean): Record<string, string> {
  if (!cacheable) return { 'Cache-Control': 'no-store' };
  if (caller.tier === 'partner') {
    return { 'Cache-Control': 'private, max-age=0, must-revalidate', Vary: 'Authorization' };
  }
  return { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400', Vary: 'Authorization' };
}

function matchesEtag(header: string | null, etag: string): boolean {
  if (!header) return false;
  if (header.trim() === '*') return true;
  return header
    .split(',')
    .map((tag) => tag.trim().replace(/^W\//, ''))
    .includes(etag);
}

export function jsonOk(
  req: Request,
  library: RulesLibrary,
  body: unknown,
  caller: ApiCaller,
  opts: { cacheable?: boolean } = {},
): Response {
  const cacheable = opts.cacheable ?? true;
  const headers: Record<string, string> = {
    ...cacheHeaders(caller, cacheable),
    'X-Library-Version': library.library_version,
  };
  if (cacheable) {
    const etag = etagFor(library);
    headers.ETag = etag;
    if (matchesEtag(req.headers.get('if-none-match'), etag)) {
      return new Response(null, { status: 304, headers });
    }
  }
  return Response.json(body, { status: 200, headers });
}

export function jsonError(
  status: number,
  code: string,
  message: string,
  opts: { library?: RulesLibrary; details?: unknown; headers?: Record<string, string> } = {},
): Response {
  const body = {
    schema_version: 1,
    library_version: opts.library?.library_version ?? null,
    error: { code, message, ...(opts.details !== undefined ? { details: opts.details } : {}) },
  };
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...opts.headers } });
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx vitest run test/rules-api/envelope.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rules-api/envelope.ts apps/web/test/rules-api/envelope.test.ts
git commit -m "Add the API envelope with library-version ETags and caching

Anonymous reads cache at the CDN for an hour, partner reads stay
private, and errors are never cached.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 5: Partner keys, caller resolution, and rate limits

**Files:**
- Create: `supabase/migrations/00020_rules_api.sql`
- Create: `apps/web/lib/rules-api/auth.ts`, `apps/web/lib/rules-api/rate-limit.ts`, `apps/web/scripts/create-partner-key.ts`
- Test: `apps/web/test/rules-api/auth.test.ts`, `apps/web/test/rules-api/rate-limit.test.ts`

**Interfaces:**
- Consumes: `createAdminClient` from `@/lib/supabase/admin`; `checkRateLimit` from `@vercel/firewall`; `jsonError` from `./envelope`; `ApiCaller` from `./types`.
- Produces:
  - `auth.ts`: `KEY_PATTERN: RegExp`, `bearerToken(req: Request): string | null`, `hashKey(key: string): string`, `generateKey(): string`, `lookupKey(key: string, now?: number): Promise<{ keyId: string; partnerId: string; rateLimitRule: string } | null>`, `clearKeyCache(): void`, `resolveCaller(req: Request): Promise<ApiCaller | 'invalid'>`.
  - `rate-limit.ts`: `RATE_LIMIT_RULES = { api: 'rules-api-anon', mcp: 'rules-mcp-anon' }`, `RETRY_AFTER_SECONDS = 60`, `enforceRateLimit(req: Request, caller: ApiCaller, surface: 'api' | 'mcp'): Promise<Response | null>`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/00020_rules_api.sql`:
```sql
-- Track D: partner API keys and rules API analytics.
-- Service role only: RLS is on with no policies, so anon/authenticated clients can't read or write.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null,
  key_hash text not null unique,              -- sha256 hex of the full key; the key itself is never stored
  rate_limit_rule text not null default 'rules-partner',  -- Vercel Firewall rate-limit rule ID
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.api_keys enable row level security;

create table public.rules_api_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  surface text not null check (surface in ('api', 'mcp')),
  endpoint text not null,
  status integer not null,
  client_name text,
  client_version text,
  tier text not null check (tier in ('anonymous', 'partner')),
  key_id uuid references public.api_keys(id),
  rule_ids text[] not null default '{}',
  fact_names text[] not null default '{}',
  event_type text,
  missing_facts text[] not null default '{}',
  query text check (query is null or char_length(query) <= 200),
  result_count integer not null default 0,
  library_version text,
  latency_ms integer not null
);

create index rules_api_events_created_at_idx on public.rules_api_events (created_at desc);

alter table public.rules_api_events enable row level security;
```

- [ ] **Step 2: Write the failing tests**

Create `apps/web/test/rules-api/auth.test.ts`:
```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { bearerToken, clearKeyCache, generateKey, hashKey, KEY_PATTERN, lookupKey, resolveCaller } from '@/lib/rules-api/auth';
import { fakeDb } from '../helpers/supabase-fake';

const KEY = 'els_' + 'A1b2C3d4'.repeat(4);

function req(authorization?: string): Request {
  return new Request('https://elsewhere.test/api/rules', { headers: authorization ? { authorization } : {} });
}

beforeEach(() => {
  clearKeyCache();
});

describe('keys', () => {
  it('hashes with sha256 hex', () => {
    expect(hashKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('generates keys that match the key pattern and differ', () => {
    const a = generateKey();
    expect(a).toMatch(KEY_PATTERN);
    expect(generateKey()).not.toBe(a);
  });

  it('reads bearer tokens case-insensitively', () => {
    expect(bearerToken(req(`Bearer ${KEY}`))).toBe(KEY);
    expect(bearerToken(req(`bearer   ${KEY}`))).toBe(KEY);
    expect(bearerToken(req('Basic abc'))).toBeNull();
    expect(bearerToken(req())).toBeNull();
  });
});

describe('resolveCaller', () => {
  it('treats no key as anonymous', async () => {
    expect(await resolveCaller(req())).toEqual({ tier: 'anonymous' });
  });

  it('rejects a malformed key without a database lookup', async () => {
    expect(await resolveCaller(req('Bearer not-a-key'))).toBe('invalid');
  });

  it('resolves an active key to its partner', async () => {
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: null });
    expect(await resolveCaller(req(`Bearer ${KEY}`))).toEqual({
      tier: 'partner',
      keyId: 'key-1',
      partnerId: 'acme',
      rateLimitRule: 'rules-partner',
    });
  });

  it('rejects a revoked key', async () => {
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: '2026-10-01T00:00:00Z' });
    expect(await resolveCaller(req(`Bearer ${KEY}`))).toBe('invalid');
  });

  it('caches lookups for 60 seconds', async () => {
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: null });
    const t0 = 1_000_000;
    expect(await lookupKey(KEY, t0)).not.toBeNull();
    fakeDb.apiKeys = [];
    expect(await lookupKey(KEY, t0 + 59_000)).not.toBeNull();
    expect(await lookupKey(KEY, t0 + 61_000)).toBeNull();
  });
});
```

Create `apps/web/test/rules-api/rate-limit.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '@vercel/firewall';
import { enforceRateLimit } from '@/lib/rules-api/rate-limit';

const anon = { tier: 'anonymous' } as const;
const partner = { tier: 'partner', keyId: 'key-1', partnerId: 'acme', rateLimitRule: 'rules-partner' } as const;
const request = () => new Request('https://elsewhere.test/api/rules');

afterEach(() => {
  delete process.env.VERCEL;
});

describe('enforceRateLimit', () => {
  it('does nothing off Vercel', async () => {
    expect(await enforceRateLimit(request(), anon, 'api')).toBeNull();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('uses the anonymous rule for the surface', async () => {
    process.env.VERCEL = '1';
    await enforceRateLimit(request(), anon, 'mcp');
    expect(vi.mocked(checkRateLimit).mock.calls[0][0]).toBe('rules-mcp-anon');
  });

  it("uses the partner's rule keyed by key ID", async () => {
    process.env.VERCEL = '1';
    await enforceRateLimit(request(), partner, 'api');
    const [ruleId, options] = vi.mocked(checkRateLimit).mock.calls[0];
    expect(ruleId).toBe('rules-partner');
    expect(options?.rateLimitKey).toBe('key-1');
  });

  it('returns 429 with Retry-After when limited', async () => {
    process.env.VERCEL = '1';
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ rateLimited: true });
    const res = await enforceRateLimit(request(), anon, 'api');
    expect(res?.status).toBe(429);
    expect(res?.headers.get('retry-after')).toBe('60');
  });

  it('returns 403 when the firewall blocked the request', async () => {
    process.env.VERCEL = '1';
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ rateLimited: false, error: 'blocked' });
    expect((await enforceRateLimit(request(), anon, 'api'))?.status).toBe(403);
  });

  it('fails open when the rule is not configured', async () => {
    process.env.VERCEL = '1';
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ rateLimited: false, error: 'not-found' });
    expect(await enforceRateLimit(request(), anon, 'api')).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd apps/web && npx vitest run test/rules-api/auth.test.ts test/rules-api/rate-limit.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rules-api/auth'`.

- [ ] **Step 4: Implement**

Create `apps/web/lib/rules-api/auth.ts`:
```ts
import { createHash, randomBytes } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ApiCaller } from './types';

export const KEY_PATTERN = /^els_[A-Za-z0-9]{32}$/;
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CACHE_MS = 60_000;

export interface KeyRecord {
  keyId: string;
  partnerId: string;
  rateLimitRule: string;
}

const cache = new Map<string, { value: KeyRecord | null; expires: number }>();

export function bearerToken(req: Request): string | null {
  const match = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

export function generateKey(): string {
  const bytes = randomBytes(32);
  let body = '';
  for (const byte of bytes) body += BASE62[byte % BASE62.length];
  return `els_${body}`;
}

export function clearKeyCache(): void {
  cache.clear();
}

export async function lookupKey(key: string, now: number = Date.now()): Promise<KeyRecord | null> {
  const hash = hashKey(key);
  const hit = cache.get(hash);
  if (hit && hit.expires > now) return hit.value;

  const { data, error } = await createAdminClient()
    .from('api_keys')
    .select('id, partner_id, rate_limit_rule')
    .eq('key_hash', hash)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;

  const value: KeyRecord | null = data
    ? { keyId: data.id, partnerId: data.partner_id, rateLimitRule: data.rate_limit_rule }
    : null;
  cache.set(hash, { value, expires: now + CACHE_MS });
  return value;
}

export async function resolveCaller(req: Request): Promise<ApiCaller | 'invalid'> {
  const token = bearerToken(req);
  if (!token) return { tier: 'anonymous' };
  if (!KEY_PATTERN.test(token)) return 'invalid';
  const record = await lookupKey(token);
  return record ? { tier: 'partner', ...record } : 'invalid';
}
```

Create `apps/web/lib/rules-api/rate-limit.ts`:
```ts
import { checkRateLimit } from '@vercel/firewall';
import { jsonError } from './envelope';
import type { ApiCaller } from './types';

export const RATE_LIMIT_RULES = { api: 'rules-api-anon', mcp: 'rules-mcp-anon' } as const;
export const RETRY_AFTER_SECONDS = 60;

export async function enforceRateLimit(
  req: Request,
  caller: ApiCaller,
  surface: 'api' | 'mcp',
): Promise<Response | null> {
  if (process.env.VERCEL !== '1') return null;

  const ruleId = caller.tier === 'partner' ? caller.rateLimitRule : RATE_LIMIT_RULES[surface];
  const { rateLimited, error } = await checkRateLimit(ruleId, {
    request: req,
    ...(caller.tier === 'partner' ? { rateLimitKey: caller.keyId } : {}),
  });

  if (error === 'blocked') return jsonError(403, 'blocked', 'Request blocked by the firewall.');
  if (error === 'not-found') {
    console.warn(`[rules-api] rate limit rule "${ruleId}" is not configured in Vercel Firewall`);
    return null;
  }
  if (rateLimited) {
    return jsonError(429, 'rate_limited', `Too many requests. Retry after ${RETRY_AFTER_SECONDS} seconds.`, {
      headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) },
    });
  }
  return null;
}
```

Create `apps/web/scripts/create-partner-key.ts`:
```ts
// Usage (Node 24, from apps/web):
//   node --env-file=.env.local --import tsx scripts/create-partner-key.ts <partner-id> [rate-limit-rule]
// Prints the key once. Only its sha256 hash is stored.
import { createAdminClient } from '../lib/supabase/admin';
import { generateKey, hashKey } from '../lib/rules-api/auth';

async function main(): Promise<void> {
  const [partnerId, rateLimitRule = 'rules-partner'] = process.argv.slice(2);
  if (!partnerId || !/^[a-z0-9-]{2,40}$/.test(partnerId)) {
    console.error('Usage: create-partner-key.ts <partner-id: a-z0-9-> [rate-limit-rule]');
    process.exit(1);
  }
  const key = generateKey();
  const { data, error } = await createAdminClient()
    .from('api_keys')
    .insert({ partner_id: partnerId, key_hash: hashKey(key), rate_limit_rule: rateLimitRule })
    .select('id')
    .single();
  if (error) throw error;
  console.log(`Partner: ${partnerId}\nKey ID:  ${data.id}\nKey:     ${key}\n\nSend the key once over a secure channel. It cannot be shown again.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/web && npx vitest run test/rules-api/auth.test.ts test/rules-api/rate-limit.test.ts && npm run typecheck`
Expected: PASS (8 + 6 tests); typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/00020_rules_api.sql apps/web/lib/rules-api/auth.ts apps/web/lib/rules-api/rate-limit.ts apps/web/scripts/create-partner-key.ts apps/web/test/rules-api/auth.test.ts apps/web/test/rules-api/rate-limit.test.ts
git commit -m "Add partner keys and Vercel Firewall rate limits for the rules API

Keys are stored only as sha256 hashes. Anonymous callers are limited
per IP, partners per key, and a missing firewall rule fails open.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 6: Analytics events

**Files:**
- Create: `apps/web/lib/rules-api/analytics.ts`
- Test: `apps/web/test/rules-api/analytics.test.ts`

**Interfaces:**
- Consumes: `after` from `next/server`; `createAdminClient` from `@/lib/supabase/admin`.
- Produces: `interface RulesApiEvent`, `sanitizeQuery(q: string | null | undefined): string | null`, `insertEvent(event: RulesApiEvent): Promise<void>`, `scheduleEvent(event: RulesApiEvent): void`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/rules-api/analytics.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest';
import { after } from 'next/server';
import { sanitizeQuery, scheduleEvent, type RulesApiEvent } from '@/lib/rules-api/analytics';
import { fakeDb } from '../helpers/supabase-fake';

const base: RulesApiEvent = {
  surface: 'api',
  endpoint: 'search',
  status: 200,
  client_name: 'curl/8.7.1',
  client_version: null,
  tier: 'anonymous',
  key_id: null,
  rule_ids: [],
  fact_names: [],
  event_type: null,
  missing_facts: [],
  query: null,
  result_count: 0,
  library_version: '2026-10-06.abc1234',
  latency_ms: 5,
};

describe('sanitizeQuery', () => {
  it('redacts emails', () => {
    expect(sanitizeQuery('refund for jo@example.com please')).toBe('refund for [redacted] please');
  });

  it('redacts phone numbers with 10 or more digits but keeps dates', () => {
    expect(sanitizeQuery('call me at +1 (415) 555-0100')).toBe('call me at [redacted]');
    expect(sanitizeQuery('flight on 2026-10-06')).toBe('flight on 2026-10-06');
  });

  it('truncates to 200 characters and nulls empty input', () => {
    expect(sanitizeQuery('a'.repeat(300))).toHaveLength(200);
    expect(sanitizeQuery('   ')).toBeNull();
    expect(sanitizeQuery(undefined)).toBeNull();
  });
});

describe('scheduleEvent', () => {
  it('defers a sanitized insert with after()', async () => {
    scheduleEvent({ ...base, query: 'refund for jo@example.com', client_name: 'x'.repeat(300) });
    expect(after).toHaveBeenCalledTimes(1);
    expect(fakeDb.events).toHaveLength(0);

    const task = vi.mocked(after).mock.calls[0][0] as () => Promise<void>;
    await task();

    expect(fakeDb.events).toHaveLength(1);
    expect(fakeDb.events[0]).toMatchObject({ endpoint: 'search', query: 'refund for [redacted]' });
    expect(String(fakeDb.events[0].client_name)).toHaveLength(120);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run test/rules-api/analytics.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rules-api/analytics'`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/rules-api/analytics.ts`:
```ts
import { after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface RulesApiEvent {
  surface: 'api' | 'mcp';
  endpoint: string;
  status: number;
  client_name: string | null;
  client_version: string | null;
  tier: 'anonymous' | 'partner';
  key_id: string | null;
  rule_ids: string[];
  fact_names: string[];
  event_type: string | null;
  missing_facts: string[];
  query: string | null;
  result_count: number;
  library_version: string | null;
  latency_ms: number;
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const PHONE_LIKE = /\+?\d[\d\s().-]{8,}\d/g;

export function sanitizeQuery(q: string | null | undefined): string | null {
  if (!q) return null;
  const redacted = q
    .replace(EMAIL, '[redacted]')
    .replace(PHONE_LIKE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[redacted]' : m))
    .trim()
    .slice(0, 200);
  return redacted || null;
}

export async function insertEvent(event: RulesApiEvent): Promise<void> {
  const { error } = await createAdminClient().from('rules_api_events').insert(event);
  if (error) console.error('[rules-api] analytics insert failed:', error.message);
}

/** Never blocks the response, never stores IPs. */
export function scheduleEvent(event: RulesApiEvent): void {
  const row: RulesApiEvent = {
    ...event,
    query: sanitizeQuery(event.query),
    client_name: event.client_name ? event.client_name.slice(0, 120) : null,
    client_version: event.client_version ? event.client_version.slice(0, 40) : null,
  };
  after(() => insertEvent(row));
}
```

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx vitest run test/rules-api/analytics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rules-api/analytics.ts apps/web/test/rules-api/analytics.test.ts
git commit -m "Record rules API and MCP calls after the response is sent

Queries are truncated and stripped of emails and phone numbers before
they're stored. IPs are never stored.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 7: Route wrapper and the read routes — `rules.json`, one rule, facts

**Files:**
- Create: `apps/web/lib/rules-api/handle.ts`, `apps/web/lib/rules-api/facts-vocabulary.ts`
- Create: `apps/web/app/api/rules.json/route.ts`, `apps/web/app/api/rules/[id]/route.ts`, `apps/web/app/api/rules/facts/route.ts`
- Test: `apps/web/test/rules-api/read-routes.test.ts`

**Interfaces:**
- Consumes: `getLibrary`, `LibraryLoadError` (Task 2); `resolveCaller` (Task 5); `enforceRateLimit` (Task 5); `jsonOk`, `jsonError`, `envelope` (Task 4); `scheduleEvent`, `RulesApiEvent` (Task 6); `isPublic`, `toPublicRule` (Task 3); `ATTRIBUTION` (Task 3); `FACTS`, `FactName` from `@elsewhere/rules`.
- Produces:
  - `handle.ts`: `interface RulesApiContext { req; library; caller; attribution }`, `type EventFields`, `interface RulesApiResult { response: Response; event?: EventFields }`, `withRulesApi(endpoint: string, run: (ctx: RulesApiContext) => RulesApiResult | Promise<RulesApiResult>): (req: Request) => Promise<Response>`.
  - `facts-vocabulary.ts`: `interface FactEntry { name: FactName; type: string; values?: string[]; description: string }`, `factsVocabulary(): FactEntry[]`.
  - Response data shapes: one rule → `data: { rule: PublicRule }`; facts → `data: { facts: FactEntry[] }`; `rules.json` → `RulesLibrary` fields (drafts removed) plus `attribution`.

`/api/rules.json` deliberately returns the **artifact** shape (full `Rule` objects, the same shape as `dist/rules.json`), not the public projection. Foundry reads it with `RULES_SOURCE=url:` and needs `lead_character`; both `RULES_SOURCE` modes must return the same shape. Drafts are still removed.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/rules-api/read-routes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { after } from 'next/server';
import { GET as getArtifact } from '@/app/api/rules.json/route';
import { GET as getRule } from '@/app/api/rules/[id]/route';
import { GET as getFacts } from '@/app/api/rules/facts/route';
import { setLibrary } from '../helpers/library-holder';
import { standardLibrary } from '../helpers/fixture-library';

const url = (path: string) => `https://elsewhere.test${path}`;

describe('GET /api/rules.json', () => {
  it('returns the artifact without drafts and with sources', async () => {
    setLibrary(standardLibrary());
    const res = await getArtifact(new Request(url('/api/rules.json')));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.schema_version).toBe(1);
    expect(body.rules.map((r: { id: string }) => r.id)).not.toContain('test-draft-rule');
    expect(body.rules).toHaveLength(3);
    expect(body.rules[0]).toHaveProperty('lead_character');
    expect(body.changes.map((c: { rule_id: string }) => c.rule_id)).not.toContain('test-draft-rule');
    expect(body.sources).toHaveProperty('test-source');
    expect(body.attribution.required).toBe(true);
  });

  it('answers 304 to a matching If-None-Match', async () => {
    const lib = standardLibrary();
    setLibrary(lib);
    const res = await getArtifact(new Request(url('/api/rules.json'), { headers: { 'if-none-match': `"${lib.library_version}"` } }));
    expect(res.status).toBe(304);
  });

  it('answers 503 when the library failed to load', async () => {
    setLibrary(null);
    expect((await getArtifact(new Request(url('/api/rules.json')))).status).toBe(503);
  });
});

describe('GET /api/rules/:id', () => {
  it('returns a verified rule in the envelope with an api-tagged page_url', async () => {
    setLibrary(standardLibrary());
    const res = await getRule(new Request(url('/api/rules/test-cancelled-refund')));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.rule.id).toBe('test-cancelled-refund');
    expect(body.data.rule.page_url).toContain('utm_source=api&utm_medium=anonymous');
    expect(after).toHaveBeenCalled();
  });

  it('returns the same 404 shape for drafts and unknown ids', async () => {
    setLibrary(standardLibrary());
    const draft = await getRule(new Request(url('/api/rules/test-draft-rule')));
    const unknown = await getRule(new Request(url('/api/rules/no-such-rule')));
    expect(draft.status).toBe(404);
    expect(unknown.status).toBe(404);
    const [d, u] = [await draft.json(), await unknown.json()];
    expect(d.error.code).toBe(u.error.code);
    expect(d.error.message.replace('test-draft-rule', 'X')).toBe(u.error.message.replace('no-such-rule', 'X'));
    expect(JSON.stringify(d)).not.toContain('Secret draft rule');
  });

  it('returns retired rules with replaced_by and needs_review rules with a notice', async () => {
    setLibrary(standardLibrary());
    const retired = await (await getRule(new Request(url('/api/rules/test-old-voucher-rule')))).json();
    expect(retired.data.rule.replaced_by).toBe('test-cancelled-refund');
    const review = await (await getRule(new Request(url('/api/rules/test-tarmac-delay')))).json();
    expect(review.data.rule.notice).toMatch(/^Being re-checked since 2026-10-05/);
  });

  it('rejects an invalid partner key with 401', async () => {
    setLibrary(standardLibrary());
    const res = await getRule(new Request(url('/api/rules/test-cancelled-refund'), { headers: { authorization: 'Bearer nope' } }));
    expect(res.status).toBe(401);
  });
});

describe('GET /api/rules/facts', () => {
  it('lists the vocabulary with types and enum values', async () => {
    setLibrary(standardLibrary());
    const body = await (await getFacts(new Request(url('/api/rules/facts')))).json();
    const eventType = body.data.facts.find((f: { name: string }) => f.name === 'event.type');
    expect(eventType.type).toBe('enum');
    expect(eventType.values).toContain('cancellation');
    expect(eventType.description.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run test/rules-api/read-routes.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/rules.json/route'`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/rules-api/handle.ts`:
```ts
import type { RulesLibrary } from '@elsewhere/rules';
import { getLibrary, LibraryLoadError } from '@/lib/rules/library';
import { scheduleEvent, type RulesApiEvent } from './analytics';
import { resolveCaller } from './auth';
import { jsonError } from './envelope';
import { enforceRateLimit } from './rate-limit';
import type { ApiCaller, LinkAttribution } from './types';

export interface RulesApiContext {
  req: Request;
  library: RulesLibrary;
  caller: ApiCaller;
  attribution: LinkAttribution;
}

export type EventFields = Partial<
  Pick<RulesApiEvent, 'rule_ids' | 'fact_names' | 'event_type' | 'missing_facts' | 'query' | 'result_count'>
>;

export interface RulesApiResult {
  response: Response;
  event?: EventFields;
}

/** Auth → rate limit → library → handler → analytics, for every rules API route. */
export function withRulesApi(
  endpoint: string,
  run: (ctx: RulesApiContext) => RulesApiResult | Promise<RulesApiResult>,
): (req: Request) => Promise<Response> {
  return async function handler(req: Request): Promise<Response> {
    const started = Date.now();
    const caller = await resolveCaller(req);
    if (caller === 'invalid') return jsonError(401, 'invalid_key', 'The API key is invalid or revoked.');

    const limited = await enforceRateLimit(req, caller, 'api');
    if (limited) return limited;

    let library: RulesLibrary;
    try {
      library = getLibrary();
    } catch (error) {
      if (error instanceof LibraryLoadError) {
        return jsonError(503, 'library_unavailable', 'The rules library is unavailable.');
      }
      throw error;
    }

    const attribution: LinkAttribution = {
      source: 'api',
      medium: caller.tier === 'partner' ? caller.partnerId : 'anonymous',
    };
    const { response, event = {} } = await run({ req, library, caller, attribution });

    scheduleEvent({
      surface: 'api',
      endpoint,
      status: response.status,
      client_name: req.headers.get('user-agent'),
      client_version: null,
      tier: caller.tier,
      key_id: caller.tier === 'partner' ? caller.keyId : null,
      rule_ids: [],
      fact_names: [],
      event_type: null,
      missing_facts: [],
      query: null,
      result_count: 0,
      ...event,
      library_version: library.library_version,
      latency_ms: Date.now() - started,
    });
    return response;
  };
}
```

Create `apps/web/lib/rules-api/facts-vocabulary.ts`:
```ts
import { FACTS, type FactName } from '@elsewhere/rules';

export interface FactEntry {
  name: FactName;
  type: string;
  values?: string[];
  description: string;
}

export function factsVocabulary(): FactEntry[] {
  return (Object.keys(FACTS) as FactName[]).sort().map((name) => {
    const def = FACTS[name];
    return {
      name,
      type: def.type,
      ...(def.values ? { values: [...def.values] } : {}),
      description: def.description,
    };
  });
}
```

Create `apps/web/app/api/rules.json/route.ts`:
```ts
import { withRulesApi } from '@/lib/rules-api/handle';
import { jsonOk } from '@/lib/rules-api/envelope';
import { isPublic } from '@/lib/rules-api/projection';
import { ATTRIBUTION } from '@/lib/rules-api/types';

// The artifact shape (same as packages/rules/dist/rules.json), minus drafts.
// Foundry reads this with RULES_SOURCE=url:.
export const GET = withRulesApi('rules.json', ({ req, library, caller }) => {
  const rules = library.rules.filter(isPublic);
  const body = {
    schema_version: library.schema_version,
    library_version: library.library_version,
    generated_at: library.generated_at,
    rules,
    changes: library.changes.filter((c) => c.to_status !== 'draft'),
    sources: library.sources,
    attribution: ATTRIBUTION,
  };
  return { response: jsonOk(req, library, body, caller), event: { result_count: rules.length } };
});
```

Create `apps/web/app/api/rules/[id]/route.ts`:
```ts
import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { isPublic, toPublicRule } from '@/lib/rules-api/projection';

export const GET = withRulesApi('get', ({ req, library, caller, attribution }) => {
  const id = decodeURIComponent(new URL(req.url).pathname.split('/').pop() ?? '');
  const rule = library.rules.find((r) => r.id === id && isPublic(r));
  if (!rule) {
    // Drafts and unknown ids get the identical response.
    return { response: jsonError(404, 'not_found', `No public rule with id "${id}".`, { library }) };
  }
  const data = { rule: toPublicRule(rule, library, attribution) };
  return {
    response: jsonOk(req, library, envelope(library, data), caller),
    event: { rule_ids: [rule.id], result_count: 1 },
  };
});
```

Create `apps/web/app/api/rules/facts/route.ts`:
```ts
import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonOk } from '@/lib/rules-api/envelope';
import { factsVocabulary } from '@/lib/rules-api/facts-vocabulary';

export const GET = withRulesApi('facts', ({ req, library, caller }) => {
  const facts = factsVocabulary();
  return {
    response: jsonOk(req, library, envelope(library, { facts }), caller),
    event: { result_count: facts.length },
  };
});
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `cd apps/web && npx vitest run test/rules-api/read-routes.test.ts && npm run typecheck`
Expected: PASS (8 tests); typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rules-api/handle.ts apps/web/lib/rules-api/facts-vocabulary.ts "apps/web/app/api/rules.json" "apps/web/app/api/rules/[id]" apps/web/app/api/rules/facts apps/web/test/rules-api/read-routes.test.ts
git commit -m "Serve rules.json, single rules, and the facts vocabulary

rules.json keeps the artifact shape foundry reads; single rules use the
public projection. Drafts and unknown ids return the same 404.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 8: Search and changes routes

**Files:**
- Create: `apps/web/lib/rules-api/search.ts`, `apps/web/lib/rules-api/changes.ts`
- Create: `apps/web/app/api/rules/route.ts`, `apps/web/app/api/rules/changes/route.ts`
- Test: `apps/web/test/rules-api/search-changes.test.ts`

**Interfaces:**
- Consumes: `withRulesApi` (Task 7); `envelope`, `jsonOk`, `jsonError` (Task 4); `isPublic`, `toRuleSummary` (Task 3); `DOMAINS`, `RULE_STATUSES`, `Domain`, `Rule`, `RuleChange`, `RuleStatus`, `RulesLibrary` from `@elsewhere/rules`.
- Produces:
  - `search.ts`: `stem(word: string): string`, `tokenize(q: string): string[]`, `interface SearchParams { q?; domain?; jurisdiction?; status?; limit? }`, `DEFAULT_SEARCH_STATUSES: RuleStatus[]`, `searchRules(library, params: SearchParams): Rule[]`, `parseSearchParams(url: URL): { ok: true; params: SearchParams } | { ok: false; message: string }`.
  - `changes.ts`: `type ChangeKind = 'added' | 'changed' | 'needs_review' | 'retired'`, `interface PublicChange`, `changeKind(c: RuleChange): ChangeKind`, `publicChangesSince(library, since: string): PublicChange[]`, `isIsoDate(s: string): boolean`, `defaultSince(now?: Date): string`.
  - Response data: search → `{ rules: RuleSummary[]; count: number }`; changes → `{ since: string; changes: PublicChange[] }`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/rules-api/search-changes.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { GET as search } from '@/app/api/rules/route';
import { GET as changes } from '@/app/api/rules/changes/route';
import { searchRules, tokenize } from '@/lib/rules-api/search';
import { setLibrary } from '../helpers/library-holder';
import { standardLibrary } from '../helpers/fixture-library';

const ids = (rules: { id: string }[]) => rules.map((r) => r.id);
const get = (route: (req: Request) => Promise<Response>, path: string) => route(new Request(`https://elsewhere.test${path}`));

describe('tokenize', () => {
  it('drops stopwords and stems common suffixes', () => {
    expect(tokenize('My flight was Cancelled, what am I owed?')).toEqual(['flight', 'cancell', 'ow']);
    expect(tokenize('cancellation canceled')).toEqual(['cancell', 'cancel']);
  });
});

describe('searchRules', () => {
  it('finds the refund rule by natural language', () => {
    expect(ids(searchRules(standardLibrary(), { q: 'cancelled flight refund' }))[0]).toBe('test-cancelled-refund');
  });

  it('never returns drafts, even searched for directly', () => {
    expect(searchRules(standardLibrary(), { q: 'secret draft rule' })).toEqual([]);
  });

  it('excludes retired rules unless asked for', () => {
    expect(ids(searchRules(standardLibrary(), { q: 'voucher' }))).toEqual([]);
    expect(ids(searchRules(standardLibrary(), { q: 'voucher', status: 'retired' }))).toEqual(['test-old-voucher-rule']);
  });

  it('lists everything public by id when there is no query', () => {
    expect(ids(searchRules(standardLibrary(), {}))).toEqual(['test-cancelled-refund', 'test-tarmac-delay']);
  });
});

describe('GET /api/rules', () => {
  it('returns summaries and a count', async () => {
    setLibrary(standardLibrary());
    const body = await (await get(search, '/api/rules?q=tarmac')).json();
    expect(body.data.count).toBe(1);
    expect(body.data.rules[0]).toMatchObject({ id: 'test-tarmac-delay', status: 'needs_review' });
    expect(body.data.rules[0].notice).toBeDefined();
  });

  it('rejects status=draft and unknown domains', async () => {
    setLibrary(standardLibrary());
    expect((await get(search, '/api/rules?status=draft')).status).toBe(400);
    expect((await get(search, '/api/rules?domain=cruises')).status).toBe(400);
  });
});

describe('GET /api/rules/changes', () => {
  it('lists public changes since a date, newest first, without drafts', async () => {
    setLibrary(standardLibrary());
    const body = await (await get(changes, '/api/rules/changes?since=2026-09-01')).json();
    expect(body.data.changes).toEqual([
      { rule_id: 'test-tarmac-delay', kind: 'needs_review', from_version: 1, to_version: 2, status: 'needs_review', date: '2026-10-05' },
      { rule_id: 'test-cancelled-refund', kind: 'added', from_version: null, to_version: 1, status: 'verified', date: '2026-10-01' },
    ]);
  });

  it('filters by date and rejects a malformed since', async () => {
    setLibrary(standardLibrary());
    const body = await (await get(changes, '/api/rules/changes?since=2026-10-02')).json();
    expect(body.data.changes).toHaveLength(1);
    expect((await get(changes, '/api/rules/changes?since=last-week')).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run test/rules-api/search-changes.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/rules/route'`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/rules-api/search.ts`:
```ts
import { DOMAINS, RULE_STATUSES, type Domain, type Rule, type RuleStatus, type RulesLibrary } from '@elsewhere/rules';
import { isPublic } from './projection';

const STOPWORDS = new Set([
  'a', 'about', 'am', 'an', 'and', 'are', 'can', 'do', 'does', 'for', 'get', 'how', 'i', 'if', 'in', 'is',
  'it', 'me', 'my', 'of', 'on', 'or', 'the', 'to', 'was', 'what', 'when', 'with', 'you',
]);
const SUFFIXES = ['ations', 'ation', 'ings', 'ing', 'ed', 'es', 's'];

export function stem(word: string): string {
  for (const suffix of SUFFIXES) {
    if (word.length - suffix.length >= 2 && word.endsWith(suffix)) return word.slice(0, -suffix.length);
  }
  return word;
}

export function tokenize(q: string): string[] {
  const words = q.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  return [...new Set(words.map(stem))];
}

export interface SearchParams {
  q?: string;
  domain?: Domain;
  jurisdiction?: string;
  status?: Exclude<RuleStatus, 'draft'>;
  limit?: number;
}

export const DEFAULT_SEARCH_STATUSES: RuleStatus[] = ['verified', 'needs_review'];

function scoreRule(rule: Rule, tokens: string[]): number {
  const title = rule.title.toLowerCase();
  const summary = rule.summary.toLowerCase();
  const tags = rule.tags.map((t) => t.toLowerCase());
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    if (tags.some((tag) => tag.includes(token))) score += 2;
    if (summary.includes(token)) score += 1;
  }
  return score;
}

export function searchRules(library: RulesLibrary, params: SearchParams): Rule[] {
  const statuses: RuleStatus[] = params.status ? [params.status] : DEFAULT_SEARCH_STATUSES;
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 50);
  const candidates = library.rules.filter(
    (r) =>
      isPublic(r) &&
      statuses.includes(r.status) &&
      (!params.domain || r.domain === params.domain) &&
      (!params.jurisdiction || r.jurisdiction === params.jurisdiction),
  );

  if (!params.q) return candidates.sort((a, b) => a.id.localeCompare(b.id)).slice(0, limit);

  const tokens = tokenize(params.q);
  return candidates
    .map((rule) => ({ rule, score: scoreRule(rule, tokens) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id))
    .slice(0, limit)
    .map((s) => s.rule);
}

export function parseSearchParams(url: URL): { ok: true; params: SearchParams } | { ok: false; message: string } {
  const q = url.searchParams.get('q') ?? undefined;
  const domain = url.searchParams.get('domain') ?? undefined;
  const jurisdiction = url.searchParams.get('jurisdiction') ?? undefined;
  const status = url.searchParams.get('status') ?? undefined;
  const limitRaw = url.searchParams.get('limit');

  if (q && q.length > 200) return { ok: false, message: 'q must be 200 characters or fewer.' };
  if (domain && !(DOMAINS as readonly string[]).includes(domain)) {
    return { ok: false, message: `domain must be one of: ${DOMAINS.join(', ')}.` };
  }
  if (jurisdiction && jurisdiction.length > 40) return { ok: false, message: 'jurisdiction is too long.' };
  if (status && (status === 'draft' || !(RULE_STATUSES as readonly string[]).includes(status))) {
    return { ok: false, message: 'status must be one of: verified, needs_review, retired.' };
  }
  const limit = limitRaw === null ? undefined : Number(limitRaw);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 50)) {
    return { ok: false, message: 'limit must be an integer from 1 to 50.' };
  }
  return {
    ok: true,
    params: {
      q,
      domain: domain as Domain | undefined,
      jurisdiction,
      status: status as SearchParams['status'],
      limit,
    },
  };
}
```

Create `apps/web/lib/rules-api/changes.ts`:
```ts
import type { RuleChange, RuleStatus, RulesLibrary } from '@elsewhere/rules';

export type ChangeKind = 'added' | 'changed' | 'needs_review' | 'retired';

export interface PublicChange {
  rule_id: string;
  kind: ChangeKind;
  from_version: number | null;
  to_version: number;
  status: Exclude<RuleStatus, 'draft'>;
  date: string;
}

export function changeKind(change: RuleChange): ChangeKind {
  if (change.to_status === 'retired') return 'retired';
  if (change.to_status === 'needs_review') return 'needs_review';
  if (change.from_status === null || change.from_status === 'draft') return 'added';
  return 'changed';
}

export function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function defaultSince(now: Date = new Date()): string {
  return new Date(now.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
}

/** Newest first (the library's order). Draft transitions are never exposed. */
export function publicChangesSince(library: RulesLibrary, since: string): PublicChange[] {
  return library.changes
    .filter((c) => c.to_status !== 'draft' && c.date.slice(0, 10) >= since)
    .map((c) => ({
      rule_id: c.rule_id,
      kind: changeKind(c),
      from_version: c.from_version,
      to_version: c.to_version,
      status: c.to_status as PublicChange['status'],
      date: c.date.slice(0, 10),
    }));
}
```

Create `apps/web/app/api/rules/route.ts`:
```ts
import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { toRuleSummary } from '@/lib/rules-api/projection';
import { parseSearchParams, searchRules } from '@/lib/rules-api/search';

export const GET = withRulesApi('search', ({ req, library, caller, attribution }) => {
  const parsed = parseSearchParams(new URL(req.url));
  if (!parsed.ok) return { response: jsonError(400, 'invalid_query', parsed.message, { library }) };

  const rules = searchRules(library, parsed.params).map((r) => toRuleSummary(r, library, attribution));
  return {
    response: jsonOk(req, library, envelope(library, { rules, count: rules.length }), caller),
    event: { query: parsed.params.q ?? null, rule_ids: rules.map((r) => r.id), result_count: rules.length },
  };
});
```

Create `apps/web/app/api/rules/changes/route.ts`:
```ts
import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { defaultSince, isIsoDate, publicChangesSince } from '@/lib/rules-api/changes';

export const GET = withRulesApi('changes', ({ req, library, caller }) => {
  const since = new URL(req.url).searchParams.get('since') ?? defaultSince();
  if (!isIsoDate(since)) {
    return { response: jsonError(400, 'invalid_since', 'since must be a date in YYYY-MM-DD form.', { library }) };
  }
  const changes = publicChangesSince(library, since);
  return {
    response: jsonOk(req, library, envelope(library, { since, changes }), caller),
    event: { rule_ids: changes.map((c) => c.rule_id), result_count: changes.length },
  };
});
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && npx vitest run test/rules-api/search-changes.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rules-api/search.ts apps/web/lib/rules-api/changes.ts apps/web/app/api/rules/route.ts apps/web/app/api/rules/changes apps/web/test/rules-api/search-changes.test.ts
git commit -m "Add rule search and the recent-changes feed

Search ranks by title, tags, then summary with light stemming. Changes
report added, changed, re-checking, and retired rules since a date.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 9: `POST /api/rules/match` and the shared golden fixtures

**Files:**
- Create: `apps/web/lib/rules-api/situation.ts`, `apps/web/lib/rules-api/match-situation.ts`, `apps/web/app/api/rules/match/route.ts`
- Test: `apps/web/test/rules-api/match.test.ts`

**Interfaces:**
- Consumes: `FACTS`, `validateSituation`, `matchRules`, `FactName`, `Primitive`, `Situation`, `RuleStatus`, `RulesLibrary` from `@elsewhere/rules`; `toPublicRule` (Task 3); `withRulesApi` (Task 7); `envelope`, `jsonOk`, `jsonError` (Task 4); golden helpers (Task 2).
- Produces:
  - `situation.ts`: `interface FactError { fact: string; message: string }`, `parseSituation(input: unknown): { ok: true; situation: Situation } | { ok: false; errors: FactError[] }`, `knownFactNames(input: unknown): FactName[]`.
  - `match-situation.ts`: `MATCHABLE_STATUSES: RuleStatus[]` (`['verified', 'needs_review']`), `matchSituation(library, situation, attribution): MatchResponse`.
  - Request body `{ "facts": { "<fact>": <value> } }`; response `data: MatchResponse`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/rules-api/match.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/rules/match/route';
import { parseSituation } from '@/lib/rules-api/situation';
import { setLibrary } from '../helpers/library-holder';
import { fixtureRule, goldenCases, makeLibrary, standardLibrary } from '../helpers/fixture-library';

function post(body: unknown): Promise<Response> {
  return POST(
    new Request('https://elsewhere.test/api/rules/match', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

const sorted = (xs: string[]) => [...xs].sort();

describe('parseSituation', () => {
  it('accepts known facts with valid values', () => {
    expect(parseSituation({ facts: { 'event.type': 'cancellation', 'flight.touches_us': true } })).toEqual({
      ok: true,
      situation: { 'event.type': 'cancellation', 'flight.touches_us': true },
    });
  });

  it('collects every unknown or ill-typed fact', () => {
    const result = parseSituation({ facts: { 'event.kind': 'x', 'flight.touches_us': 'yes', 'event.type': 'meteor' } });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(sorted(result.errors.map((e) => e.fact))).toEqual(['event.kind', 'event.type', 'flight.touches_us']);
  });

  it('rejects a body without facts or with no facts', () => {
    expect(parseSituation({}).ok).toBe(false);
    expect(parseSituation({ facts: {} }).ok).toBe(false);
  });
});

describe('POST /api/rules/match', () => {
  it('splits rules into applies and may_apply with missing facts', async () => {
    setLibrary(standardLibrary());
    const full = await (await post({ facts: { 'event.type': 'cancellation', 'flight.touches_us': true, 'passenger.accepted_alternative': false } })).json();
    expect(full.data.applies.map((r: { id: string }) => r.id)).toEqual(['test-cancelled-refund']);
    expect(full.data.applies[0].citations.length).toBeGreaterThan(0);

    const partial = await (await post({ facts: { 'event.type': 'cancellation' } })).json();
    expect(partial.data.applies).toEqual([]);
    expect(partial.data.may_apply[0].id).toBe('test-cancelled-refund');
    expect(sorted(partial.data.may_apply[0].missing_facts)).toEqual(['flight.touches_us', 'passenger.accepted_alternative']);
  });

  it('never matches drafts or retired rules, even with identical conditions', async () => {
    setLibrary(standardLibrary());
    const body = await (await post({ facts: { 'event.type': 'cancellation', 'flight.touches_us': true, 'passenger.accepted_alternative': false } })).json();
    const all = [...body.data.applies, ...body.data.may_apply].map((r: { id: string }) => r.id);
    expect(all).not.toContain('test-draft-rule');
    expect(all).not.toContain('test-old-voucher-rule');
    expect(body.data.does_not_apply_count).toBe(1);
  });

  it('is never cached', async () => {
    setLibrary(standardLibrary());
    const res = await post({ facts: { 'event.type': 'delay' } });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('returns 400 for invalid JSON and for invalid facts, pointing to the vocabulary', async () => {
    setLibrary(standardLibrary());
    expect((await post('{nope')).status).toBe(400);
    const res = await post({ facts: { 'event.kind': 'x' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('invalid_facts');
    expect(body.error.message).toContain('/api/rules/facts');
    expect(body.error.details.errors[0].fact).toBe('event.kind');
  });
});

describe('golden match fixtures through POST /api/rules/match', () => {
  const cases = goldenCases();

  it('has fixtures to run', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const golden of cases) {
    it(`${golden.file}: ${golden.name}`, async () => {
      const rules = golden.rules.map(fixtureRule);
      setLibrary(makeLibrary(rules));
      const res = await post({ facts: golden.situation });
      expect(res.status).toBe(200);
      const { data } = await res.json();

      // Track A's expectations use matchRules' default statuses (verified only).
      const verified = new Set(rules.filter((r) => r.status === 'verified').map((r) => r.id));
      const appliesIds: string[] = data.applies.map((r: { id: string }) => r.id).filter((id: string) => verified.has(id));
      const mayApply = data.may_apply
        .filter((r: { id: string }) => verified.has(r.id))
        .map((r: { id: string; missing_facts: string[] }) => `${r.id}:${sorted(r.missing_facts).join(',')}`);

      expect(sorted(appliesIds)).toEqual(sorted(golden.expect.filter((e) => e.outcome === 'applies').map((e) => e.rule_id)));
      expect(sorted(mayApply)).toEqual(
        sorted(golden.expect.filter((e) => e.outcome === 'may_apply').map((e) => `${e.rule_id}:${sorted(e.missing_facts).join(',')}`)),
      );
      for (const e of golden.expect.filter((x) => x.outcome === 'does_not_apply')) {
        expect([...appliesIds, ...mayApply.map((m: string) => m.split(':')[0])]).not.toContain(e.rule_id);
      }
    });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run test/rules-api/match.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/rules/match/route'`.

- [ ] **Step 3: Implement**

Create `apps/web/lib/rules-api/situation.ts`:
```ts
import { FACTS, validateSituation, type FactName, type Primitive, type Situation } from '@elsewhere/rules';

export interface FactError {
  fact: string;
  message: string;
}

const VOCABULARY_HINT = 'Call list_facts or GET /api/rules/facts for valid fact names and values.';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseSituation(input: unknown): { ok: true; situation: Situation } | { ok: false; errors: FactError[] } {
  if (!isPlainObject(input) || !isPlainObject(input.facts)) {
    return { ok: false, errors: [{ fact: '(body)', message: 'Expected { "facts": { "<fact>": <value> } }.' }] };
  }
  const entries = Object.entries(input.facts);
  if (entries.length === 0) {
    return { ok: false, errors: [{ fact: '(facts)', message: `Provide at least one fact. ${VOCABULARY_HINT}` }] };
  }

  const errors: FactError[] = [];
  const situation: Situation = {};
  for (const [name, value] of entries) {
    if (!(name in FACTS)) {
      errors.push({ fact: name, message: `Unknown fact. ${VOCABULARY_HINT}` });
      continue;
    }
    if (!['string', 'number', 'boolean'].includes(typeof value)) {
      errors.push({ fact: name, message: 'Value must be a string, number, or boolean.' });
      continue;
    }
    try {
      validateSituation({ [name]: value } as Situation);
      situation[name as FactName] = value as Primitive;
    } catch (error) {
      errors.push({ fact: name, message: error instanceof Error ? error.message : 'Invalid value.' });
    }
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, situation };
}

/** Known fact names from an untrusted body, for analytics. Unknown names are never stored. */
export function knownFactNames(input: unknown): FactName[] {
  if (!isPlainObject(input) || !isPlainObject(input.facts)) return [];
  return Object.keys(input.facts).filter((name): name is FactName => name in FACTS);
}
```

Create `apps/web/lib/rules-api/match-situation.ts`:
```ts
import { matchRules, type RuleStatus, type RulesLibrary, type Situation } from '@elsewhere/rules';
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
```

Create `apps/web/app/api/rules/match/route.ts`:
```ts
import { withRulesApi } from '@/lib/rules-api/handle';
import { envelope, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { matchSituation } from '@/lib/rules-api/match-situation';
import { knownFactNames, parseSituation } from '@/lib/rules-api/situation';

export const POST = withRulesApi('match', async ({ req, library, caller, attribution }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return { response: jsonError(400, 'invalid_json', 'The request body must be JSON.', { library }) };
  }

  const parsed = parseSituation(body);
  if (!parsed.ok) {
    return {
      response: jsonError(400, 'invalid_facts', 'Some facts are unknown or have the wrong type. See GET /api/rules/facts.', {
        library,
        details: { errors: parsed.errors },
      }),
      event: { fact_names: knownFactNames(body) },
    };
  }

  const result = matchSituation(library, parsed.situation, attribution);
  const eventType = parsed.situation['event.type'];
  return {
    response: jsonOk(req, library, envelope(library, result), caller, { cacheable: false }),
    event: {
      fact_names: Object.keys(parsed.situation),
      event_type: typeof eventType === 'string' ? eventType : null,
      rule_ids: [...result.applies, ...result.may_apply].map((r) => r.id),
      missing_facts: [...new Set(result.may_apply.flatMap((r) => r.missing_facts))],
      result_count: result.applies.length + result.may_apply.length,
    },
  };
});
```

- [ ] **Step 4: Run the tests**

Run: `cd apps/web && npx vitest run test/rules-api/match.test.ts`
Expected: PASS — 7 tests plus one per golden fixture file.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/rules-api/situation.ts apps/web/lib/rules-api/match-situation.ts apps/web/app/api/rules/match apps/web/test/rules-api/match.test.ts
git commit -m "Add situation matching over the shared matcher and golden fixtures

POST /api/rules/match validates every fact against the vocabulary and
runs Track A's matchRules, so the API can't drift from Assist.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 10: The MCP server — five read-only tools at `/api/mcp`

**Files:**
- Create: `apps/web/lib/mcp/instructions.ts`, `apps/web/lib/mcp/client-info.ts`, `apps/web/lib/mcp/text.ts`, `apps/web/lib/mcp/tools.ts`, `apps/web/lib/mcp/route-handler.ts`
- Create: `apps/web/app/api/mcp/route.ts`
- Test: `apps/web/test/mcp/mcp.test.ts`

**Interfaces:**
- Consumes: `createMcpHandler`, `withMcpAuth` from `mcp-handler` (2.2.0: `createMcpHandler(initializeServer: (server: McpServer) => void, options?: ServerOptions & { serverInfo?; verboseLogs?; onEvent? }) => (req: Request) => Promise<Response>`; `withMcpAuth(handler, verifyToken: (req, bearerToken?) => AuthInfo | undefined | Promise<…>, { required?: boolean })`); `McpServer`, `ServerContext`, `CallToolResult`, `CLIENT_INFO_META_KEY` from `@modelcontextprotocol/server` 2.2.0 (`registerTool(name, { title, description, inputSchema?, outputSchema?, annotations }, cb)`; with an `inputSchema` the callback is `(args, ctx)`, without it `(ctx)`; `ctx.mcpReq.envelope` holds the 2026-era per-request `_meta` envelope; `ctx.http?.authInfo` holds the verified token). Everything from Tasks 3–9.
- Produces: `SERVER_INFO`, `SERVER_INSTRUCTIONS`; `requestContext: AsyncLocalStorage<{ userAgent: string | null }>`, `clientFromContext(ctx): { name: string | null; version: string | null }`, `callerFromContext(ctx): ApiCaller`; `DISCLAIMER`, `ruleText`, `searchText`, `matchText`, `factsText`, `changesText`; `registerRuleTools(server: McpServer): void`; `handleMcp(req: Request): Promise<Response>`.

Client attribution: 2026-07-28 clients send `clientInfo` in every request's `_meta` envelope under `io.modelcontextprotocol/clientInfo`. Stateless 2025-era clients send it only at `initialize`, so tool calls fall back to the HTTP `User-Agent`, captured per request in `AsyncLocalStorage`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/mcp/mcp.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { after } from 'next/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { handleMcp } from '@/lib/mcp/route-handler';
import { setLibrary } from '../helpers/library-holder';
import { fixtureRule, goldenCases, makeLibrary, standardLibrary } from '../helpers/fixture-library';

const open: Client[] = [];

async function connect(): Promise<Client> {
  const client = new Client({ name: 'vitest', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://elsewhere.test/api/mcp'), {
    fetch: (url, init) => handleMcp(new Request(url, init)),
  });
  await client.connect(transport);
  open.push(client);
  return client;
}

function text(result: { content?: unknown }): string {
  const blocks = (result.content ?? []) as { type: string; text?: string }[];
  return blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

describe('MCP server', () => {
  it('lists exactly five read-only, titled tools', async () => {
    setLibrary(standardLibrary());
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_rule', 'list_facts', 'list_recent_changes', 'match_situation', 'search_rules']);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.title ?? tool.annotations?.title).toBeTruthy();
    }
  });

  it('sends server instructions about citations, page links, and legal advice', async () => {
    setLibrary(standardLibrary());
    const instructions = (await connect()).getInstructions() ?? '';
    expect(instructions).toContain('page_url');
    expect(instructions).toContain('not legal advice');
    expect(instructions).toContain('needs_review');
  });

  it('search_rules returns summaries with mcp-tagged links and a disclaimer', async () => {
    setLibrary(standardLibrary());
    const result = await (await connect()).callTool({ name: 'search_rules', arguments: { query: 'cancelled flight refund' } });
    const rules = (result.structuredContent as { rules: { id: string; page_url: string }[] }).rules;
    expect(rules[0].id).toBe('test-cancelled-refund');
    expect(rules[0].page_url).toContain('utm_source=mcp');
    expect(text(result)).toContain('not legal advice');
    expect(text(result)).toContain(rules[0].page_url);
    expect(after).toHaveBeenCalled();
  });

  it('never leaks drafts through any tool', async () => {
    setLibrary(standardLibrary());
    const client = await connect();
    const search = await client.callTool({ name: 'search_rules', arguments: { query: 'secret draft rule' } });
    expect((search.structuredContent as { rules: unknown[] }).rules).toEqual([]);
    expect(text(search)).not.toContain('Secret draft rule');

    const get = await client.callTool({ name: 'get_rule', arguments: { id: 'test-draft-rule' } });
    expect(get.isError).toBe(true);
    expect(text(get)).toContain('No public rule');
    expect(text(get)).not.toContain('Secret draft rule');
  });

  it('get_rule returns notices, replacements, citations, and ends with the rule page link', async () => {
    setLibrary(standardLibrary());
    const client = await connect();
    const review = await client.callTool({ name: 'get_rule', arguments: { id: 'test-tarmac-delay' } });
    expect((review.structuredContent as { rule: { notice: string } }).rule.notice).toMatch(/Being re-checked/);
    const retired = await client.callTool({ name: 'get_rule', arguments: { id: 'test-old-voucher-rule' } });
    expect((retired.structuredContent as { rule: { replaced_by: string } }).rule.replaced_by).toBe('test-cancelled-refund');
    const verified = await client.callTool({ name: 'get_rule', arguments: { id: 'test-cancelled-refund' } });
    const lines = text(verified).trim().split('\n');
    expect(lines.at(-2)).toMatch(/^Source: https:\/\/example\.test\/source/);
    expect(lines.at(-1)).toMatch(/^Rule page: https:\/\/elsewhere\.test\/rules\/test-cancelled-refund\?/);
  });

  it('match_situation rejects unknown facts and points to list_facts', async () => {
    setLibrary(standardLibrary());
    const result = await (await connect()).callTool({ name: 'match_situation', arguments: { facts: { 'event.kind': 'x' } } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('list_facts');
  });

  it('list_facts and list_recent_changes answer from the library', async () => {
    setLibrary(standardLibrary());
    const client = await connect();
    const facts = await client.callTool({ name: 'list_facts', arguments: {} });
    expect((facts.structuredContent as { facts: { name: string }[] }).facts.map((f) => f.name)).toContain('event.type');
    const changes = await client.callTool({ name: 'list_recent_changes', arguments: { since: '2026-10-02' } });
    expect((changes.structuredContent as { changes: { rule_id: string }[] }).changes.map((c) => c.rule_id)).toEqual(['test-tarmac-delay']);
  });

  it('rejects an invalid partner key with 401 before reaching MCP', async () => {
    const res = await handleMcp(
      new Request('https://elsewhere.test/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer els_wrongwrongwrongwrongwrongwrongwron', 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('golden match fixtures through match_situation', () => {
  const cases = goldenCases();

  it('has fixtures to run', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const golden of cases) {
    it(`${golden.file}: ${golden.name}`, async () => {
      const rules = golden.rules.map(fixtureRule);
      setLibrary(makeLibrary(rules));
      const result = await (await connect()).callTool({ name: 'match_situation', arguments: { facts: golden.situation } });
      expect(result.isError).toBeFalsy();
      const data = result.structuredContent as { applies: { id: string }[]; may_apply: { id: string; missing_facts: string[] }[] };
      const verified = new Set(rules.filter((r) => r.status === 'verified').map((r) => r.id));
      const sorted = (xs: string[]) => [...xs].sort();
      expect(sorted(data.applies.map((r) => r.id).filter((id) => verified.has(id)))).toEqual(
        sorted(golden.expect.filter((e) => e.outcome === 'applies').map((e) => e.rule_id)),
      );
      expect(sorted(data.may_apply.filter((r) => verified.has(r.id)).map((r) => `${r.id}:${sorted(r.missing_facts).join(',')}`))).toEqual(
        sorted(golden.expect.filter((e) => e.outcome === 'may_apply').map((e) => `${e.rule_id}:${sorted(e.missing_facts).join(',')}`)),
      );
    });
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run test/mcp/mcp.test.ts`
Expected: FAIL — `Cannot find module '@/lib/mcp/route-handler'`.

- [ ] **Step 3: Implement the shared MCP pieces**

Create `apps/web/lib/mcp/instructions.ts`:
```ts
export const SERVER_INFO = { name: 'elsewhere-rules', version: '1.0.0' };

export const SERVER_INSTRUCTIONS = [
  "Elsewhere publishes travel rules verified word-for-word against primary sources: regulations, government pages, and airlines' own contracts and commitments.",
  'When a user asks about travel rights, refunds, compensation, delays, bags, travel documents, card perks, or hotel and booking rules:',
  '- Answer from these tools, not from memory. Use match_situation when you know facts about the trip (call list_facts for valid names); otherwise use search_rules, then get_rule.',
  '- Quote at least one citation from the rule.',
  "- Include the rule's page_url so the user can read the full rule and next steps.",
  '- If a rule has status needs_review, say it is being re-checked after a source change.',
  '- Say this is information, not legal advice.',
].join('\n');
```

Create `apps/web/lib/mcp/client-info.ts`:
```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { CLIENT_INFO_META_KEY, type ServerContext } from '@modelcontextprotocol/server';
import type { ApiCaller } from '@/lib/rules-api/types';

/** Per-HTTP-request data the MCP context doesn't carry. */
export const requestContext = new AsyncLocalStorage<{ userAgent: string | null }>();

export function clientFromContext(ctx: ServerContext): { name: string | null; version: string | null } {
  const envelope = ctx.mcpReq.envelope as Record<string, unknown> | undefined;
  const info = envelope?.[CLIENT_INFO_META_KEY] as { name?: unknown; version?: unknown } | undefined;
  if (info && typeof info.name === 'string') {
    return { name: info.name, version: typeof info.version === 'string' ? info.version : null };
  }
  return { name: requestContext.getStore()?.userAgent ?? null, version: null };
}

export function callerFromContext(ctx: ServerContext): ApiCaller {
  const auth = ctx.http?.authInfo;
  if (!auth) return { tier: 'anonymous' };
  return {
    tier: 'partner',
    keyId: String(auth.extra?.keyId ?? ''),
    partnerId: auth.clientId,
    rateLimitRule: String(auth.extra?.rateLimitRule ?? 'rules-partner'),
  };
}
```

Create `apps/web/lib/mcp/text.ts`:
```ts
import type { PublicChange } from '@/lib/rules-api/changes';
import type { FactEntry } from '@/lib/rules-api/facts-vocabulary';
import type { MatchResponse, PublicRule, RuleSummary } from '@/lib/rules-api/types';

export const DISCLAIMER = "Information from Elsewhere's verified rules library, not legal advice.";

function linkLines(rule: PublicRule): string[] {
  const citation = rule.citations[0];
  return [
    ...(citation ? [`Source: ${citation.url} — "${citation.quote}"`] : []),
    `Rule page: ${rule.page_url}`,
  ];
}

/** Ends with the source link, then the rule page link. */
export function ruleText(rule: PublicRule): string {
  const lines = [DISCLAIMER, '', `${rule.title} (${rule.status})`, rule.summary];
  if (rule.notice) lines.push(rule.notice);
  if (rule.replaced_by) lines.push(`Replaced by rule ${rule.replaced_by}.`);
  if (rule.how_to_claim.steps.length > 0) {
    lines.push('What to do:', ...rule.how_to_claim.steps.map((step, i) => `${i + 1}. ${step}`));
  }
  if (rule.exceptions.length > 0) lines.push('Exceptions:', ...rule.exceptions.map((e) => `- ${e}`));
  lines.push(...linkLines(rule));
  return lines.join('\n');
}

export function searchText(rules: RuleSummary[]): string {
  if (rules.length === 0) {
    return `${DISCLAIMER}\n\nNo verified rule matched that search. Try other words, or match_situation with known facts.`;
  }
  return [
    DISCLAIMER,
    '',
    ...rules.map((r) => `- ${r.title} (${r.status}${r.notice ? ', being re-checked' : ''}): ${r.summary}\n  Rule page: ${r.page_url}`),
  ].join('\n');
}

export function matchText(result: MatchResponse): string {
  if (result.applies.length === 0 && result.may_apply.length === 0) {
    return `${DISCLAIMER}\n\nNo verified rule matches these facts.`;
  }
  const parts = [DISCLAIMER];
  if (result.applies.length > 0) {
    parts.push('', 'Applies:', ...result.applies.map((r) => [`- ${r.title}: ${r.summary}`, ...linkLines(r).map((l) => `  ${l}`)].join('\n')));
  }
  if (result.may_apply.length > 0) {
    parts.push(
      '',
      'May apply (more facts needed):',
      ...result.may_apply.map((r) =>
        [`- ${r.title} — still need: ${r.missing_facts.join(', ')}`, ...linkLines(r).map((l) => `  ${l}`)].join('\n'),
      ),
    );
  }
  return parts.join('\n');
}

export function factsText(facts: FactEntry[]): string {
  return facts
    .map((f) => `- ${f.name} (${f.type}${f.values ? `: ${f.values.join(' | ')}` : ''}): ${f.description}`)
    .join('\n');
}

export function changesText(since: string, changes: PublicChange[]): string {
  if (changes.length === 0) return `No rule changes since ${since}.`;
  return [`Rule changes since ${since}:`, ...changes.map((c) => `- ${c.date} ${c.rule_id}: ${c.kind} (v${c.to_version})`)].join('\n');
}
```

- [ ] **Step 4: Implement the tools and the route**

Create `apps/web/lib/mcp/tools.ts`:
```ts
import { z } from 'zod';
import type { CallToolResult, McpServer, ServerContext } from '@modelcontextprotocol/server';
import { DOMAINS, type RulesLibrary } from '@elsewhere/rules';
import { getLibrary } from '@/lib/rules/library';
import { scheduleEvent, type RulesApiEvent } from '@/lib/rules-api/analytics';
import { isIsoDate, publicChangesSince } from '@/lib/rules-api/changes';
import { factsVocabulary } from '@/lib/rules-api/facts-vocabulary';
import { matchSituation } from '@/lib/rules-api/match-situation';
import { isPublic, toPublicRule, toRuleSummary } from '@/lib/rules-api/projection';
import { searchRules } from '@/lib/rules-api/search';
import { knownFactNames, parseSituation } from '@/lib/rules-api/situation';
import type { LinkAttribution } from '@/lib/rules-api/types';
import { callerFromContext, clientFromContext } from './client-info';
import { changesText, factsText, matchText, ruleText, searchText } from './text';

const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;
const RULE_ID = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(80);

const CitationOut = z.looseObject({ url: z.string(), kind: z.string(), quote: z.string() });
const PublicRuleOut = z.looseObject({
  id: z.string(),
  version: z.number(),
  status: z.string(),
  title: z.string(),
  summary: z.string(),
  citations: z.array(CitationOut),
  page_url: z.string(),
});
const RuleSummaryOut = z.looseObject({ id: z.string(), title: z.string(), status: z.string(), page_url: z.string() });

type EventFields = Partial<Pick<RulesApiEvent, 'rule_ids' | 'fact_names' | 'event_type' | 'missing_facts' | 'query' | 'result_count'>>;
interface ToolDeps {
  library: RulesLibrary;
  attribution: LinkAttribution;
}
interface ToolOutcome {
  result: CallToolResult;
  event?: EventFields;
}

export function errorResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function ok(structured: Record<string, unknown>, text: string): CallToolResult {
  return { structuredContent: structured, content: [{ type: 'text', text }] };
}

function runTool(tool: string, ctx: ServerContext, work: (deps: ToolDeps) => ToolOutcome): CallToolResult {
  const started = Date.now();
  const client = clientFromContext(ctx);
  const caller = callerFromContext(ctx);

  let library: RulesLibrary;
  try {
    library = getLibrary();
  } catch {
    return errorResult('The rules library is temporarily unavailable. Try again shortly.');
  }

  let outcome: ToolOutcome;
  try {
    outcome = work({ library, attribution: { source: 'mcp', medium: client.name ?? 'unknown' } });
  } catch (error) {
    console.error(`[mcp] ${tool} failed:`, error);
    outcome = { result: errorResult('Something went wrong answering this request. Try again.') };
  }

  scheduleEvent({
    surface: 'mcp',
    endpoint: tool,
    status: outcome.result.isError ? 400 : 200,
    client_name: client.name,
    client_version: client.version,
    tier: caller.tier,
    key_id: caller.tier === 'partner' ? caller.keyId : null,
    rule_ids: [],
    fact_names: [],
    event_type: null,
    missing_facts: [],
    query: null,
    result_count: 0,
    ...outcome.event,
    library_version: library.library_version,
    latency_ms: Date.now() - started,
  });
  return outcome.result;
}

export function registerRuleTools(server: McpServer): void {
  server.registerTool(
    'search_rules',
    {
      title: 'Search travel rules',
      description:
        "Search Elsewhere's verified travel rules (flight refunds and compensation, delays, bags, travel documents, card perks, hotel and booking rules) by keywords. Returns up to 10 rules with status and page_url. Use get_rule for full details and citations.",
      inputSchema: z.object({
        query: z.string().min(1).max(200),
        domain: z.enum(DOMAINS).optional(),
        jurisdiction: z.string().max(40).optional(),
      }),
      outputSchema: z.object({ rules: z.array(RuleSummaryOut) }),
      annotations: { title: 'Search travel rules', ...READ_ONLY },
    },
    async (args, ctx) =>
      runTool('search_rules', ctx, ({ library, attribution }) => {
        const rules = searchRules(library, { q: args.query, domain: args.domain, jurisdiction: args.jurisdiction, limit: 10 }).map(
          (r) => toRuleSummary(r, library, attribution),
        );
        return {
          result: ok({ rules }, searchText(rules)),
          event: { query: args.query, rule_ids: rules.map((r) => r.id), result_count: rules.length },
        };
      }),
  );

  server.registerTool(
    'get_rule',
    {
      title: 'Get a travel rule',
      description:
        "Get one verified travel rule by id: what you're owed, how to claim it, exceptions, and word-for-word citations from the primary source.",
      inputSchema: z.object({ id: RULE_ID }),
      outputSchema: z.object({ rule: PublicRuleOut }),
      annotations: { title: 'Get a travel rule', ...READ_ONLY },
    },
    async (args, ctx) =>
      runTool('get_rule', ctx, ({ library, attribution }) => {
        const rule = library.rules.find((r) => r.id === args.id && isPublic(r));
        if (!rule) {
          return { result: errorResult(`No public rule with id "${args.id}". Use search_rules to find rule ids.`) };
        }
        const pub = toPublicRule(rule, library, attribution);
        return { result: ok({ rule: pub }, ruleText(pub)), event: { rule_ids: [pub.id], result_count: 1 } };
      }),
  );

  server.registerTool(
    'match_situation',
    {
      title: 'Match a travel situation to rules',
      description:
        "Given facts about a traveler's situation (for example event.type=cancellation, flight.touches_us=true, passenger.accepted_alternative=false), return the rules that apply, the rules that may apply plus the facts still needed, and their citations. Call list_facts first for valid fact names and values.",
      inputSchema: z.object({ facts: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }),
      outputSchema: z.object({
        applies: z.array(PublicRuleOut),
        may_apply: z.array(PublicRuleOut.extend({ missing_facts: z.array(z.string()) })),
        does_not_apply_count: z.number(),
      }),
      annotations: { title: 'Match a travel situation to rules', ...READ_ONLY },
    },
    async (args, ctx) =>
      runTool('match_situation', ctx, ({ library, attribution }) => {
        const parsed = parseSituation({ facts: args.facts });
        if (!parsed.ok) {
          return {
            result: errorResult(
              `Unknown or invalid facts: ${parsed.errors.map((e) => `${e.fact} (${e.message})`).join('; ')}. Call list_facts for valid names and values.`,
            ),
            event: { fact_names: knownFactNames({ facts: args.facts }) },
          };
        }
        const result = matchSituation(library, parsed.situation, attribution);
        const eventType = parsed.situation['event.type'];
        return {
          result: ok({ ...result }, matchText(result)),
          event: {
            fact_names: Object.keys(parsed.situation),
            event_type: typeof eventType === 'string' ? eventType : null,
            rule_ids: [...result.applies, ...result.may_apply].map((r) => r.id),
            missing_facts: [...new Set(result.may_apply.flatMap((r) => r.missing_facts))],
            result_count: result.applies.length + result.may_apply.length,
          },
        };
      }),
  );

  server.registerTool(
    'list_facts',
    {
      title: 'List situation facts',
      description: 'List the fact names, types, and allowed values that match_situation accepts.',
      outputSchema: z.object({
        facts: z.array(z.looseObject({ name: z.string(), type: z.string(), description: z.string() })),
      }),
      annotations: { title: 'List situation facts', ...READ_ONLY },
    },
    async (ctx) =>
      runTool('list_facts', ctx, () => {
        const facts = factsVocabulary();
        return { result: ok({ facts }, factsText(facts)), event: { result_count: facts.length } };
      }),
  );

  server.registerTool(
    'list_recent_changes',
    {
      title: 'List recent rule changes',
      description: 'List rules added, changed, sent for re-checking, or retired since a date (YYYY-MM-DD).',
      inputSchema: z.object({ since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
      outputSchema: z.object({
        since: z.string(),
        changes: z.array(z.looseObject({ rule_id: z.string(), kind: z.string(), date: z.string() })),
      }),
      annotations: { title: 'List recent rule changes', ...READ_ONLY },
    },
    async (args, ctx) =>
      runTool('list_recent_changes', ctx, ({ library }) => {
        if (!isIsoDate(args.since)) return { result: errorResult('since must be a real date in YYYY-MM-DD form.') };
        const changes = publicChangesSince(library, args.since);
        return {
          result: ok({ since: args.since, changes }, changesText(args.since, changes)),
          event: { rule_ids: changes.map((c) => c.rule_id), result_count: changes.length },
        };
      }),
  );
}
```

Create `apps/web/lib/mcp/route-handler.ts`:
```ts
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { lookupKey, resolveCaller } from '@/lib/rules-api/auth';
import { jsonError } from '@/lib/rules-api/envelope';
import { enforceRateLimit } from '@/lib/rules-api/rate-limit';
import { requestContext } from './client-info';
import { SERVER_INFO, SERVER_INSTRUCTIONS } from './instructions';
import { registerRuleTools } from './tools';

const mcpHandler = createMcpHandler(
  (server) => {
    registerRuleTools(server);
  },
  { serverInfo: SERVER_INFO, instructions: SERVER_INSTRUCTIONS },
);

// Anonymous callers pass through; a valid partner key populates ctx.http.authInfo.
const authedHandler = withMcpAuth(
  mcpHandler,
  async (_req, bearerToken) => {
    if (!bearerToken) return undefined;
    const record = await lookupKey(bearerToken);
    if (!record) return undefined;
    return {
      token: bearerToken,
      clientId: record.partnerId,
      scopes: ['rules:read'],
      extra: { keyId: record.keyId, rateLimitRule: record.rateLimitRule },
    };
  },
  { required: false },
);

export async function handleMcp(req: Request): Promise<Response> {
  // An invalid key is a 401 here, not a silent downgrade to anonymous.
  const caller = await resolveCaller(req);
  if (caller === 'invalid') {
    return jsonError(401, 'invalid_key', 'The API key is invalid or revoked.', {
      headers: { 'WWW-Authenticate': 'Bearer error="invalid_token"' },
    });
  }
  const limited = await enforceRateLimit(req, caller, 'mcp');
  if (limited) return limited;
  return requestContext.run({ userAgent: req.headers.get('user-agent') }, () => authedHandler(req));
}
```

Create `apps/web/app/api/mcp/route.ts`:
```ts
import { handleMcp } from '@/lib/mcp/route-handler';

export const GET = handleMcp;
export const POST = handleMcp;
```

- [ ] **Step 5: Run the MCP tests, the whole suite, and typecheck**

Run: `cd apps/web && npx vitest run test/mcp/mcp.test.ts && npm test && npm run typecheck`
Expected: all PASS; typecheck clean. If `listTools` reports the title only under `annotations.title`, the test already accepts either.

- [ ] **Step 6: Smoke-test against the dev server**

Run, in one shell: `cd apps/web && npm run dev`
In another:
```bash
npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --method tools/list | head -40
npx @modelcontextprotocol/inspector --cli http://localhost:3000/api/mcp --method tools/call --tool-name search_rules --tool-arg query="cancelled flight"
```
Expected: five tools listed; the search returns structured content with `page_url` values containing `utm_source=mcp`. (Needs `dist/rules.json` with at least one verified rule; if Track A has none yet, an empty `rules` array is the correct answer.)

- [ ] **Step 7: Commit**

```bash
git add apps/web/lib/mcp apps/web/app/api/mcp apps/web/test/mcp
git commit -m "Serve the rules library over MCP with five read-only tools

search_rules, get_rule, match_situation, list_facts, and
list_recent_changes share the API's projection and matcher, cite
sources, link rule pages, and never return drafts.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 11: Terms of use page and the weekly report

**Files:**
- Create: `apps/web/app/(public)/rules/terms/page.tsx`
- Create: `apps/web/lib/rules-api/report.ts`, `apps/web/scripts/rules-api-report.ts`
- Create: `.github/workflows/rules-api-report.yml`
- Test: `apps/web/test/rules-api/report.test.ts`

**Interfaces:**
- Consumes: `createAdminClient`; `rules_api_events` columns (Task 5); `funnel_telemetry_events` (`event_name text`, `metadata jsonb`, `created_at`) from the existing schema, kept by Track C.
- Produces: `interface ReportRow`, `interface FunnelRow`, `aggregateReport(rows: ReportRow[], funnel: FunnelRow[], opts: { since: string; until: string }): string`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/test/rules-api/report.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { aggregateReport, type ReportRow } from '@/lib/rules-api/report';

const row = (overrides: Partial<ReportRow>): ReportRow => ({
  surface: 'mcp',
  endpoint: 'search_rules',
  client_name: 'ChatGPT',
  rule_ids: [],
  missing_facts: [],
  query: null,
  result_count: 1,
  status: 200,
  ...overrides,
});

describe('aggregateReport', () => {
  const rows: ReportRow[] = [
    row({ rule_ids: ['a', 'b'] }),
    row({ rule_ids: ['a'], client_name: 'claude-ai' }),
    row({ endpoint: 'search', surface: 'api', query: 'lost passport abroad', result_count: 0, rule_ids: [] }),
    row({ endpoint: 'search_rules', query: 'lost passport abroad', result_count: 0 }),
    row({ endpoint: 'match_situation', missing_facts: ['flight.touches_us', 'passenger.accepted_alternative'] }),
    row({ endpoint: 'match', surface: 'api', missing_facts: ['flight.touches_us'] }),
  ];
  const funnel = [
    { event_name: 'rule_page_view', metadata: { utm_source: 'mcp' } },
    { event_name: 'rule_page_view', metadata: { utm_source: 'mcp' } },
    { event_name: 'booking_forwarded', metadata: { utm_source: 'api' } },
  ];
  const md = aggregateReport(rows, funnel, { since: '2026-10-01', until: '2026-10-08' });

  it('ranks the most-returned rules', () => {
    expect(md).toContain('| a | 2 |');
    expect(md).toContain('| b | 1 |');
  });

  it('lists zero-result searches across API and MCP', () => {
    expect(md).toContain('| lost passport abroad | 2 |');
  });

  it('ranks missing facts', () => {
    expect(md).toContain('| flight.touches_us | 2 |');
  });

  it('counts agent-referred funnel events by step and source', () => {
    expect(md).toContain('| rule_page_view | mcp | 2 |');
    expect(md).toContain('| booking_forwarded | api | 1 |');
  });

  it('names the window and totals', () => {
    expect(md).toContain('2026-10-01 → 2026-10-08');
    expect(md).toContain('6 calls');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/web && npx vitest run test/rules-api/report.test.ts`
Expected: FAIL — `Cannot find module '@/lib/rules-api/report'`.

- [ ] **Step 3: Implement the report**

Create `apps/web/lib/rules-api/report.ts`:
```ts
export interface ReportRow {
  surface: 'api' | 'mcp';
  endpoint: string;
  client_name: string | null;
  rule_ids: string[];
  missing_facts: string[];
  query: string | null;
  result_count: number;
  status: number;
}

export interface FunnelRow {
  event_name: string;
  metadata: Record<string, unknown>;
}

const SEARCH_ENDPOINTS = new Set(['search', 'search_rules']);

function top(counts: Map<string, number>, n: number): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

function table(header: string[], rows: (string | number)[][]): string {
  if (rows.length === 0) return '_None this week._';
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

export function aggregateReport(rows: ReportRow[], funnel: FunnelRow[], opts: { since: string; until: string }): string {
  const rules = new Map<string, number>();
  const zeroResults = new Map<string, number>();
  const missing = new Map<string, number>();
  const clients = new Map<string, number>();
  const funnelCounts = new Map<string, number>();

  for (const row of rows) {
    for (const id of row.rule_ids) bump(rules, id);
    for (const fact of row.missing_facts) bump(missing, fact);
    bump(clients, `${row.surface}: ${row.client_name ?? 'unknown'}`);
    if (SEARCH_ENDPOINTS.has(row.endpoint) && row.result_count === 0 && row.query) bump(zeroResults, row.query);
  }
  for (const event of funnel) {
    bump(funnelCounts, `${event.event_name}\u0000${String(event.metadata.utm_source ?? 'unknown')}`);
  }

  return [
    `# Rules API weekly report`,
    ``,
    `${opts.since} → ${opts.until} · ${rows.length} calls`,
    ``,
    `## Most-returned rules (content topic candidates)`,
    table(['Rule', 'Times returned'], top(rules, 15)),
    ``,
    `## Searches with zero results (Track A backlog and post ideas)`,
    table(['Query', 'Times'], top(zeroResults, 20)),
    ``,
    `## Most common missing facts (vocabulary gaps)`,
    table(['Fact', 'Times'], top(missing, 15)),
    ``,
    `## Clients`,
    table(['Client', 'Calls'], top(clients, 10)),
    ``,
    `## Agent-referred funnel`,
    table(
      ['Step', 'Source', 'Events'],
      top(funnelCounts, 20).map(([key, n]) => {
        const [step, source] = key.split('\u0000');
        return [step, source, n];
      }),
    ),
    ``,
  ].join('\n');
}
```

Create `apps/web/scripts/rules-api-report.ts`:
```ts
// Prints the weekly rules API report as Markdown.
// Local: node --env-file=.env.local --import tsx scripts/rules-api-report.ts
import { createAdminClient } from '../lib/supabase/admin';
import { aggregateReport, type FunnelRow, type ReportRow } from '../lib/rules-api/report';

async function main(): Promise<void> {
  const until = new Date();
  const since = new Date(until.getTime() - 7 * 86_400_000);
  const db = createAdminClient();

  const events = await db
    .from('rules_api_events')
    .select('surface, endpoint, client_name, rule_ids, missing_facts, query, result_count, status')
    .gte('created_at', since.toISOString())
    .limit(50_000);
  if (events.error) throw events.error;

  // Track C records UTM parameters in funnel_telemetry_events.metadata.
  const funnel = await db
    .from('funnel_telemetry_events')
    .select('event_name, metadata')
    .gte('created_at', since.toISOString())
    .in('metadata->>utm_source', ['mcp', 'api'])
    .limit(50_000);
  if (funnel.error) throw funnel.error;

  process.stdout.write(
    aggregateReport(events.data as ReportRow[], funnel.data as FunnelRow[], {
      since: since.toISOString().slice(0, 10),
      until: until.toISOString().slice(0, 10),
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
```

Before relying on the funnel section, confirm Track C's migration keeps `funnel_telemetry_events` and stores `utm_source` under `metadata`:
```bash
grep -rn "funnel_telemetry_events\|utm_source" supabase/migrations apps/web/lib | head
```
If C stores UTM fields elsewhere (for example a top-level `utm_source` column), change only the `.in(...)` filter and the `metadata.utm_source` read in `aggregateReport` to match, and update the test fixture accordingly.

- [ ] **Step 4: Run the test**

Run: `cd apps/web && npx vitest run test/rules-api/report.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Add the terms page**

Create `apps/web/app/(public)/rules/terms/page.tsx`. If C1 put the rule pages somewhere other than `app/(public)/rules/` (check with `ls apps/web/app/(public)/rules apps/web/app/rules 2>&1`), put this file in that same `rules/` folder as `terms/page.tsx`, so `/rules/terms` and `/rules/[id]` live in one tree.
```tsx
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Rules API and MCP terms of use · Elsewhere',
  description: 'Terms for using Elsewhere’s verified travel rules through the API and MCP server.',
};

export default function RulesTermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 space-y-6">
      <h1 className="text-3xl font-semibold">Rules API and MCP terms of use</h1>
      <p>
        Elsewhere publishes travel rules verified word-for-word against primary sources. These terms cover the public
        API at <code>/api/rules</code> and the MCP server at <code>/api/mcp</code>.
      </p>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Information, not legal advice</h2>
        <p>
          Rules are informational and are not legal advice. Check the cited source before relying on a rule. Rules
          marked <code>needs_review</code> are being re-checked after a source change and may be out of date.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Attribution is required</h2>
        <p>
          When you show or use a rule, show the attribution text — “Rules verified by Elsewhere from primary sources.
          Not legal advice.” — and link the rule’s <code>page_url</code>.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">AI agents</h2>
        <p>AI agents may answer their users from this data, with attribution and a link to the rule page.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Bulk use</h2>
        <p>Bulk redistribution or resale of the rules needs a partner key. Contact us to request one.</p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">No warranty</h2>
        <p>The data is provided as is, without warranty of any kind, and may change at any time.</p>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Add the weekly workflow**

Create `.github/workflows/rules-api-report.yml`:
```yaml
name: rules-api-weekly-report

on:
  schedule:
    - cron: '0 14 * * 1' # Mondays 14:00 UTC
  workflow_dispatch: {}

permissions:
  contents: read
  issues: write

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - name: Build the report
        working-directory: apps/web
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
        run: npx tsx scripts/rules-api-report.ts > "$RUNNER_TEMP/report.md"
      - name: Open the report as an issue
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          gh label create rules-api-report --color 0E8A16 --force
          gh issue create --title "Rules API weekly report — $(date -u +%F)" --label rules-api-report --body-file "$RUNNER_TEMP/report.md"
```

- [ ] **Step 7: Build and check the page**

Run:
```bash
cd apps/web && npm test && npm run build
npm run start > /tmp/terms-start.log 2>&1 &
curl -s --retry 15 --retry-connrefused --retry-delay 1 http://localhost:3000/rules/terms | grep -o "Information, not legal advice"
kill %1
```
Expected: tests PASS, build succeeds, and `Information, not legal advice` prints.

- [ ] **Step 8: Commit**

```bash
git add "apps/web/app/(public)/rules/terms" apps/web/lib/rules-api/report.ts apps/web/scripts/rules-api-report.ts apps/web/test/rules-api/report.test.ts .github/workflows/rules-api-report.yml
git commit -m "Add the rules API terms page and a weekly usage report

The report ranks returned rules, zero-result searches, missing facts,
clients, and agent-referred funnel events, and opens as a GitHub issue.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 12: Deploy — migration, firewall rules, environment, and a rate-limit check

Outward-facing: get the founder's explicit go-ahead before Steps 2–5.

**Files:**
- Create: `docs/superpowers/acceptance/track-d.md`

**Interfaces:**
- Consumes: migration `00020_rules_api.sql`; rule IDs `rules-api-anon`, `rules-mcp-anon`, `rules-partner`; `NEXT_PUBLIC_APP_URL`.
- Produces: a production deployment serving `/api/rules*` and `/api/mcp` with limits on; the acceptance log file later tasks append to.

- [ ] **Step 1: Pre-flight**

Run: `cd apps/web && npm test && npm run typecheck && npm run build`
Expected: all PASS. Confirm `packages/rules/dist/rules.json` contains at least one verified rule:
`node -e "const l=require('./packages/rules/dist/rules.json'); console.log(l.rules.filter(r=>r.status==='verified').length)"` → a number ≥ 1.

- [ ] **Step 2: Apply the migration to Supabase (project `xiinobmygdfwkpjtqauo`)**

Use the same mechanism Track C used for `00012`. With the Supabase MCP: first `list_migrations` to confirm `00012` is applied and `00020` isn't, then `apply_migration` with name `00020_rules_api` and the file's SQL. Then run `get_advisors` (type `security`) and confirm no new RLS warnings for `api_keys` or `rules_api_events` beyond "RLS enabled, no policies", which is intended (service role only).

- [ ] **Step 3: Create the Vercel Firewall rate-limit rules**

Load the `vercel:vercel-firewall` skill first and follow its current procedure (dashboard or `vercel firewall` CLI). Create three custom rules on the production project, each with condition **@vercel/firewall** rate-limit ID equal to the rule ID and a **Rate Limit** action, fixed 60-second window:

| Rule ID | Limit | Key |
|---|---|---|
| `rules-api-anon` | 60 requests / 60 s | IP |
| `rules-mcp-anon` | 30 requests / 60 s | IP |
| `rules-partner` | 600 requests / 60 s | rate-limit key (the code passes the partner key ID) |

- [ ] **Step 4: Set environment variables and deploy a preview**

Confirm `NEXT_PUBLIC_APP_URL` is set for Production (the production origin) and Preview (`vercel env ls`). Track C1 also needs it; add it only if missing. Deploy a preview (`vercel deploy` from the repo root with the project linked, or push the branch).

- [ ] **Step 5: Smoke-test and check rate limiting on the preview**

Previews are behind Vercel Authentication. Load the `vercel:access-protected-vercel-deployment` skill and use `vercel curl` (or the bypass header it describes). Then:
```bash
PREVIEW=https://<preview-host>
vercel curl "$PREVIEW/api/rules/facts" | head -c 300; echo
vercel curl "$PREVIEW/api/rules.json" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.schema_version,j.library_version,j.rules.length)})"
for i in $(seq 1 80); do vercel curl -s -o /dev/null -w "%{http_code}\n" "$PREVIEW/api/rules/facts?n=$i"; done | sort | uniq -c
```
Expected: facts JSON prints; `1 <library_version> <n>`; the loop shows roughly 60 × `200` and ≥ 15 × `429`. The unique `?n=` defeats the CDN cache so every request reaches the function. If you see no 429s, re-check the rule IDs from Step 3.

- [ ] **Step 6: Record and commit**

Create `docs/superpowers/acceptance/track-d.md`:
```markdown
# Track D acceptance and distribution log

## Deploy (Task 12)
- Migration 00020 applied: <date> via <mechanism>
- Firewall rules live: rules-api-anon (60/60s), rules-mcp-anon (30/60s), rules-partner (600/60s)
- Preview rate-limit check: <counts from the loop>
- Production deployment: <url> · library_version <value>
```
Fill in the bracketed values from Steps 2–5 (they are records of what happened, not code). Then:
```bash
git add docs/superpowers/acceptance/track-d.md
git commit -m "Record the Track D deploy: migration, firewall limits, smoke test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 13: Acceptance in ChatGPT developer mode and as a Claude custom connector

Outward-facing and founder-run: connecting tools to the founder's accounts. Needs the production domain and the first 10 verified rules, including `us-dot-refund-cancelled-flight`.

**Files:**
- Modify: `docs/superpowers/acceptance/track-d.md`

**Interfaces:**
- Consumes: production `https://<domain>/api/mcp`.
- Produces: a recorded pass/fail for the spec's acceptance question in both clients.

- [ ] **Step 1: ChatGPT (founder's Pro account)**

Per OpenAI's current guide (developers.openai.com/apps-sdk/deploy/connect-chatgpt, checked 2026-10-01): **Settings → Security and login → Developer mode** on. Then create a connection to `https://<domain>/api/mcp` (Streamable HTTP, no authentication). In a new chat with the connection enabled, ask exactly:

> My American flight from JFK was cancelled and I don't want the new flight — what am I owed?

Pass if the answer (a) called `match_situation` or `search_rules`/`get_rule`, (b) quotes a citation from the rule, (c) includes a rule page link containing `utm_source=mcp`, and (d) says it isn't legal advice. If a tool's metadata changes later, use the connection's **Refresh**.

- [ ] **Step 2: Claude**

**Customize → Connectors → + → Add custom connector**, paste `https://<domain>/api/mcp`, no auth. Ask the same question in a new chat with the connector enabled. Same four pass criteria.

- [ ] **Step 3: Confirm analytics**

With the Supabase MCP `execute_sql`:
```sql
select endpoint, client_name, rule_ids, created_at
from public.rules_api_events
where surface = 'mcp'
order by created_at desc
limit 10;
```
Expected: rows from both sessions, with `client_name` showing each client.

- [ ] **Step 4: Record and commit**

Append to `docs/superpowers/acceptance/track-d.md`:
```markdown
## Agent acceptance (Task 13)
| Client | Date | Tools called | Citation quoted | utm_source=mcp link | Not-legal-advice line | Pass |
|---|---|---|---|---|---|---|
| ChatGPT developer mode | | | | | | |
| Claude custom connector | | | | | | |
```
Fill in each row from what happened, then:
```bash
git add docs/superpowers/acceptance/track-d.md
git commit -m "Record ChatGPT and Claude acceptance of the rules MCP server

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```
If either client fails a criterion, fix it with a TDD change in `lib/mcp/` (usually instruction or description wording in `instructions.ts` / `tools.ts`), redeploy, and re-run that client's step.

---

### Task 14: List the server in the official MCP registry

Outward-facing: publishes publicly under the founder's GitHub identity. Get explicit go-ahead.

**Files:**
- Create: `apps/web/mcp/server.json`
- Modify: `docs/superpowers/acceptance/track-d.md`

**Interfaces:**
- Consumes: production `https://<domain>/api/mcp`.
- Produces: registry entry `io.github.ifaemuh/elsewhere-rules`.

- [ ] **Step 1: Install the publisher and scaffold**

Run:
```bash
brew install mcp-publisher
mkdir -p apps/web/mcp && cd apps/web/mcp && mcp-publisher init
```
Expected: `server.json` created with the current `$schema` URL. Keep that `$schema` value as generated.

- [ ] **Step 2: Fill in the listing from the production origin**

Run from `apps/web/mcp` (with `NEXT_PUBLIC_APP_URL` set to the production origin, e.g. via `vercel env pull`):
```bash
node -e '
const fs = require("fs");
const origin = process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
const s = JSON.parse(fs.readFileSync("server.json", "utf8"));
const out = {
  $schema: s.$schema,
  name: "io.github.ifaemuh/elsewhere-rules",
  description: "Verified US and EU travel passenger rules with primary-source citations. Not legal advice.",
  version: "1.0.0",
  remotes: [{ type: "streamable-http", url: origin + "/api/mcp" }],
};
fs.writeFileSync("server.json", JSON.stringify(out, null, 2) + "\n");
console.log(out.remotes[0].url);
'
mcp-publisher validate
```
Expected: the printed URL is `https://<domain>/api/mcp`, and validation passes.

- [ ] **Step 3: Authenticate and publish**

Run: `mcp-publisher login github` (browser OAuth as `ifaemuh`), then `mcp-publisher publish`.
Expected: success output naming `io.github.ifaemuh/elsewhere-rules` version `1.0.0`. Check the listing with the lookup the publisher prints, or `curl -s "https://registry.modelcontextprotocol.io/v0/servers?search=elsewhere-rules"`.

The namespace moves to the product domain's reverse-DNS form (DNS or HTTP verification) once the domain is final; that is a new listing, not an edit.

- [ ] **Step 4: Record and commit**

Append to `docs/superpowers/acceptance/track-d.md`:
```markdown
## MCP registry (Task 14)
- Published io.github.ifaemuh/elsewhere-rules v1.0.0 on <date>, remote <url>
```
```bash
git add apps/web/mcp/server.json docs/superpowers/acceptance/track-d.md
git commit -m "List the rules MCP server in the official MCP registry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

### Task 15: Directory submissions — ChatGPT and Anthropic (after all 30 rules are verified)

Gated: start only when 30 rules are `verified`, so reviewers see a complete product. Outward-facing; the founder submits.

**Files:**
- Create: `apps/web/public/.well-known/openai-apps-challenge`
- Modify: `docs/superpowers/acceptance/track-d.md`

**Interfaces:**
- Consumes: production deployment; privacy policy page (Track C); `/rules/terms` (Task 11).
- Produces: two submissions under review.

- [ ] **Step 1: Check prerequisites**

```bash
node -e "const l=require('./packages/rules/dist/rules.json'); console.log(l.rules.filter(r=>r.status==='verified').length)"
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/privacy
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/rules/terms
```
Expected: `30` or more, `200`, `200`. If `/privacy` isn't 200, stop: both directories reject submissions without a privacy policy, and that page belongs to Track C.

- [ ] **Step 2: ChatGPT directory**

Per OpenAI's submission guide (developers.openai.com/apps-sdk/deploy/submission, checked 2026-10-01):
1. In platform.openai.com organization settings, complete individual and business verification.
2. Get the domain challenge token from the **Plugins dashboard** (platform.openai.com/plugins → **Upload new or existing plugin**). Write it as the entire contents of `apps/web/public/.well-known/openai-apps-challenge`, deploy, and confirm `curl https://<domain>/.well-known/openai-apps-challenge` returns it.
3. Enter the metadata:
   - Display name (≤ 30): `Elsewhere Travel Rules`
   - Subtitle (≤ 30): `Verified travel rights, cited`
   - Long description (≤ 4,000): what the tools do, that every rule cites its primary source, that it is information and not legal advice.
   - Category: Travel. URLs: website `https://<domain>`, support `https://<domain>/support` (or a support email page from Track C), privacy `https://<domain>/privacy`, terms `https://<domain>/rules/terms`. Square icon ≥ 48 px. At least one screenshot.
   - MCP server: `https://<domain>/api/mcp`, no authentication (no test account needed).
4. Test cases. Positive (prompt → expected tool → observable result):
   1. "My flight from Atlanta was cancelled and I don't want the rebooked flight. What am I owed?" → `match_situation` → the US cancellation-refund rule with a quote from 14 CFR Part 260 and its rule page link.
   2. "My flight from Paris to New York landed four hours late. What does EU261 pay?" → `match_situation` (`flight.departs_eu: true`, `event.delay_minutes: 240`, `flight.distance_km` ≈ 5,800) → the EU261 delay-compensation rule with its distance band and EUR-Lex citation.
   3. "Can I cancel a flight I booked yesterday for free?" → `search_rules` then `get_rule` → the 24-hour cancellation rule with citation.
   4. "Do I need a REAL ID to fly within the US?" → `search_rules` → the REAL ID rule with the TSA citation.
   5. "What travel rules changed this month?" → `list_recent_changes` → a dated list of changes.
   Negative:
   1. "Book me a flight to Lisbon." → no tool call; explains it provides rules information only.
   2. "Sue the airline for me and write the court filing." → no legal filing; may share the relevant rule and its link, says it isn't legal advice.
   3. "What's the weather in Rome tomorrow?" → no tool call.
5. Record a short screen-capture walkthrough of positive cases 1 and 2 and attach it.
6. Submit for review. Feedback arrives by email; only one review can be active at a time.

- [ ] **Step 3: Anthropic connectors directory**

Per Anthropic's guidance (claude.com/docs/connectors/building/submission and the directory FAQ, checked 2026-10-01): submit the remote server through the submission portal in Claude.ai admin settings. Requirements this server already meets: every tool has a title and `readOnlyHint` (missing annotations are the most common rejection), no auth needed. Provide the privacy policy URL, the terms URL, and setup and usage instructions (the server URL plus the five tools in one paragraph each). Track status in the submissions dashboard; escalations go to mcp-review@anthropic.com.

- [ ] **Step 4: Record and commit**

Append to `docs/superpowers/acceptance/track-d.md`:
```markdown
## Directory submissions (Task 15)
| Directory | Submitted | Status | Notes |
|---|---|---|---|
| ChatGPT | | | |
| Anthropic | | | |
```
```bash
git add apps/web/public/.well-known/openai-apps-challenge docs/superpowers/acceptance/track-d.md
git commit -m "Submit the rules MCP server to the ChatGPT and Anthropic directories

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01CZeaGyqM4LkMDPkaein2Sc"
```

---

## Self-Review (against the spec)

**Spec coverage:**
| Spec requirement | Task |
|---|---|
| `GET /api/rules.json` full artifact, non-draft, read by foundry | 7 (artifact shape kept so `RULES_SOURCE=path:` and `url:` agree) |
| `GET /api/rules` search with q/domain/jurisdiction/status | 8 |
| `GET /api/rules/:id`, drafts and unknown → identical 404 | 7 |
| `POST /api/rules/match` → applies / may_apply + missing_facts / does_not_apply count, validated facts | 9 |
| `GET /api/rules/changes?since=` | 8 |
| `GET /api/rules/facts` | 7 |
| Envelope: schema_version, library_version, data, attribution | 4 |
| Public projection: identity, rule, citations from sources.yaml, freshness, page_url; notice; replaced_by; internal fields hidden | 1 (sources + replaced_by), 3 |
| MCP via mcp-handler on SDK v2, stateless | 10 |
| Server instructions | 10 (`instructions.ts`) |
| Five read-only tools, structured content + text ending in source and rule page links, never drafts | 10 |
| UTM: utm_source=mcp + client name; utm_source=api + partner ID | 3, 7, 10 |
| Anonymous limits via `@vercel/firewall` + Firewall rules; 429 + Retry-After | 5, 12 |
| Partner keys hashed in Supabase `api_keys`; `withMcpAuth`; 401 for revoked/invalid | 5, 7, 10 |
| Caching: ETag = library_version, If-None-Match → 304, s-maxage=3600 + swr=86400; match not cached | 4, 9 |
| Terms page | 11 |
| `rules_api_events` analytics, no IPs, query truncation + redaction, fact names only | 5, 6, 7, 10 |
| Weekly report: top rules, zero-result searches, missing facts, agent funnel | 11 |
| Error table (400/404/200 retired/200 needs_review/429/401/isError/503) | 4, 5, 7, 8, 9, 10 |
| MCP contract tests incl. readOnlyHint, citations, page_url, no drafts | 10 |
| Shared golden fixtures through API and MCP | 9, 10 |
| Artifact contract (`schema_version` check) | 2 (`parseLibrary`), 7 |
| Rate-limit load run on preview | 12 |
| Manual acceptance in ChatGPT and Claude | 13 |
| MCP registry listing, `io.github.ifaemuh/elsewhere-rules` | 14 |
| Directory submissions after 30 rules | 15 |
| v2 (bulk export, change webhooks, paid tier) | Out of scope for this plan by the spec's phasing; the `api_keys` table and partner path ship now |

**Deliberate deviations, each small:**
- `api_keys` stores a `rate_limit_rule` (a Firewall rule ID) instead of a numeric per-minute limit. `checkRateLimit()` only enforces limits defined as Firewall rules, so a number in the database couldn't be enforced; tiers map to named rules.
- `/api/rules.json` returns the artifact shape (`Rule` objects) rather than the projection, as the spec's own row says ("the full artifact … the file foundry reads").
- `library_version` stays a hash of rules only (contract unchanged); a sources-only change shows up after the next deploy rather than through the ETag.

**Placeholder scan:** the only bracketed values are in the acceptance log (Tasks 12–15), which records what happened at execution time, and `<domain>` / `<preview-host>`, which are values the executor reads from the deployment. No code step contains a placeholder.

**Type consistency check:** `withRulesApi`, `jsonOk`, `jsonError`, `envelope`, `toPublicRule`, `toRuleSummary`, `matchSituation`, `parseSituation`, `knownFactNames`, `searchRules`, `publicChangesSince`, `factsVocabulary`, `scheduleEvent`, `resolveCaller`, `lookupKey`, `enforceRateLimit`, `handleMcp`, `registerRuleTools` are each defined once and used with the same signatures in later tasks. Route data shapes: `{ rule }`, `{ facts }`, `{ rules, count }`, `{ since, changes }`, `MatchResponse`.
