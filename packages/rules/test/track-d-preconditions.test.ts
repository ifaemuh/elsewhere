import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildLibrary, changesFromHistory, type Rule, type Source } from '../src/index';

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
