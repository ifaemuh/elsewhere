import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, loadRuleFiles, loadSources } from '../load';
import { markVerified } from '../verify';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    by: { type: 'string' },
    date: { type: 'string', default: new Date().toISOString().slice(0, 10) },
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
  },
});

if (!values.by || positionals.length === 0) {
  console.error('Usage: rules:verify <rule-id> [...] --by <github handle> [--date YYYY-MM-DD]');
  process.exit(2);
}

const files = new Map(loadRuleFiles({ dataDir: values['data-dir'], sources: loadSources(values.sources) }).map((e) => [e.rule.id, e.file]));
const missing = positionals.filter((id) => !files.has(id));
if (missing.length) {
  console.error(`Unknown rule id(s): ${missing.join(', ')}`);
  process.exit(1);
}
for (const id of positionals) {
  const file = files.get(id)!;
  writeFileSync(file, markVerified(readFileSync(file, 'utf8'), { by: values.by, date: values.date }));
  console.log(`${id}: verified by ${values.by} on ${values.date}`);
}
