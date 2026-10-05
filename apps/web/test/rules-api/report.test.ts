import { describe, expect, it } from 'vitest';
import { aggregateReport, fetchAllPages, fetchReportData, type ReportRow } from '@/lib/rules-api/report';

const row = (overrides: Partial<ReportRow>): ReportRow => ({
  surface: 'mcp',
  endpoint: 'search_rules',
  client_name: 'ChatGPT',
  rule_ids: [],
  missing_facts: [],
  query: null,
  result_count: 1,
  status: 200,
  ...overrides,
});

describe('aggregateReport', () => {
  const rows: ReportRow[] = [
    row({ rule_ids: ['a', 'b'] }),
    row({ rule_ids: ['a'], client_name: 'claude-ai' }),
    row({ endpoint: 'search', surface: 'api', query: 'lost passport abroad', result_count: 0, rule_ids: [] }),
    row({ endpoint: 'search_rules', query: 'lost passport abroad', result_count: 0 }),
    row({ endpoint: 'match_situation', missing_facts: ['flight.touches_us', 'passenger.accepted_alternative'] }),
    row({ endpoint: 'match', surface: 'api', missing_facts: ['flight.touches_us'] }),
  ];
  const funnel = [
    { event_name: 'rule_page_view', metadata: { utm_source: 'mcp' } },
    { event_name: 'rule_page_view', metadata: { utm_source: 'mcp' } },
    { event_name: 'booking_forwarded', metadata: { utm_source: 'api' } },
  ];
  const md = aggregateReport(rows, funnel, { since: '2026-10-01', until: '2026-10-08' });

  it('ranks the most-returned rules', () => {
    expect(md).toContain('| `a` | 2 |');
    expect(md).toContain('| `b` | 1 |');
  });

  it('lists zero-result searches across API and MCP', () => {
    expect(md).toContain('| `lost passport abroad` | 2 |');
  });

  it('ranks missing facts', () => {
    expect(md).toContain('| `flight.touches_us` | 2 |');
  });

  it('counts agent-referred funnel events by step and source', () => {
    expect(md).toContain('| `rule_page_view` | `mcp` | 2 |');
    expect(md).toContain('| `booking_forwarded` | `api` | 1 |');
  });

  it('names the window and totals', () => {
    expect(md).toContain('2026-10-01 → 2026-10-08');
    expect(md).toContain('6 calls');
  });
});

const opts = { since: '2026-10-01', until: '2026-10-08' };
const zero = (query: string, overrides: Partial<ReportRow> = {}) =>
  row({ endpoint: 'search', surface: 'api', query, result_count: 0, ...overrides });

