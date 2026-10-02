import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, parseDocument } from 'yaml';
import { appendHistory } from '../src/history';
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

test('rules:check-quotes --write-needs-review flips failing verified rules and preserves the rest of the file', () => {
  const dataDir = fixtureData();
  const versions = fixtureVersions();
  const coc = join(versions, 'Example Air/Conditions of Carriage.md');
  writeFileSync(coc, readFileSync(coc, 'utf8').replace('no extra charge', 'a $75 fee'));
  const refunds = join(versions, 'eCFR/title-14-part-260.md');
  writeFileSync(refunds, readFileSync(refunds, 'utf8').replace('prompt refund', 'delayed credit'));

  const flippedFile = join(dataDir, 'flights/fx-missed-connection-single-ticket.yaml');
  const draftFile = join(dataDir, 'flights/fx-draft-cancellation-note.yaml');
  const original = readFileSync(flippedFile, 'utf8');
  const withComment = `# keep this comment\n${original}# trailing comment\n`;
  writeFileSync(flippedFile, withComment);
  const draftBefore = readFileSync(draftFile, 'utf8');
  const longQuote = /^ {6}- text: "Example Air will rebook a passenger who misses a connection on the same ticket on the next available flight at no extra charge\."$/m;
  assert.match(withComment, longQuote);

  const today = new Date().toISOString().slice(0, 10);
  const args = [...fixtureArgs(dataDir), '--versions', versions, '--write-needs-review'];
  const result = run('check-quotes.ts', args);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /fx-missed-connection-single-ticket: not_found in fx-carrier-coc/);

  const after = readFileSync(flippedFile, 'utf8');
  const doc = parse(after);
  assert.equal(doc.status, 'needs_review');
  const before = parse(withComment);
  assert.equal(doc.history.length, before.history.length + 1);
  assert.deepEqual(doc.history.slice(0, -1), before.history);
  const added = doc.history.at(-1);
  assert.equal(added.version, before.version);
  assert.equal(added.status, 'needs_review');
  assert.equal(String(added.date instanceof Date ? added.date.toISOString().slice(0, 10) : added.date), today);
  assert.equal(added.note, 'quote not found in fx-carrier-coc');
  // appended entry is one flow-map line; comments and long scalars untouched
  assert.match(after, /^ {2}- \{ version: 1, status: needs_review, date: [^\n]*note: [^\n]*\}$/m);
  assert.ok(after.startsWith('# keep this comment\n'));
  assert.ok(after.includes('# trailing comment'));
  assert.match(after, longQuote);
  assert.ok(after.includes('summary: >-\n  Miss a connection on the same ticket and the airline rebooks you on the next available\n  flight at no charge.'));

  // verified rule citing the broken refund text flips; the draft rule is untouched
  assert.match(readFileSync(join(dataDir, 'flights/fx-us-refund-cancelled-flight.yaml'), 'utf8'), /^status: needs_review$/m);
  assert.equal(readFileSync(draftFile, 'utf8'), draftBefore);
  assert.match(readFileSync(join(dataDir, 'flights/fx-24h-free-cancellation.yaml'), 'utf8'), /^status: verified$/m);

  // idempotent: needs_review rules are no longer verified, so a second run appends nothing
  const snapshot = readFileSync(flippedFile, 'utf8');
  run('check-quotes.ts', args);
  assert.equal(readFileSync(flippedFile, 'utf8'), snapshot);
});

test('appendHistory always writes a one-line flow map, even with a long note', () => {
  const doc = parseDocument('id: x\nhistory:\n  - { version: 1, status: draft, date: 2026-10-01 }\n');
  appendHistory(doc, {
    version: 1,
    status: 'needs_review',
    date: '2026-10-07',
    note: `quote not found in ${Array.from({ length: 8 }, (_, i) => `fx-long-source-key-${i}`).join(', ')}`,
  });
  const lines = doc.toString({ lineWidth: 0 }).trimEnd().split('\n');
  assert.equal(lines.length, 4);
  assert.match(lines[3]!, /^ {2}- \{ version: 1, status: needs_review, date: .*fx-long-source-key-7.* \}$/);
});

test('rules:check-quotes reports sources with no tracked text', () => {
  const result = run('check-quotes.ts', [...fixtureArgs(fixtureData()), '--versions', mkdtempSync(join(tmpdir(), 'empty-'))]);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /source_missing/);
});

test('rules:check-quotes --write-needs-review never flips a rule for a missing source', () => {
  const dataDir = fixtureData();
  const before = new Map(['flights/fx-missed-connection-single-ticket.yaml', 'flights/fx-us-refund-cancelled-flight.yaml'].map((f) => [f, readFileSync(join(dataDir, f), 'utf8')]));
  const args = [...fixtureArgs(dataDir), '--versions', mkdtempSync(join(tmpdir(), 'empty-')), '--write-needs-review'];
  const result = run('check-quotes.ts', args);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /source_missing/);
  assert.match(result.stdout, /\d+ quote\(s\) not checked because their source text is missing/);
  assert.doesNotMatch(result.stdout, /status set to needs_review/);
  for (const [f, text] of before) assert.equal(readFileSync(join(dataDir, f), 'utf8'), text);
});

test('rules:check-quotes flips on not_found only and names only that source', () => {
  const dataDir = fixtureData();
  const versions = fixtureVersions();
  // fx-carrier-coc present but quote broken; fx-dot-refunds text missing entirely
  const coc = join(versions, 'Example Air/Conditions of Carriage.md');
  writeFileSync(coc, readFileSync(coc, 'utf8').replace('no extra charge', 'a $75 fee'));
  rmSync(join(versions, 'eCFR/title-14-part-260.md'));
  const file = join(dataDir, 'flights/fx-missed-connection-single-ticket.yaml');
  const text = readFileSync(file, 'utf8');
  // add a second source ref so one rule has both failure kinds
  const doc = parseDocument(text);
  const refs = doc.get('sources') as any;
  refs.add(doc.createNode({ id: 's2', source: 'fx-dot-refunds', quotes: [{ text: 'prompt refund', supports: ['summary'] }] }));
  writeFileSync(file, doc.toString({ lineWidth: 0 }));
  const result = run('check-quotes.ts', [...fixtureArgs(dataDir), '--versions', versions, '--write-needs-review']);
  assert.equal(result.status, 1, result.stderr);
  const after = parse(readFileSync(file, 'utf8'));
  assert.equal(after.status, 'needs_review');
  assert.equal(after.history.at(-1).note, 'quote not found in fx-carrier-coc');
});

test('rules:check-quotes requires --versions', () => {
  assert.equal(run('check-quotes.ts', []).status, 2);
});
