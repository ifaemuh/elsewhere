import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURES } from './helpers';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function run(script: string, args: string[]) {
  return spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'src/cli', script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

/** A versions checkout laid out the way sourceTextPath expects, from the fixture texts. */
function fixtureVersions(): string {
  const dir = mkdtempSync(join(tmpdir(), 'versions-'));
  const put = (path: string, key: string) => {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), readFileSync(join(FIXTURES, 'sources', `${key}.md`), 'utf8'));
  };
  put('eCFR/title-14-part-260.md', 'fx-dot-refunds');
  put('eCFR/title-14-part-259.md', 'fx-dot-reservations');
  put('Example EU Guidance/Official Guidance.md', 'fx-eu-guidance');
  put('Example Air/Conditions of Carriage.md', 'fx-carrier-coc');
  return dir;
}

function fixtureData(): string {
  const dir = mkdtempSync(join(tmpdir(), 'data-'));
  cpSync(join(FIXTURES, 'rules'), join(dir, 'flights'), { recursive: true });
  return dir;
}

const fixtureArgs = (dataDir: string) => ['--data-dir', dataDir, '--sources', join(FIXTURES, 'sources.yaml')];

test('rules:build writes the library JSON', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'out-')), 'rules.json');
  const result = run('build.ts', [...fixtureArgs(fixtureData()), '--out', out]);
  assert.equal(result.status, 0, result.stderr);
  const library = JSON.parse(readFileSync(out, 'utf8'));
  assert.equal(library.schema_version, 1);
  assert.equal(library.rules.length, 5);
  assert.deepEqual(Object.keys(library.sources).sort(), ['fx-carrier-coc', 'fx-dot-refunds', 'fx-dot-reservations', 'fx-eu-guidance']);
  assert.equal(library.changes[0].date, '2026-10-06');
  assert.match(result.stdout, /Built 5 rules/);
});

test('rules:build exits 1 with the issue list on invalid rules', () => {
  const dataDir = fixtureData();
  writeFileSync(join(dataDir, 'flights/broken.yaml'), 'id: broken\n');
  const result = run('build.ts', [...fixtureArgs(dataDir), '--out', join(dataDir, 'out.json')]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /broken\.yaml/);
});

test('rules:check-quotes passes when every quote is present', () => {
  const result = run('check-quotes.ts', [...fixtureArgs(fixtureData()), '--versions', fixtureVersions()]);
  assert.equal(result.status, 0, result.stdout);
  assert.match(result.stdout, /All quotes found in 5 rule\(s\)/);
});

test('rules:check-quotes --write-needs-review flips only failing verified rules', () => {
  const dataDir = fixtureData();
  const versions = fixtureVersions();
  const coc = join(versions, 'Example Air/Conditions of Carriage.md');
  writeFileSync(coc, readFileSync(coc, 'utf8').replace('no extra charge', 'a $75 fee'));

  const result = run('check-quotes.ts', [...fixtureArgs(dataDir), '--versions', versions, '--write-needs-review']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /fx-missed-connection-single-ticket: not_found in fx-carrier-coc/);
  const flipped = readFileSync(join(dataDir, 'flights/fx-missed-connection-single-ticket.yaml'), 'utf8');
  assert.match(flipped, /^status: needs_review$/m);
  assert.match(flipped, /status: needs_review[\s\S]*note: quote not found in fx-carrier-coc/);
  assert.match(readFileSync(join(dataDir, 'flights/fx-us-refund-cancelled-flight.yaml'), 'utf8'), /^status: verified$/m);
});

test('rules:check-quotes reports sources with no tracked text', () => {
  const result = run('check-quotes.ts', [...fixtureArgs(fixtureData()), '--versions', mkdtempSync(join(tmpdir(), 'empty-'))]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /source_missing/);
});

test('rules:check-quotes requires --versions', () => {
  assert.equal(run('check-quotes.ts', []).status, 2);
});
