import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RESERVED_RULE_IDS, RuleSchema, SourceSchema } from '../src/schema';
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

test('reserved ids are rejected', () => {
  for (const id of RESERVED_RULE_IDS) {
    assert.match(issuesOf({ ...valid(), id }).join('\n'), /id: is reserved for an app route/);
  }
});

test('a normal id still passes', () => {
  assert.deepEqual(issuesOf({ ...valid(), id: 'us-refund-cancelled-flight' }), []);
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
