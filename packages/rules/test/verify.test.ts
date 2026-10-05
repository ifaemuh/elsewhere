import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { RuleSchema } from '../src/schema';
import { markVerified } from '../src/verify';
import { FIXTURES } from './helpers';

const draftYaml = () => readFileSync(join(FIXTURES, 'rules/fx-draft-cancellation-note.yaml'), 'utf8');

test('markVerified sets the verification fields, appends history and keeps comments', () => {
  const out = markVerified(draftYaml().replace('status: draft', 'status: draft # awaiting founder'), { by: 'ifaemuh', date: '2026-10-06' });
  const rule = RuleSchema.parse(parse(out));
  assert.equal(rule.status, 'verified');
  assert.equal(rule.last_verified, '2026-10-06');
  assert.equal(rule.verified_by, 'ifaemuh');
  assert.equal(rule.review_by, '2027-01-04');
  assert.deepEqual(rule.history.at(-1), { version: 1, status: 'verified', date: '2026-10-06' });
  assert.match(out, /# awaiting founder/);
  assert.match(out, /^ {2}- \{ version: 1, status: verified, date: 2026-10-06 \}$/m);
});

test('markVerified refuses retired rules', () => {
  assert.throws(() => markVerified(draftYaml().replace('status: draft', 'status: retired'), { by: 'x', date: '2026-10-06' }), /retired/);
});

test('markVerified changes only the verification lines and the history', () => {
  const before = draftYaml();
  const after = markVerified(before, { by: 'ifaemuh', date: '2026-10-06' });
  const a = before.split('\n');
  const b = after.split('\n');
  const changed = b.filter((line) => !a.includes(line));
  assert.deepEqual(changed, [
    'status: verified',
    'last_verified: 2026-10-06',
    'verified_by: ifaemuh',
    'review_by: 2027-01-04',
    '  - { version: 1, status: verified, date: 2026-10-06 }',
  ]);
  assert.equal(b.length, a.length + 1);
});
