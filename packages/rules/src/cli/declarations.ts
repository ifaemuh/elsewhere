import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DEFAULT_SOURCES_FILE, PACKAGE_ROOT, loadSources, RulesValidationError } from '../load';
import { buildDeclarations, loadOtaOverrides } from '../ota';

const { values } = parseArgs({
  options: {
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
    overrides: { type: 'string', default: join(PACKAGE_ROOT, 'ota-overrides.yaml') },
    out: { type: 'string' },
  },
});

if (!values.out) {
  console.error('Usage: rules:declarations --out <declarations dir of elsewhere-sources-declarations>');
  process.exit(2);
}

try {
  const overrides = existsSync(values.overrides) ? loadOtaOverrides(values.overrides) : {};
  const declarations = buildDeclarations(loadSources(values.sources), overrides);
  mkdirSync(values.out, { recursive: true });
  const written = new Set<string>();
  for (const [service, declaration] of Object.entries(declarations)) {
    const file = `${service}.json`;
    writeFileSync(join(values.out, file), `${JSON.stringify(declaration, null, 2)}\n`);
    written.add(file);
  }
  for (const file of readdirSync(values.out)) {
    if (file.endsWith('.json') && !file.endsWith('.history.json') && !written.has(file)) {
      rmSync(join(values.out, file));
      console.log(`removed ${file}`);
    }
  }
  console.log(`Wrote ${written.size} declaration(s) → ${values.out}`);
} catch (error) {
  if (error instanceof RulesValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}
