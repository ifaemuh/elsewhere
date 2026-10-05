import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '../..');
const SKIP = new Set(['node_modules', '.next', 'dist', 'coverage']);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (SKIP.has(entry.name)) return [];
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx|mts|js|jsx|mjs)$/.test(entry.name) ? [path] : [];
  });
}

describe('import boundary', () => {
  it('imports @elsewhere/rules only through the bundle-safe /core entry', () => {
    const bare = /(from\s+|import\s*\(\s*|import\s+|require\(\s*)['"]@elsewhere\/rules['"]/;
    const offenders = sourceFiles(root).filter((file) => file !== __filename && bare.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
