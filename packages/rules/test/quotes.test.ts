import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadRules, loadSources } from '../src/load';
import { checkQuotes, checkSupports, normalizeText, partitionCiIssues, quoteFingerprints, sourceTextPath } from '../src/quotes';
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

test('a quote must not match inside a longer token (M1 boundary)', () => {
  const r = rule('fx-missed-connection-single-ticket');
  const withQuote = (text: string, source: string) => {
    r.sources = [{ id: 'x', source: 'fx-carrier-coc', quotes: [{ text, supports: ['summary', 'entitlement'] }] }];
    return checkQuotes([r], { 'fx-carrier-coc': source }).map((i) => i.reason);
  };
  assert.deepEqual(withQuote('2 hours or less', 'within 12 hours or less of departure'), ['not_found']);
  assert.deepEqual(withQuote('hours or less', 'within 12 hours or lessening'), ['not_found']);
  assert.deepEqual(withQuote('2 hours or less', 'within 2 hours or less of departure'), []);
  assert.deepEqual(withQuote('2 hours or less', 'within 12 hours or less of departure. Also 2 hours or less.'), []);
  assert.deepEqual(withQuote('2 hours or less', '2 hours or less'), []);
  assert.deepEqual(withQuote('(a) Fees', 'text (a) Fees for services'), []);
  assert.deepEqual(withQuote('refund.', 'a refund.Next sentence'), []);
});

test('normalizeText comment is honest: compatibility forms fold, case and dashes do not', () => {
  assert.equal(normalizeText('ﬁne ＡＢ'), 'fine AB');
  assert.notEqual(normalizeText('a\u2013b'), normalizeText('a-b'));
});

test('partitionCiIssues: new or changed quotes must be found; unchanged ones fail only on verified rules', () => {
  const verified = rule('fx-missed-connection-single-ticket');
  const needsReview = { ...rule('fx-us-refund-cancelled-flight'), status: 'needs_review' as const };
  const rulesIn = [verified, needsReview];
  const broken = Object.fromEntries(Object.keys(texts).map((k) => [k, 'nothing relevant']));
  const issues = checkQuotes(rulesIn, broken);
  assert.ok(issues.length >= 2);

  // everything unchanged from base: verified rule fails, needs_review rule only warns
  const unchanged = new Map(rulesIn.map((r) => [r.id, quoteFingerprints(r)]));
  const a = partitionCiIssues(issues, rulesIn, unchanged);
  assert.ok(a.failures.length > 0 && a.failures.every((i) => i.rule_id === verified.id));
  assert.ok(a.warnings.length > 0 && a.warnings.every((i) => i.rule_id === needsReview.id));

  // no base entry for a rule (new file): every quote is new, so it fails whatever its status
  const b = partitionCiIssues(issues, rulesIn, new Map());
  assert.equal(b.warnings.length, 0);
  assert.equal(b.failures.length, issues.length);

  // one quote changed on the needs_review rule: that quote fails, the others warn
  const changedRule = structuredClone(needsReview);
  const base = quoteFingerprints(needsReview);
  const first = changedRule.sources[0]!.quotes[0]!;
  first.text = first.text + ' (edited)';
  const c = partitionCiIssues(checkQuotes([changedRule], broken), [changedRule], new Map([[changedRule.id, base]]));
  assert.deepEqual(c.failures.map((i) => i.quote), [first.text]);
  assert.ok(c.warnings.length >= 1);
});

test('partitionCiIssues: a missing source on an unchanged quote is a warning, on a new quote a failure', () => {
  const r = rule('fx-missed-connection-single-ticket');
  const issues = checkQuotes([r], {});
  const same = partitionCiIssues(issues, [r], new Map([[r.id, quoteFingerprints(r)]]));
  assert.equal(same.failures.length, 0);
  assert.equal(same.warnings.length, issues.length);
  const fresh = partitionCiIssues(issues, [r], new Map());
  assert.equal(fresh.failures.length, issues.length);
});
