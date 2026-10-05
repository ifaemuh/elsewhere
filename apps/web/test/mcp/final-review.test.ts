import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkRateLimit } from '@vercel/firewall';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { handleMcp } from '@/lib/mcp/route-handler';
import { clearKeyCache, hashKey } from '@/lib/rules-api/auth';
import { fakeDb } from '../helpers/supabase-fake';
import { setLibrary } from '../helpers/library-holder';
import { standardLibrary } from '../helpers/fixture-library';

const KEY = 'els_' + 'A1b2C3d4'.repeat(4);
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

afterEach(async () => {
  vi.unstubAllEnvs();
  clearKeyCache();
  await Promise.all(open.splice(0).map((c) => c.close()));
});

describe('1. MCP uncached keys', () => {
  it('rate limits before the lookup and skips the lookup when limited', async () => {
    vi.stubEnv('VERCEL', '1');
    const lookupsAtCheck: number[] = [];
    vi.mocked(checkRateLimit).mockImplementationOnce((async () => {
      lookupsAtCheck.push(fakeDb.apiKeyLookups);
      return { rateLimited: true };
    }) as never);
    const res = await handleMcp(
      new Request('https://elsewhere.test/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: '{}' }),
    );
    expect(res.status).toBe(429);
    expect(lookupsAtCheck).toEqual([0]);
    expect(fakeDb.apiKeyLookups).toBe(0);
  });

  it('skips the pre-check for a cached key (one rule check only)', async () => {
    setLibrary(standardLibrary());
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-gold', revoked_at: null });
    const post = () =>
      handleMcp(new Request('https://elsewhere.test/api/mcp', { method: 'POST', headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }, body: '{}' }));
    await post(); // warms the cache
    vi.stubEnv('VERCEL', '1');
    vi.mocked(checkRateLimit).mockClear();
    await post();
    expect(vi.mocked(checkRateLimit).mock.calls.map((c) => c[0])).toEqual(['rules-gold']);
  });
});

describe('3. MCP body cap', () => {
  const big = (n: number) => JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', pad: 'x'.repeat(n) });
  const post = (body: string, headers: Record<string, string> = {}) =>
    handleMcp(new Request('https://elsewhere.test/api/mcp', { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body }));

  it('answers 413 with a JSON-RPC error over 64 KB', async () => {
    setLibrary(standardLibrary());
    const res = await post(big(70_000));
    expect(res.status).toBe(413);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const json = await res.json();
    expect(json).toMatchObject({ jsonrpc: '2.0', id: null, error: { code: -32600 } });
  });

  it('caps by bytes read even when content-length lies', async () => {
    setLibrary(standardLibrary());
    const res = await post(big(70_000), { 'content-length': '10' });
    expect(res.status).toBe(413);
  });

  it('still serves normal requests', async () => {
    setLibrary(standardLibrary());
    expect((await (await connect()).listTools()).tools.length).toBeGreaterThan(0);
  });
});

describe('4. oversized fact names are not echoed', () => {
  it('keeps the error small for a 5000-char key with a non-scalar value', async () => {
    setLibrary(standardLibrary());
    const client = await connect();
    const big = 'x'.repeat(5000);
    for (const value of [{ nested: 1 }, null, [1]]) {
      const bad = await client.callTool({ name: 'match_situation', arguments: { facts: { [big]: value } } }).catch((e) => e);
      const s = JSON.stringify(bad);
      expect(s).not.toContain(big);
      expect(s.length).toBeLessThan(1500);
    }
  });
});
