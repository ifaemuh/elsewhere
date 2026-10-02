import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FACTS, validateSituation } from '../src/index';

test('index.ts exports FACTS and validateSituation', () => {
  assert.ok(FACTS, 'FACTS should be exported');
  assert.ok(validateSituation, 'validateSituation should be exported');
  assert.ok(Object.keys(FACTS).length > 0, 'FACTS should have entries');
  assert.ok(typeof validateSituation === 'function', 'validateSituation should be a function');
});
