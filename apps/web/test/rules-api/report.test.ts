import { describe, expect, it } from 'vitest';
import { aggregateReport, type ReportRow } from '@/lib/rules-api/report';

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
    expect(md).toContain('| a | 2 |');
    expect(md).toContain('| b | 1 |');
  });

  it('lists zero-result searches across API and MCP', () => {
    expect(md).toContain('| lost passport abroad | 2 |');
  });

  it('ranks missing facts', () => {
    expect(md).toContain('| flight.touches_us | 2 |');
  });

  it('counts agent-referred funnel events by step and source', () => {
    expect(md).toContain('| rule_page_view | mcp | 2 |');
    expect(md).toContain('| booking_forwarded | api | 1 |');
  });

  it('names the window and totals', () => {
    expect(md).toContain('2026-10-01 → 2026-10-08');
    expect(md).toContain('6 calls');
  });
});
