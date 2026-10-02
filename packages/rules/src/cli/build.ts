import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { buildLibrary } from '../library';
import { DEFAULT_DATA_DIR, DEFAULT_SOURCES_FILE, PACKAGE_ROOT, loadRules, loadSources, RulesValidationError } from '../load';

const { values } = parseArgs({
  options: {
    'data-dir': { type: 'string', default: DEFAULT_DATA_DIR },
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
    out: { type: 'string', default: join(PACKAGE_ROOT, 'dist', 'rules.json') },
  },
});

try {
  const sources = loadSources(values.sources);
  const rules = loadRules({ dataDir: values['data-dir'], sources });
  const library = buildLibrary({ rules, sources });
  mkdirSync(dirname(values.out), { recursive: true });
  writeFileSync(values.out, `${JSON.stringify(library, null, 2)}\n`);
  console.log(`Built ${library.rules.length} rules (library ${library.library_version}) → ${values.out}`);
} catch (error) {
  if (error instanceof RulesValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
