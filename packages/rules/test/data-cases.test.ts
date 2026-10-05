import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Situation } from '../src/facts';
import { loadRules } from '../src/load';
import { matchRule, type MatchOutcome } from '../src/match';

interface CaseFile {
  rule: string;
  cases: { name: string; situation: Situation; outcome: MatchOutcome; missing_facts?: string[] }[];
  /** Why no situation can give does_not_apply: the rule's scope covers every value its facts can take. */
  no_does_not_apply?: string;
}

const casesDir = fileURLToPath(new URL('./data-cases/', import.meta.url));
const rules = loadRules().filter((r) => r.status !== 'retired');
const files = existsSync(casesDir) ? readdirSync(casesDir).filter((f) => f.endsWith('.yaml')).sort() : [];

test('every live rule in data/ has a cases file', () => {
  const missing = rules.filter((r) => !files.includes(`${r.id}.yaml`)).map((r) => `test/data-cases/${r.id}.yaml`);
  assert.deepEqual(missing, []);
});

for (const file of files) {
  const spec = parse(readFileSync(join(casesDir, file), 'utf8')) as CaseFile;
  const rule = rules.find((r) => r.id === spec.rule);

  test(`${file}: names a live rule and covers applies, may_apply and does_not_apply`, () => {
    assert.equal(`${spec.rule}.yaml`, file);
    assert.ok(rule, `no live rule ${spec.rule} in data/`);
    const outcomes = new Set(spec.cases.map((c) => c.outcome));
    const waived = spec.no_does_not_apply !== undefined;
    if (waived) {
      assert.ok(typeof spec.no_does_not_apply === 'string' && spec.no_does_not_apply.trim().length > 0, 'no_does_not_apply needs a reason');
      assert.ok(!outcomes.has('does_not_apply'), 'no_does_not_apply is set but a does_not_apply case exists');
    }
    for (const outcome of ['applies', 'may_apply', 'does_not_apply'] as const) {
      if (outcome === 'does_not_apply' && waived) continue;
      assert.ok(outcomes.has(outcome), `needs a ${outcome} case`);
    }
  });

  for (const c of spec.cases) {
    test(`${spec.rule}: ${c.name}`, () => {
      assert.ok(rule);
      const result = matchRule(rule, c.situation);
      assert.equal(result.outcome, c.outcome);
      assert.deepEqual(result.missing_facts, c.missing_facts ?? []);
    });
  }
}
