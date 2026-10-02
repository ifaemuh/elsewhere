import type { SupabaseClient } from '@supabase/supabase-js';

export interface ReportRow {
  surface: 'api' | 'mcp';
  endpoint: string;
  client_name: string | null;
  rule_ids: string[];
  missing_facts: string[];
  query: string | null;
  result_count: number;
  status: number;
}

export interface FunnelRow {
  event_name: string;
  metadata: Record<string, unknown>;
}

const SEARCH_ENDPOINTS = new Set(['search', 'search_rules']);

function top(counts: Map<string, number>, n: number): [string, number][] {
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

// Every string cell is user-derived (queries, client names, utm_source), so render it as an inline
// code span: no links, images, HTML, autolinks or emphasis. Backslashes are escaped first so a
// trailing "\" cannot swallow the pipe escape; backticks are replaced so the span cannot close
// early; "@" and "#" are broken so nothing renders as a mention or issue reference.
function cell(value: string | number): string {
  if (typeof value === 'number') return String(value);
  const safe = value
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/`/g, "'")
    .replace(/[\r\n]+/g, ' ')
    .replace(/@/g, '@\u200b')
    .replace(/#/g, '#\u200b');
  return `\`${safe.trim() === '' ? ' ' : safe}\``;
}

function table(header: string[], rows: (string | number)[][]): string {
  if (rows.length === 0) return '_None this week._';
  return [`| ${header.join(' | ')} |`, `| ${header.map(() => '---').join(' | ')} |`, ...rows.map((r) => `| ${r.map(cell).join(' | ')} |`)].join('\n');
}

export function aggregateReport(rows: ReportRow[], funnel: FunnelRow[], opts: { since: string; until: string }): string {
  const rules = new Map<string, number>();
  const zeroResults = new Map<string, number>();
  const missing = new Map<string, number>();
  const clients = new Map<string, number>();
  const funnelCounts = new Map<string, number>();

  for (const row of rows) {
    for (const id of row.rule_ids) bump(rules, id);
    for (const fact of row.missing_facts) bump(missing, fact);
    bump(clients, `${row.surface}: ${row.client_name ?? 'unknown'}`);
    if (row.status === 200 && SEARCH_ENDPOINTS.has(row.endpoint) && row.result_count === 0 && row.query) bump(zeroResults, row.query);
  }
  for (const event of funnel) {
    bump(funnelCounts, `${event.event_name}\u0000${String(event.metadata.utm_source ?? 'unknown')}`);
  }

  return [
    `# Rules API weekly report`,
    ``,
    `${opts.since} → ${opts.until} · ${rows.length} calls`,
    ``,
    `_Counts function invocations only: GET responses served from the CDN cache are not counted._`,
    ``,
    `## Most-returned rules (content topic candidates)`,
    table(['Rule', 'Times returned'], top(rules, 15)),
    ``,
    `## Searches with zero results (Track A backlog and post ideas)`,
    table(['Query', 'Times'], top(zeroResults, 20)),
    ``,
    `## Most common missing facts (vocabulary gaps)`,
    table(['Fact', 'Times'], top(missing, 15)),
    ``,
    `## Clients`,
    table(['Client', 'Calls'], top(clients, 10)),
    ``,
    `## Agent-referred funnel`,
    table(
      ['Step', 'Source', 'Events'],
      top(funnelCounts, 20).map(([key, n]) => {
        const [step, source] = key.split('\u0000');
        return [step, source, n];
      }),
    ),
    ``,
  ].join('\n');
}

type Page<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Supabase caps a response at max_rows (default 1000) whatever .limit() says, so page with .range(). */
export async function fetchAllPages<T>(fetchPage: (from: number, to: number) => Page<T>, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) throw error;
    const batch = data ?? [];
    all.push(...batch);
    if (batch.length < pageSize) return all;
  }
}

export async function fetchReportData(
  db: Pick<SupabaseClient, 'from'>,
  window: { since: Date; until: Date },
  pageSize = 1000,
): Promise<{ rows: ReportRow[]; funnel: FunnelRow[] }> {
  const since = window.since.toISOString();
  const until = window.until.toISOString();
  const rows = await fetchAllPages<ReportRow>(
    (from, to) =>
      db
        .from('rules_api_events')
        .select('surface, endpoint, client_name, rule_ids, missing_facts, query, result_count, status')
        .gte('created_at', since)
        .lt('created_at', until)
        .order('created_at')
        .order('id')
        .range(from, to) as unknown as Page<ReportRow>,
    pageSize,
  );
  // Track C records UTM parameters in funnel_telemetry_events.metadata.
  const funnel = await fetchAllPages<FunnelRow>(
    (from, to) =>
      db
        .from('funnel_telemetry_events')
        .select('event_name, metadata')
        .gte('created_at', since)
        .lt('created_at', until)
        .in('metadata->>utm_source', ['mcp', 'api'])
        .order('created_at')
        .order('id')
        .range(from, to) as unknown as Page<FunnelRow>,
    pageSize,
  );
  return { rows, funnel };
}
