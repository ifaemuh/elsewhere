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