describe('aggregateReport hardening', () => {
  it('renders hostile query text as inert code spans', () => {
    const hostile = [
      '[click](http://evil.example)',
      '![x](http://evil.example/a.png)',
      '<img src=x onerror=alert(1)>',
      'ping @octocat',
      'fixes #123 and org/repo#1',
      'a|b',
      'a\\|b',
      'tick `code` tick',
      'http://evil.example',
    ];
    const md = aggregateReport(hostile.map((q) => zero(q)), [], opts);
    const section = md.split('## Searches with zero results')[1].split('## Most common')[0];
    const lines = section.split('\n').filter((l) => l.startsWith('| `'));
    expect(lines).toHaveLength(hostile.length);
    for (const line of lines) {
      expect(line).toMatch(/^\| `.*` \| 1 \|$/);
      // exactly three unescaped pipes per row: the cell delimiters
      expect(line.replace(/\\./g, '').split('|')).toHaveLength(4);
    }
    expect(md).not.toMatch(/@octocat/);
    expect(md).not.toMatch(/#123/);
    expect(md).toContain('a\\\\\\|b');
    expect(md).toContain('| `a\\|b` | 1 |');
  });

  it('counts only status 200 as a zero-result search', () => {
    const md = aggregateReport([zero('good', { status: 200 }), zero('rate limited', { status: 429 })], [], opts);
    expect(md).toContain('| `good` | 1 |');
    expect(md).not.toContain('rate limited');
  });

  it('says so when there is nothing to report', () => {
    const md = aggregateReport([], [], opts);
    expect(md).toContain('0 calls');
    expect(md.match(/_None this week\._/g)).toHaveLength(5);
  });

  it('cuts top-N lists and breaks ties alphabetically', () => {
    const rules = Array.from({ length: 20 }, (_, i) => `r${String(i).padStart(2, '0')}`);
    const md = aggregateReport([row({ rule_ids: [...rules].reverse() })], [], opts);
    const lines = md.split('\n').filter((l) => /^\| `r\d\d` \|/.test(l));
    expect(lines).toHaveLength(15);
    expect(lines[0]).toBe('| `r00` | 1 |');
    expect(lines[14]).toBe('| `r14` | 1 |');
  });
});

type Call = { table: string; ops: [string, ...unknown[]][] };

function pagedDb(data: Record<string, unknown[]>, calls: Call[], errorOn?: string) {
  return {
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const q: Record<string, unknown> = {};
      for (const op of ['select', 'gte', 'lt', 'in', 'order']) {
        q[op] = (...args: unknown[]) => (call.ops.push([op, ...args]), q);
      }
      q.range = async (from: number, to: number) => {
        call.ops.push(['range', from, to]);
        if (errorOn === table) return { data: null, error: new Error('boom') };
        return { data: data[table].slice(from, to + 1), error: null };
      };
      return q;
    },
  } as unknown as Parameters<typeof fetchReportData>[0];
}

describe('fetchAllPages', () => {
  it('keeps going until a short page and throws on error', async () => {
    const all = Array.from({ length: 5 }, (_, i) => i);
    const pages: number[][] = [];
    const got = await fetchAllPages<number>(async (from, to) => {
      pages.push([from, to]);
      return { data: all.slice(from, to + 1), error: null };
    }, 2);
    expect(got).toEqual(all);
    expect(pages).toEqual([[0, 1], [2, 3], [4, 5]]);
    await expect(fetchAllPages(async () => ({ data: null, error: new Error('x') }))).rejects.toThrow('x');
  });
});

describe('fetchReportData', () => {
  it('pages both tables with ordering and a bounded window', async () => {
    const events = Array.from({ length: 5 }, (_, i) => row({ rule_ids: [`r${i}`] }));
    const funnel = Array.from({ length: 3 }, () => ({ event_name: 'rule_page_view', metadata: { utm_source: 'mcp' } }));
    const calls: Call[] = [];
    const since = new Date('2026-10-01T00:00:00Z');
    const until = new Date('2026-10-08T00:00:00Z');
    const out = await fetchReportData(pagedDb({ rules_api_events: events, funnel_telemetry_events: funnel }, calls), { since, until }, 2);
    expect(out.rows).toHaveLength(5);
    expect(out.funnel).toHaveLength(3);
    expect(calls.filter((c) => c.table === 'rules_api_events')).toHaveLength(3);
    expect(calls.filter((c) => c.table === 'funnel_telemetry_events')).toHaveLength(2);
    for (const call of calls) {
      expect(call.ops).toContainEqual(['gte', 'created_at', since.toISOString()]);
      expect(call.ops).toContainEqual(['lt', 'created_at', until.toISOString()]);
      expect(call.ops).toContainEqual(['order', 'created_at']);
      expect(call.ops).toContainEqual(['order', 'id']);
    }
    expect(calls.at(-1)!.ops).toContainEqual(['in', 'metadata->>utm_source', ['mcp', 'api']]);
  });

  it('surfaces query errors', async () => {
    await expect(
      fetchReportData(pagedDb({ rules_api_events: [], funnel_telemetry_events: [] }, [], 'rules_api_events'), {
        since: new Date(0),
        until: new Date(),
      }),
    ).rejects.toThrow('boom');
  });
});
