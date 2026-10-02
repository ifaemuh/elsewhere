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
