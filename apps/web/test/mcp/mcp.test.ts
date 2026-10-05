import { afterEach, describe, expect, it } from 'vitest';
import { after } from 'next/server';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { handleMcp } from '@/lib/mcp/route-handler';
import { setLibrary } from '../helpers/library-holder';
import { fixtureRule, goldenCases, makeLibrary, standardLibrary } from '../helpers/fixture-library';

const open: Client[] = [];

async function connect(): Promise<Client> {
  const client = new Client({ name: 'vitest', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL('https://elsewhere.test/api/mcp'), {
    fetch: (url, init) => handleMcp(new Request(url, init)),
  });
  await client.connect(transport);
  open.push(client);
  return client;
}

function text(result: { content?: unknown }): string {
  const blocks = (result.content ?? []) as { type: string; text?: string }[];
  return blocks.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
}

afterEach(async () => {
  await Promise.all(open.splice(0).map((c) => c.close()));
});

describe('MCP server', () => {
  it('lists exactly five read-only, titled tools', async () => {
    setLibrary(standardLibrary());
    const { tools } = await (await connect()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_rule', 'list_facts', 'list_recent_changes', 'match_situation', 'search_rules']);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
      expect(tool.title ?? tool.annotations?.title).toBeTruthy();
    }
  });

  it('sends server instructions about citations, page links, and legal advice', async () => {
    setLibrary(standardLibrary());
    const instructions = (await connect()).getInstructions() ?? '';
    expect(instructions).toContain('page_url');
    expect(instructions).toContain('not legal advice');
    expect(instructions).toContain('needs_review');
  });

  it('search_rules returns summaries with mcp-tagged links and a disclaimer', async () => {
    setLibrary(standardLibrary());
    const result = await (await connect()).callTool({ name: 'search_rules', arguments: { query: 'cancelled flight refund' } });
    const rules = (result.structuredContent as { rules: { id: string; page_url: string }[] }).rules;
    expect(rules[0].id).toBe('test-cancelled-refund');
    expect(rules[0].page_url).toContain('utm_source=mcp');
    expect(text(result)).toContain('Not legal advice');
    expect(text(result)).toContain(rules[0].page_url);
    expect(after).toHaveBeenCalled();
  });

  it('never leaks drafts through any tool', async () => {
    setLibrary(standardLibrary());
    const client = await connect();
    const search = await client.callTool({ name: 'search_rules', arguments: { query: 'secret draft rule' } });
    expect((search.structuredContent as { rules: unknown[] }).rules).toEqual([]);
    expect(text(search)).not.toContain('Secret draft rule');

    const get = await client.callTool({ name: 'get_rule', arguments: { id: 'test-draft-rule' } });
    expect(get.isError).toBe(true);
    expect(text(get)).toContain('No public rule');
    expect(text(get)).not.toContain('Secret draft rule');
  });

  it('get_rule returns notices, replacements, citations, and ends with the rule page link', async () => {
    setLibrary(standardLibrary());
    const client = await connect();
    const review = await client.callTool({ name: 'get_rule', arguments: { id: 'test-tarmac-delay' } });
    expect((review.structuredContent as { rule: { notice: string } }).rule.notice).toMatch(/Being re-checked/);
    const retired = await client.callTool({ name: 'get_rule', arguments: { id: 'test-old-voucher-rule' } });
    expect((retired.structuredContent as { rule: { replaced_by: string } }).rule.replaced_by).toBe('test-cancelled-refund');
    const verified = await client.callTool({ name: 'get_rule', arguments: { id: 'test-cancelled-refund' } });
    const lines = text(verified).trim().split('\n');
    expect(lines.at(-2)).toMatch(/^Source: https:\/\/example\.test\/source/);
    expect(lines.at(-1)).toMatch(/^Rule page: https:\/\/elsewhere\.test\/rules\/test-cancelled-refund\?/);
  });

  it('match_situation rejects unknown facts and points to list_facts', async () => {
    setLibrary(standardLibrary());
    const result = await (await connect()).callTool({ name: 'match_situation', arguments: { facts: { 'event.kind': 'x' } } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('list_facts');
  });

  it('list_facts and list_recent_changes answer from the library', async () => {
    setLibrary(standardLibrary());
    const client = await connect();
    const facts = await client.callTool({ name: 'list_facts', arguments: {} });
    expect((facts.structuredContent as { facts: { name: string }[] }).facts.map((f) => f.name)).toContain('event.type');
    const changes = await client.callTool({ name: 'list_recent_changes', arguments: { since: '2026-10-02' } });
    expect((changes.structuredContent as { changes: { rule_id: string }[] }).changes.map((c) => c.rule_id)).toEqual(['test-tarmac-delay']);
  });

  it('rejects an invalid partner key with 401 before reaching MCP', async () => {
    const res = await handleMcp(
      new Request('https://elsewhere.test/api/mcp', {
        method: 'POST',
        headers: { authorization: 'Bearer els_wrongwrongwrongwrongwrongwrongwron', 'content-type': 'application/json' },
        body: '{}',
      }),
    );
    expect(res.status).toBe(401);
  });
});

describe('golden match fixtures through match_situation', () => {
  const cases = goldenCases();

  it('has fixtures to run', () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  for (const golden of cases) {
    it(`${golden.file}: ${golden.name}`, async () => {
      const rules = golden.rules.map(fixtureRule);
      setLibrary(makeLibrary(rules));
      const result = await (await connect()).callTool({ name: 'match_situation', arguments: { facts: golden.situation } });
      expect(result.isError).toBeFalsy();
      const data = result.structuredContent as { applies: { id: string }[]; may_apply: { id: string; missing_facts: string[] }[] };
      const verified = new Set(rules.filter((r) => r.status === 'verified').map((r) => r.id));
      const sorted = (xs: string[]) => [...xs].sort();
      expect(sorted(data.applies.map((r) => r.id).filter((id) => verified.has(id)))).toEqual(
        sorted(golden.expect.filter((e) => e.outcome === 'applies').map((e) => e.rule_id)),
      );
      expect(sorted(data.may_apply.filter((r) => verified.has(r.id)).map((r) => `${r.id}:${sorted(r.missing_facts).join(',')}`))).toEqual(
        sorted(golden.expect.filter((e) => e.outcome === 'may_apply').map((e) => `${e.rule_id}:${sorted(e.missing_facts).join(',')}`)),
      );
    });
  }
});
