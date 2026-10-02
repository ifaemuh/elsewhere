import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { describeFact, factValueFits, FACTS, isFactName } from './facts';
import { DOMAINS, RuleSchema, SourceSchema, type Rule, type Source } from './schema';

export const PACKAGE_ROOT = fileURLToPath(new URL('..', import.meta.url));
export const DEFAULT_DATA_DIR = join(PACKAGE_ROOT, 'data');
export const DEFAULT_SOURCES_FILE = join(PACKAGE_ROOT, 'sources.yaml');

export interface ValidationIssue {
  file: string;
  path: string;
  message: string;
}

export class RulesValidationError extends Error {
  constructor(readonly issues: ValidationIssue[]) {
    const lines = issues.slice(0, 20).map((i) => `  ${i.file}${i.path ? ` → ${i.path}` : ''}: ${i.message}`);
    const more = issues.length > 20 ? `\n  …and ${issues.length - 20} more` : '';
    super(`${issues.length} rule validation issue(s):\n${lines.join('\n')}${more}`);
    this.name = 'RulesValidationError';
  }
}

export function loadSources(file: string = DEFAULT_SOURCES_FILE): Record<string, Source> {
  const raw: unknown = parse(readFileSync(file, 'utf8')) ?? {};
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new RulesValidationError([{ file, path: '', message: 'must be a mapping of source key → source' }]);
  }
  const issues: ValidationIssue[] = [];
  const sources: Record<string, Source> = {};
  for (const [key, value] of Object.entries(raw as Record<string, object>)) {
    const result = SourceSchema.safeParse({ key, ...value });
    if (result.success) sources[key] = result.data;
    else for (const issue of result.error.issues) issues.push({ file, path: [key, ...issue.path].join('.'), message: issue.message });
  }
  if (issues.length) throw new RulesValidationError(issues);
  return sources;
}

const OPERATORS = ['eq', 'in', 'gte', 'lte', 'gt', 'lt', 'exists'] as const;

function conditionIssues(node: unknown, path: string): { path: string; message: string }[] {
  if (typeof node !== 'object' || node === null) return [];
  const record = node as Record<string, unknown>;
  const groups = ['all', 'any'].filter((group) => Array.isArray(record[group]));
  if (groups.length) {
    return groups.flatMap((group) =>
      (record[group] as unknown[]).flatMap((child, i) => conditionIssues(child, `${path}.${group}.${i}`)),
    );
  }
  if (!('fact' in record)) return [];
  const fact = String(record.fact);
  if (!isFactName(fact)) return [{ path, message: `unknown fact "${fact}"` }];
  const ops = OPERATORS.filter((op) => op in record);
  if (ops.length !== 1) return [{ path, message: `condition on "${fact}" must have exactly one operator, found ${ops.length}` }];
  const op = ops[0];
  const value = record[op];
  const type = FACTS[fact].type;
  if (op === 'exists') return typeof value === 'boolean' ? [] : [{ path, message: 'exists takes true or false' }];
  if (op === 'eq' || op === 'in') {
    const values = op === 'in' && Array.isArray(value) ? value : [value];
    return values
      .filter((v) => !factValueFits(fact, v))
      .map((v) => ({ path, message: `"${fact}" expects ${describeFact(fact)}, got ${JSON.stringify(v)}` }));
  }
  return type === 'number' ? [] : [{ path, message: `${op} only works on number facts; "${fact}" is ${describeFact(fact)}` }];
}

/** Internal: rules with the file each came from. */
export function loadRuleFiles(
  opts: { dataDir?: string; sources?: Record<string, Source> } = {},
): { rule: Rule; file: string }[] {
  const dataDir = opts.dataDir ?? DEFAULT_DATA_DIR;
  if (!existsSync(dataDir)) return [];
  const sources = opts.sources ?? loadSources();
  const files = readdirSync(dataDir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => join(dataDir, f))
    .sort();

  const issues: ValidationIssue[] = [];
  const loaded: { rule: Rule; file: string }[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    const shown = relative(dataDir, file);
    const add = (path: string, message: string) => issues.push({ file: shown, path, message });
    let raw: Record<string, unknown>;
    try {
      raw = parse(readFileSync(file, 'utf8')) ?? {};
    } catch (error) {
      add('', `invalid YAML: ${(error as Error).message}`);
      continue;
    }

    const precise = conditionIssues(raw.applies_when, 'applies_when');
    for (const issue of precise) add(issue.path, issue.message);
    const result = RuleSchema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues) {
        // The precise pass already explains bad conditions; zod's union error would only repeat it noisily.
        if (precise.length && issue.path[0] === 'applies_when') continue;
        add(issue.path.join('.'), issue.message);
      }
      continue;
    }
    const rule = result.data;

    if (basename(file, '.yaml') !== rule.id) add('id', `file name must be ${rule.id}.yaml`);
    const folder = basename(dirname(file));
    if ((DOMAINS as readonly string[]).includes(folder) && folder !== rule.domain) {
      add('domain', `rule is in ${folder}/ but its domain is ${rule.domain}`);
    }
    const previous = seen.get(rule.id);
    if (previous) add('id', `duplicate id, also used by ${previous}`);
    seen.set(rule.id, shown);
    rule.sources.forEach((ref, i) => {
      if (!sources[ref.source]) add(`sources.${i}.source`, `unknown source "${ref.source}" (add it to sources.yaml)`);
    });
    loaded.push({ rule, file });
  }

  for (const { rule, file } of loaded) {
    if (rule.replaced_by !== undefined && !seen.has(rule.replaced_by)) {
      issues.push({ file: relative(dataDir, file), path: 'replaced_by', message: `no rule "${rule.replaced_by}"` });
    }
  }

  if (issues.length) throw new RulesValidationError(issues);
  return loaded.sort((a, b) => a.rule.id.localeCompare(b.rule.id));
}

/** Reads data/**\/*.yaml; validates schema, unique ids, filename = id, known facts,
 *  fact value types, that every sources[].source exists in `sources`, that the last
 *  history entry equals { version, status }, that history versions never decrease,
 *  and that replaced_by (if set) names an existing rule and status is retired. */
export function loadRules(opts: { dataDir?: string; sources?: Record<string, Source> } = {}): Rule[] {
  return loadRuleFiles(opts).map((entry) => entry.rule);
}
