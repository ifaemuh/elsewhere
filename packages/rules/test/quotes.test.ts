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
  assert.equal(normalizeText('  “Hi” there\n\tit’s  '), '"Hi" there it\'s');
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
