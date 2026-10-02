import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse } from 'yaml';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

export function readFixtureRule(id: string): Record<string, unknown> {
  return parse(readFileSync(join(FIXTURES, 'rules', `${id}.yaml`), 'utf8'));
}
