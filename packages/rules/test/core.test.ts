import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as core from '../src/core';
import { sourceTextPath } from '../src/quotes';

const srcDir = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

test('core exposes the bundle-safe values and omits load and library values', () => {
  for (const name of ['FACTS', 'RuleSchema', 'matchRules', 'checkQuotes', 'sourceTextPath']) {
    assert.ok(name in core, `${name} missing from core`);
  }
  for (const name of ['loadRules', 'loadSources', 'RulesValidationError', 'buildLibrary', 'changesFromHistory']) {
    assert.ok(!(name in core), `${name} must not be in core`);
  }
});

test('value-import graph of core.ts has no ./load, ./library or node: imports', () => {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(resolve(srcDir, `${file}.ts`), 'utf8');
    // join multi-line statements, then split on statement ends
    for (const stmt of text.replace(/\/\/.*$/gm, '').split(';')) {
      const s = stmt.trim();
      if (/^(import|export)\s+type\b/.test(s)) continue;
      const m = /^(?:import|export)\b[\s\S]*?\bfrom\s+['"]([^'"]+)['"]$/.exec(s) ?? /^import\s+['"]([^'"]+)['"]$/.exec(s);
      if (!m) continue;
      const spec = m[1]!;
      assert.ok(!spec.startsWith('node:'), `${file}.ts imports ${spec}`);
      assert.ok(spec !== './load' && spec !== './library', `${file}.ts value-imports ${spec}`);
      if (spec.startsWith('./')) visit(spec.slice(2));
    }
  };
  visit('core');
  for (const f of ['facts', 'schema', 'match', 'quotes']) assert.ok(seen.has(f), `walk did not reach ${f}`);
});

test('sourceTextPath joins like posix path.join, including a trailing slash', () => {
  const src = { key: 'k', url: 'https://x.gov', kind: 'government_page', detector: { changedetection: { watch_uuid: 'u' } } } as const;
  assert.equal(sourceTextPath(src, '/v/'), '/v/changedetection/k.md');
  assert.equal(sourceTextPath(src, 'v'), 'v/changedetection/k.md');
});
