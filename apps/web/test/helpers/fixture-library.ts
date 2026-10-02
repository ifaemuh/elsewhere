import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import {
  RuleSchema,
  type MatchOutcome,
  type Rule,
  type RuleChange,
  type RulesLibrary,
  type Situation,
  type Source,
} from '@elsewhere/rules/core';
// buildLibrary and changesFromHistory are build-time values, deliberately absent from the
// bundle-safe /core entry. Tests may reach them by relative path; app code must not.
import { buildLibrary, changesFromHistory } from '../../../../packages/rules/src/library';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const RULES_FIXTURES = path.resolve(HERE, '../../../../packages/rules/test/fixtures');

export const TEST_SOURCE: Source = {
  key: 'test-source',
  url: 'https://example.test/source',
  kind: 'regulation',
  detector: { changedetection: { watch_uuid: 'test-source' } },
};

type HistoryEntry = Rule['history'][number];

/** A schema-valid Rule. Without an explicit `history`, one is derived that ends at the rule's version and status. */
export function makeRule(overrides: Partial<Rule> = {}): Rule {
  const version = overrides.version ?? 1;
  const status = overrides.status ?? 'verified';
  const history: HistoryEntry[] = [{ version, status, date: '2026-10-01' }];
  return RuleSchema.parse({
    id: 'test-cancelled-refund',
    version,
    status,
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
    history,
    ...overrides,
  });
}

/** One rule per status. The retired and draft rules reuse the verified rule's conditions on purpose. */
export function standardRules(): Rule[] {
  return [
    makeRule(),
    makeRule({
      id: 'test-tarmac-delay',
      version: 2,
      status: 'needs_review',
      title: 'Tarmac delay limits',
      summary: 'Airlines must let you off after three hours on the tarmac on domestic flights.',
      applies_when: { all: [{ fact: 'event.type', in: ['tarmac_delay'] }, { fact: 'flight.is_domestic_us', eq: true }] },
      tags: ['tarmac', 'delay'],
      lead_character: 'raccoon',
      history: [
        { version: 1, status: 'verified', date: '2026-08-25' },
        { version: 2, status: 'needs_review', date: '2026-10-05' },
      ],
    }),
    makeRule({
      id: 'test-old-voucher-rule',
      status: 'retired',
      replaced_by: 'test-cancelled-refund',
      title: 'Old voucher guidance',
      summary: 'Superseded guidance about vouchers.',
      tags: ['voucher'],
      history: [
        { version: 1, status: 'verified', date: '2026-06-01' },
        { version: 1, status: 'retired', date: '2026-08-15' },
      ],
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
      history: [{ version: 1, status: 'draft', date: '2026-10-04' }],
    }),
  ];
}

/** The change feed the library derives from the standard rules' history, newest first. */
export function standardChanges(): RuleChange[] {
  return changesFromHistory(standardRules());
}

/** Builds a library the way the real build does; `changes` come from each rule's history. */
export function makeLibrary(rules: Rule[]): RulesLibrary {
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
  return buildLibrary({ rules, sources, now: new Date('2026-10-06T12:00:00Z') });
}

export function standardLibrary(): RulesLibrary {
  return makeLibrary(standardRules());
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
