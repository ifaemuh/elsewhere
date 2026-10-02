import { createHash } from 'node:crypto';
import type { Rule, RuleStatus, Source } from './schema';

export interface RuleChange {
  rule_id: string;
  from_version: number | null;
  to_version: number;
  from_status: RuleStatus | null;
  to_status: RuleStatus;
  date: string;
}

export interface RulesLibrary {
  schema_version: 1;
  library_version: string;
  generated_at: string;
  rules: Rule[];
  sources: Record<string, Source>;
  changes: RuleChange[];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Derives the changes feed from each rule's `history` (no git needed, so it is
 *  identical in CI, on Vercel's shallow clones, and locally). Consecutive entries
 *  become one RuleChange; the first entry has from_version/from_status = null.
 *  Newest first: by date, then rule id, then later entries before earlier ones. */
export function changesFromHistory(rules: Rule[]): RuleChange[] {
  const ordered: { change: RuleChange; index: number }[] = [];
  for (const rule of rules) {
    rule.history.forEach((entry, index) => {
      const previous = rule.history[index - 1];
      ordered.push({
        index,
        change: {
          rule_id: rule.id,
          from_version: previous?.version ?? null,
          to_version: entry.version,
          from_status: previous?.status ?? null,
          to_status: entry.status,
          date: entry.date,
        },
      });
    });
  }
  return ordered
    .sort(
      (a, b) =>
        b.change.date.localeCompare(a.change.date) ||
        a.change.rule_id.localeCompare(b.change.rule_id) ||
        b.index - a.index,
    )
    .map((entry) => entry.change);
}

export function buildLibrary(opts: { rules: Rule[]; sources: Record<string, Source>; now?: Date }): RulesLibrary {
  const now = opts.now ?? new Date();
  const rules = [...opts.rules].sort((a, b) => a.id.localeCompare(b.id));
  const cited = [...new Set(rules.flatMap((rule) => rule.sources.map((ref) => ref.source)))].sort();
  const sources = Object.fromEntries(
    cited.filter((key) => opts.sources[key]).map((key) => [key, opts.sources[key] as Source]),
  );
  const hash = createHash('sha256').update(canonicalJson(rules)).digest('hex').slice(0, 7);
  return {
    schema_version: 1,
    library_version: `${now.toISOString().slice(0, 10)}.${hash}`,
    generated_at: now.toISOString(),
    rules,
    sources,
    changes: changesFromHistory(rules),
  };
}
