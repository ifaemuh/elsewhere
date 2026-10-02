import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, loadRuleFiles, loadSources, RulesValidationError } from '../load';
import { markNeedsReview } from '../history';
import { checkQuotes, checkSupports, sourceTextPath } from '../quotes';

// Exit codes: 0 clean, 1 issues found, 2 usage, 3 load failure, 4 crash. Node's default
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
  },
});

if (!values.versions) {
  console.error('Usage: rules:check-quotes --versions <checkout of elsewhere-sources-versions> [--write-needs-review]');
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

const quoteIssues = checkQuotes(entries.map((e) => e.rule), texts);
const supportIssues = entries.flatMap((e) => checkSupports(e.rule));

for (const issue of quoteIssues) {
  console.log(`${issue.rule_id}: ${issue.reason} in ${issue.source_key}: "${issue.quote.slice(0, 120)}"`);
}
for (const message of supportIssues) console.log(message);

if (values['write-needs-review']) {
  const today = new Date().toISOString().slice(0, 10);
  for (const { rule, file } of entries) {
    // Only a quote that is absent from fetched text flips a rule; a missing source is an outage.
    const failingSources = [
      ...new Set(quoteIssues.filter((i) => i.rule_id === rule.id && i.reason === 'not_found').map((i) => i.source_key)),
    ];
    if (rule.status !== 'verified' || failingSources.length === 0) continue;
    const updated = markNeedsReview(readFileSync(file, 'utf8'), {
      version: rule.version,
      status: 'needs_review',
      date: today,
      note: `quote not found in ${failingSources.join(', ')}`,
    });
    writeFileSync(file, updated);
    console.log(`${rule.id}: status set to needs_review`);
  }
}

const total = quoteIssues.length + supportIssues.length;
const missing = quoteIssues.filter((i) => i.reason === 'source_missing').length;
console.log(total ? `${total} issue(s) in ${entries.length} rule(s)` : `All quotes found in ${entries.length} rule(s)`);
if (missing) console.log(`${missing} quote(s) not checked because their source text is missing (no rule status changed for these)`);
process.exit(total ? 1 : 0);
