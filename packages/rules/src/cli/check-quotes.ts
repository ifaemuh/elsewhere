import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { parse } from 'yaml';
import type { Rule } from '../schema';
import { parseArgs } from 'node:util';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, loadRuleFiles, loadSources, RulesValidationError } from '../load';
import { markNeedsReview } from '../history';
import { checkQuotes, checkSupports, partitionCiIssues, quoteFingerprints, sourceTextPath } from '../quotes';

// Exit codes: 0 clean, 1 issues found, 2 usage, 3 load failure, 4 crash, 5 a flip could not be written. Node's default
// exit for an uncaught throw is 1, which would be mistaken for "issues found".
process.on('uncaughtException', (error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : error);
  process.exit(4);
});

const { values } = parseArgs({
  options: {
    versions: { type: 'string' },
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
    'write-needs-review': { type: 'boolean', default: false },
    'base-ref': { type: 'string' },
  },
});

if (!values.versions) {
  console.error('Usage: rules:check-quotes --versions <checkout of elsewhere-sources-versions> [--write-needs-review] [--base-ref <git ref>]');
  process.exit(2);
}

let entries;
let sources;
try {
  sources = loadSources(values.sources);
  entries = loadRuleFiles({ dataDir: values['data-dir'], sources }).filter((e) => e.rule.status !== 'retired');
} catch (error) {
  if (error instanceof RulesValidationError) {
    console.error(error.message);
    // 3 = rules or sources failed to load; distinct from 1 (quote or supports issues found).
    process.exit(3);
  }
  throw error;
}

const texts: Record<string, string> = {};
for (const key of new Set(entries.flatMap((e) => e.rule.sources.map((ref) => ref.source)))) {
  const path = sourceTextPath(sources[key]!, values.versions);
  if (existsSync(path)) texts[key] = readFileSync(path, 'utf8');
}

/** Each rule's quotes as of the merge-base with `ref`; a rule file absent there is new (no entry). */
function baseFingerprints(ref: string, entries: { rule: Rule; file: string }[]): Map<string, Set<string>> {
  const git = (cwd: string, ...args: string[]) => spawnSync('git', args, { cwd, encoding: 'utf8' });
  const base = new Map<string, Set<string>>();
  for (const { rule, file } of entries) {
    const cwd = dirname(file);
    const prefix = git(cwd, 'rev-parse', '--show-prefix');
    const mergeBase = git(cwd, 'merge-base', 'HEAD', ref);
    if (prefix.status !== 0 || mergeBase.status !== 0) {
      console.error(`--base-ref ${ref}: cannot resolve a merge-base (${(mergeBase.stderr || prefix.stderr).trim()})`);
      process.exit(3);
    }
    const shown = git(cwd, 'show', `${mergeBase.stdout.trim()}:${prefix.stdout.trim()}${basename(file)}`);
    if (shown.status !== 0) continue; // not in the base: every quote in this rule is new
    try {
      base.set(rule.id, quoteFingerprints(parse(shown.stdout) as Parameters<typeof quoteFingerprints>[0]));
    } catch {
      // unparseable at base: treat every quote as new
    }
  }
  return base;
}

const quoteIssues = checkQuotes(entries.map((e) => e.rule), texts);
const supportIssues = entries.flatMap((e) => checkSupports(e.rule));

// CI mode: only quotes the PR added or changed, and unchanged quotes of verified rules, block.
const ci = values['base-ref'] ? partitionCiIssues(quoteIssues, entries.map((e) => e.rule), baseFingerprints(values['base-ref'], entries)) : undefined;
const blocking = ci ? ci.failures : quoteIssues;

const describe = (issue: (typeof quoteIssues)[number]) =>
  `${issue.rule_id}: ${issue.reason} in ${issue.source_key}: "${issue.quote.slice(0, 120)}"`;
for (const issue of blocking) console.log(describe(issue));
for (const issue of ci?.warnings ?? []) console.log(`warning (unchanged quote, not blocking): ${describe(issue)}`);
for (const message of supportIssues) console.log(message);

let writeFailures = 0;
if (values['write-needs-review']) {
  const today = new Date().toISOString().slice(0, 10);
  for (const { rule, file } of entries) {
    // Only a quote that is absent from fetched text flips a rule; a missing source is an outage.
    const failingSources = [
      ...new Set(quoteIssues.filter((i) => i.rule_id === rule.id && i.reason === 'not_found').map((i) => i.source_key)),
    ];
    if (rule.status !== 'verified' || failingSources.length === 0) continue;
    try {
      const updated = markNeedsReview(readFileSync(file, 'utf8'), {
        version: rule.version,
        status: 'needs_review',
        date: today,
        note: `quote not found in ${failingSources.join(', ')}`,
      });
      writeFileSync(file, updated);
      console.log(`${rule.id}: status set to needs_review`);
    } catch (error) {
      // One bad file must not stop the others from being flagged; the exit code still reports it.
      writeFailures++;
      console.error(`${rule.id}: could not set needs_review: ${(error as Error).message}`);
    }
  }
}

const total = blocking.length + supportIssues.length;
const missing = quoteIssues.filter((i) => i.reason === 'source_missing').length;
const warned = ci?.warnings.length ?? 0;
console.log(
  total
    ? `${total} issue(s) in ${entries.length} rule(s)`
    : warned
      ? `No blocking issues in ${entries.length} rule(s); ${warned} warning(s) on unchanged quotes`
      : `All quotes found in ${entries.length} rule(s)`,
);
if (missing) console.log(`${missing} quote(s) not checked because their source text is missing (no rule status changed for these)`);
// 5 = some rule could not be flagged; the others were, so callers may still publish them.
if (writeFailures) process.exit(5);
process.exit(total ? 1 : 0);
