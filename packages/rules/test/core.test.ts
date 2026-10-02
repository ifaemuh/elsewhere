import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { dirname, posix, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import * as core from '../src/core';
import * as index from '../src/index';
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

test('value-import graph of core.ts has no ./load, ./library or node builtin imports', () => {
  const seen = new Set<string>();
  const visit = (file: string): void => {
    if (seen.has(file)) return;
    seen.add(file);
    const text = readFileSync(resolve(srcDir, `${file}.ts`), 'utf8');
    const sf = ts.createSourceFile(`${file}.ts`, text, ts.ScriptTarget.Latest, true);
    const check = (spec: string): void => {
      const bare = spec.replace(/^node:/, '');
      assert.ok(!spec.startsWith('node:') && !builtinModules.includes(bare), `${file}.ts imports builtin ${spec}`);
      if (!spec.startsWith('.')) return;
      const target = posix.normalize(posix.join(posix.dirname(file), spec)).replace(/\.(ts|js)$/, '');
      assert.ok(target !== 'load' && target !== 'library', `${file}.ts value-imports ${spec}`);
      visit(target);
    };
    const walk = (node: ts.Node): void => {
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
      ) {
        const typeOnly = ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly;
        if (!typeOnly) check(node.moduleSpecifier.text);
      } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const arg = node.arguments[0];
        assert.ok(arg && ts.isStringLiteralLike(arg), `${file}.ts has a non-literal dynamic import`);
        check(arg.text);
      } else if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) {
        assert.fail(`${file}.ts uses import.meta`);
      }
      ts.forEachChild(node, walk);
    };
    walk(sf);
  };
  visit('core');
  for (const f of ['facts', 'schema', 'match', 'quotes']) assert.ok(seen.has(f), `walk did not reach ${f}`);
});

test('core exports exactly index minus the five excluded names', () => {
  const excluded = ['loadRules', 'loadSources', 'RulesValidationError', 'buildLibrary', 'changesFromHistory'];
  assert.deepEqual(
    Object.keys(core).sort(),
    Object.keys(index).filter((k) => !excluded.includes(k)).sort(),
  );
});

test('sourceTextPath joins like posix path.join, including a trailing slash', () => {
  const src = { key: 'k', url: 'https://x.gov', kind: 'government_page', detector: { changedetection: { watch_uuid: 'u' } } } as const;
  assert.equal(sourceTextPath(src, '/v/'), '/v/changedetection/k.md');
  assert.equal(sourceTextPath(src, 'v'), 'v/changedetection/k.md');
});

test('sourceTextPath equals path.posix.join for several inputs and rejects an empty dir', () => {
  const src = { key: 'k', url: 'https://x.gov', kind: 'government_page', detector: { changedetection: { watch_uuid: 'u' } } } as const;
  for (const dir of ['/v', '/v/', 'v', 'a/b', '/a/b/']) {
    assert.equal(sourceTextPath(src, dir), posix.join(dir, 'changedetection', 'k.md'));
  }
  assert.throws(() => sourceTextPath(src, ''), /versionsDir/);
});
