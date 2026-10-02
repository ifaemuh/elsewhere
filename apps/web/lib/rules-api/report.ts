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

// Queries are user text: keep them from breaking the table or pinging GitHub users in the issue.
function cell(value: string | number): string {
  return String(value).replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').replace(/@/g, '@\u200b');
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
    if (SEARCH_ENDPOINTS.has(row.endpoint) && row.result_count === 0 && row.query) bump(zeroResults, row.query);
  }
  for (const event of funnel) {
    bump(funnelCounts, `${event.event_name}\u0000${String(event.metadata.utm_source ?? 'unknown')}`);
  }

  return [
    `# Rules API weekly report`,
    ``,
    `${opts.since} → ${opts.until} · ${rows.length} calls`,
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
