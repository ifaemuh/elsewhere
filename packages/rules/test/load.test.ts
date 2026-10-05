import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRules, loadSources, RulesValidationError } from '../src/load';
import { FIXTURES } from './helpers';

const sources = () => loadSources(join(FIXTURES, 'sources.yaml'));

function tempData(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rules-'));
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), content);
  }
  return dir;
}

const fixtureYaml = (id: string) => readFileSync(join(FIXTURES, 'rules', `${id}.yaml`), 'utf8');

function issues(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof RulesValidationError) return error.issues.map((i) => `${i.file} ${i.path}: ${i.message}`).join('\n');
    throw error;
  }
  return '';
}

test('loadSources reads fixture sources and attaches keys', () => {
  const s = sources();
  assert.equal(s['fx-dot-refunds']?.key, 'fx-dot-refunds');
  assert.deepEqual(s['fx-eu-guidance']?.detector, { ota: { service: 'Example EU Guidance', terms_type: 'Official Guidance' } });
});

test('loadSources rejects bad entries with their key in the path', () => {
  const dir = tempData({ 'sources.yaml': 'bad-one:\n  url: http://x.gov\n  kind: regulation\n  detector: { ecfr: { title: 14, part: 1 } }\n' });
  assert.match(issues(() => loadSources(join(dir, 'sources.yaml'))), /bad-one\.url/);
});

test('loadRules loads every fixture rule sorted by id', () => {
  const rules = loadRules({ dataDir: join(FIXTURES, 'rules'), sources: sources() });
  assert.deepEqual(rules.map((r) => r.id), [
    'fx-24h-free-cancellation',
    'fx-draft-cancellation-note',
    'fx-eu261-delay-compensation',
    'fx-missed-connection-single-ticket',
    'fx-us-refund-cancelled-flight',
  ]);
});

test('a missing data directory loads as no rules', () => {
  assert.deepEqual(loadRules({ dataDir: join(tmpdir(), 'does-not-exist-rules'), sources: sources() }), []);
});

test('file name must equal the rule id', () => {
  const dir = tempData({ 'flights/wrong-name.yaml': fixtureYaml('fx-us-refund-cancelled-flight') });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /file name must be fx-us-refund-cancelled-flight\.yaml/);
});

test('domain folder must match the rule domain', () => {
  const dir = tempData({ 'money/fx-us-refund-cancelled-flight.yaml': fixtureYaml('fx-us-refund-cancelled-flight') });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /rule is in money\/ but its domain is flights/);
});

test('ids must be unique across files', () => {
  const dir = tempData({
    'flights/fx-us-refund-cancelled-flight.yaml': fixtureYaml('fx-us-refund-cancelled-flight'),
    'hotels/fx-us-refund-cancelled-flight.yaml': fixtureYaml('fx-us-refund-cancelled-flight').replace('domain: flights', 'domain: hotels'),
  });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /duplicate id/);
});

test('every cited source must exist in sources.yaml', () => {
  const dir = tempData({
    'fx-us-refund-cancelled-flight.yaml': fixtureYaml('fx-us-refund-cancelled-flight').replaceAll('source: fx-dot-refunds', 'source: fx-missing'),
  });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /unknown source "fx-missing"/);
});

function foundIssues(yaml: string): { file: string; path: string; message: string }[] {
  const dir = tempData({ 'fx-us-refund-cancelled-flight.yaml': yaml });
  try {
    loadRules({ dataDir: dir, sources: sources() });
  } catch (error) {
    if (error instanceof RulesValidationError) return error.issues;
    throw error;
  }
  return [];
}

const base = () => fixtureYaml('fx-us-refund-cancelled-flight');

test('conditions get precise messages for unknown facts and bad values, with no generic noise', () => {
  const yaml = base().replace('fact: flight.touches_us', 'fact: flight.color').replace('in: [cancellation]', 'in: [meteor]');
  const found = foundIssues(yaml);
  assert.deepEqual(
    found.map((i) => i.path),
    ['applies_when.all.0', 'applies_when.all.1'],
  );
  assert.match(found[0]!.message, /"event\.type" expects one of cancellation/);
  assert.match(found[1]!.message, /unknown fact "flight\.color"/);
});

