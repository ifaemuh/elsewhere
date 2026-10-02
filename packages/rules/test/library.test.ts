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
