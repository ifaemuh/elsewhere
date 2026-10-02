import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTS, validateSituation } from '../src/index';

test('index.ts exports FACTS and validateSituation', () => {
  assert.ok(FACTS, 'FACTS should be exported');
  assert.ok(validateSituation, 'validateSituation should be exported');
  assert.ok(Object.keys(FACTS).length > 0, 'FACTS should have entries');
  assert.ok(typeof validateSituation === 'function', 'validateSituation should be a function');
});

test('index.ts exports the rule and source schemas', async () => {
  const m = await import('../src/index');
  for (const name of ['RuleSchema', 'SourceSchema', 'JURISDICTION_PATTERN', 'RULE_STATUSES', 'DOMAINS', 'CHARACTERS', 'ENTITLEMENT_KINDS', 'SOURCE_KINDS']) {
    assert.ok(name in m, `${name} should be exported`);
  }
});