test('eq and in with wrong-typed values on a number fact are reported', () => {
  const eq = foundIssues(base().replace('fact: flight.touches_us\n      eq: true', 'fact: event.delay_minutes\n      eq: "long"'));
  assert.equal(eq.length, 1);
  assert.equal(eq[0]!.path, 'applies_when.all.1');
  assert.match(eq[0]!.message, /"event\.delay_minutes" expects .*got "long"/);
  const list = foundIssues(base().replace('fact: flight.touches_us\n      eq: true', 'fact: event.delay_minutes\n      in: ["a"]'));
  assert.equal(list.length, 1);
  assert.match(list[0]!.message, /got "a"/);
});

test('every bad element of a mixed in list is reported', () => {
  const found = foundIssues(base().replace('in: [cancellation]', 'in: [cancellation, meteor, flood]'));
  assert.deepEqual(found.map((i) => i.path), ['applies_when.all.0', 'applies_when.all.0']);
  assert.match(found[0]!.message, /got "meteor"/);
  assert.match(found[1]!.message, /got "flood"/);
});

test('exists must be a boolean', () => {
  const found = foundIssues(base().replace('fact: flight.touches_us\n      eq: true', 'fact: flight.touches_us\n      exists: "yes"'));
  assert.deepEqual(found.map((i) => `${i.path}: ${i.message}`), ['applies_when.all.1: exists takes true or false']);
});

test('a condition with more than one operator is reported', () => {
  const found = foundIssues(base().replace('fact: flight.touches_us\n      eq: true', 'fact: event.delay_minutes\n      gte: 1\n      lte: 5'));
  assert.deepEqual(found.map((i) => i.path), ['applies_when.all.1']);
  assert.match(found[0]!.message, /exactly one operator, found 2/);
});

test('an unknown fact nested under any is reported with its path', () => {
  const found = foundIssues(
    base().replace('fact: flight.touches_us\n      eq: true', 'any:\n        - fact: flight.color\n          eq: true'),
  );
  assert.deepEqual(found.map((i) => i.path), ['applies_when.all.1.any.0']);
  assert.match(found[0]!.message, /unknown fact "flight\.color"/);
});

test('a node carrying both all and any is checked in both groups', () => {
  const found = foundIssues(
    base().replace(
      'fact: flight.touches_us\n      eq: true',
      'all:\n        - fact: flight.color\n          eq: true\n      any:\n        - fact: flight.shape\n          eq: true',
    ),
  );
  const paths = found.map((i) => i.path);
  assert.ok(paths.includes('applies_when.all.1.all.0'));
  assert.ok(paths.includes('applies_when.all.1.any.0'));
  assert.equal(found.length, 2);
});

test('numeric operators only work on number facts', () => {
  const yaml = fixtureYaml('fx-us-refund-cancelled-flight').replace(/fact: flight\.touches_us\n\s+eq: true/, 'fact: flight.touches_us\n      gte: 1');
  const dir = tempData({ 'fx-us-refund-cancelled-flight.yaml': yaml });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /gte only works on number facts/);
});

test('replaced_by must name a rule in the library', () => {
  const retired = fixtureYaml('fx-us-refund-cancelled-flight')
    .replace('status: verified', 'status: retired\nreplaced_by: fx-nowhere')
    .replace(/history:\n[\s\S]*$/, 'history:\n  - { version: 1, status: retired, date: 2026-12-01 }\n');
  const dir = tempData({ 'fx-us-refund-cancelled-flight.yaml': retired });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /replaced_by: no rule "fx-nowhere"/);
});

test('invalid YAML is reported, not thrown raw', () => {
  const dir = tempData({ 'broken.yaml': 'id: [unclosed\n' });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /invalid YAML/);
});

test('copying the fixtures into a domain layout still loads', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rules-'));
  cpSync(join(FIXTURES, 'rules'), join(dir, 'flights'), { recursive: true });
  assert.equal(loadRules({ dataDir: dir, sources: sources() }).length, 5);
});

test('replaced_by cannot point at the rule itself', () => {
  const retired = fixtureYaml('fx-us-refund-cancelled-flight')
    .replace('status: verified', 'status: retired\nreplaced_by: fx-us-refund-cancelled-flight')
    .replace(/history:\n[\s\S]*$/, 'history:\n  - { version: 1, status: retired, date: 2026-12-01 }\n');
  const dir = tempData({ 'fx-us-refund-cancelled-flight.yaml': retired });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /replaced_by: a rule cannot replace itself/);
});

test('a .yml file in data/ is rejected instead of silently skipped', () => {
  const dir = tempData({ 'flights/fx-24h-free-cancellation.yml': fixtureYaml('fx-24h-free-cancellation') });
  assert.match(issues(() => loadRules({ dataDir: dir, sources: sources() })), /fx-24h-free-cancellation\.yml.*use the \.yaml extension/);
});
