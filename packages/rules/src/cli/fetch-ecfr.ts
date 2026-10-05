import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { fetchEcfrPart, guardTruncated } from '../ecfr';
import { DEFAULT_SOURCES_FILE, loadSources } from '../load';
import { sourceTextPath } from '../quotes';

const { values } = parseArgs({
  options: {
    sources: { type: 'string', default: DEFAULT_SOURCES_FILE },
    versions: { type: 'string' },
  },
});

if (!values.versions) {
  console.error('Usage: rules:fetch-ecfr --versions <checkout of elsewhere-sources-versions>');
  process.exit(2);
}

let failed = 0;
for (const source of Object.values(loadSources(values.sources))) {
  if (!('ecfr' in source.detector)) continue;
  const path = sourceTextPath(source, values.versions);
  try {
    const part = await fetchEcfrPart(source.detector.ecfr);
    const current = existsSync(path) ? readFileSync(path, 'utf8') : '';
    guardTruncated(current, part.text);
    if (current === part.text) {
      console.log(`${source.key}: unchanged (amended ${part.amendedOn})`);
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, part.text);
    console.log(`${source.key}: ${current ? 'updated' : 'first record'} (amended ${part.amendedOn}, as of ${part.asOf})`);
  } catch (error) {
    failed++;
    console.error(`${source.key}: ${(error as Error).message}`);
  }
}
process.exit(failed ? 1 : 0);
