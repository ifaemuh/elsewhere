import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSources, PACKAGE_ROOT, RulesValidationError } from '../src/load';
import { buildDeclarations, loadOtaOverrides } from '../src/ota';
import type { Source } from '../src/schema';

const src = (key: string, url: string, service: string, terms_type: string): Source => ({
  key, url, kind: 'government_page', detector: { ota: { service, terms_type } },
});

const sources: Record<string, Source> = {
  'a-guidance': src('a-guidance', 'https://a.gov/refunds', 'A Agency', 'Official Guidance'),
  'b-coc': src('b-coc', 'https://b.com/coc.pdf', 'B Air', 'Conditions of Carriage'),
  'b-plan': src('b-plan', 'https://b.com/plan', 'B Air', 'Customer Service Plan'),
  'ecfr-x': { key: 'ecfr-x', url: 'https://www.ecfr.gov/x', kind: 'regulation', detector: { ecfr: { title: 14, part: 260 } } },
};

test('groups ota sources by service and skips other detectors', () => {
  const declarations = buildDeclarations(sources, { 'a-guidance': { select: 'main', remove: ['.feedback'], execute_client_scripts: true } });
  assert.deepEqual(Object.keys(declarations).sort(), ['A Agency', 'B Air']);
  assert.deepEqual(declarations['A Agency'], {
    name: 'A Agency',
    terms: { 'Official Guidance': { fetch: 'https://a.gov/refunds', select: 'main', remove: ['.feedback'], executeClientScripts: true } },
  });
  assert.deepEqual(declarations['B Air']!.terms, {
    'Conditions of Carriage': { fetch: 'https://b.com/coc.pdf' },
    'Customer Service Plan': { fetch: 'https://b.com/plan', select: 'body' },
  });
});

test('two sources cannot share a service and terms type', () => {
  const clash = { ...sources, 'b-dup': src('b-dup', 'https://b.com/other', 'B Air', 'Customer Service Plan') };
  assert.throws(() => buildDeclarations(clash, {}), RulesValidationError);
});

test('overrides must point at ota sources and PDFs take no selectors', () => {
  assert.throws(() => buildDeclarations(sources, { 'ecfr-x': { select: 'main' } }), RulesValidationError);
  assert.throws(() => buildDeclarations(sources, { 'b-coc': { select: 'main' } }), RulesValidationError);
});

test('rules:declarations writes one file per service and prunes stale ones', () => {
  const dir = mkdtempSync(join(tmpdir(), 'decl-'));
  const sourcesFile = join(dir, 'sources.yaml');
  writeFileSync(sourcesFile, 'a-guidance:\n  url: https://a.gov/refunds\n  kind: government_page\n  detector: { ota: { service: "A Agency", terms_type: "Official Guidance" } }\n');
  const out = join(dir, 'declarations');
  const run = () =>
    spawnSync(process.execPath, ['--import', 'tsx', fileURLToPath(new URL('../src/cli/declarations.ts', import.meta.url)),
      '--sources', sourcesFile, '--overrides', join(dir, 'none.yaml'), '--out', out], { encoding: 'utf8' });
  assert.equal(run().status, 0);
  writeFileSync(join(out, 'Old Service.json'), '{}');
  writeFileSync(join(out, 'A Agency.history.json'), '{}');
  assert.equal(run().status, 0);
  assert.deepEqual(readdirSync(out).sort(), ['A Agency.history.json', 'A Agency.json']);
  assert.equal(JSON.parse(readFileSync(join(out, 'A Agency.json'), 'utf8')).terms['Official Guidance'].select, 'body');
});

test('the real sources.yaml and ota-overrides.yaml build without clashes', () => {
  const declarations = buildDeclarations(loadSources(), loadOtaOverrides(join(PACKAGE_ROOT, 'ota-overrides.yaml')));
  assert.equal(declarations['EUR-Lex Regulation 261-2004']?.terms['Official Guidance']?.executeClientScripts, true);
  assert.deepEqual(Object.keys(declarations['Delta Air Lines']!.terms).sort(), ['Conditions of Carriage', 'Customer Service Plan']);
});
