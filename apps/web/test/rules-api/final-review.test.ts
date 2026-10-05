import { afterEach, describe, expect, it, vi } from 'vitest';
import { after } from 'next/server';
import { checkRateLimit } from '@vercel/firewall';
import { GET as getArtifact } from '@/app/api/rules.json/route';
import { GET as getRuleRoute } from '@/app/api/rules/[id]/route';
import { clearKeyCache, hashKey, isKeyCached, lookupKey } from '@/lib/rules-api/auth';
import { withRulesApi } from '@/lib/rules-api/handle';
import { enforceRateLimit } from '@/lib/rules-api/rate-limit';
import { appOrigin } from '@/lib/rules-api/links';
import { tokenize } from '@/lib/rules-api/search';
import { parseLibrary } from '@/lib/rules/parse-library';
import RulesTermsPage from '@/app/rules/terms/page';
import { renderToStaticMarkup } from 'react-dom/server';
import { fakeDb } from '../helpers/supabase-fake';
import { setLibrary } from '../helpers/library-holder';
import { standardLibrary } from '../helpers/fixture-library';

const KEY = 'els_' + 'A1b2C3d4'.repeat(4);
const url = (path: string) => `https://elsewhere.test${path}`;
const getRule = (req: Request, id: string) => getRuleRoute(req, { params: Promise.resolve({ id }) });
const withKey = (key = KEY) => new Request(url('/api/rules/test-cancelled-refund'), { headers: { authorization: `Bearer ${key}` } });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  clearKeyCache();
});

describe('1. uncached keys are rate limited before the database lookup', () => {
  it('runs the anonymous check before a cache-miss lookup', async () => {
    setLibrary(standardLibrary());
    vi.stubEnv('VERCEL', '1');
    const lookupsAtCheck: number[] = [];
    vi.mocked(checkRateLimit).mockImplementation((async () => {
      lookupsAtCheck.push(fakeDb.apiKeyLookups);
      return { rateLimited: false };
    }) as never);
    await getRule(withKey(), 'test-cancelled-refund');
    expect(lookupsAtCheck[0]).toBe(0);
    expect(vi.mocked(checkRateLimit).mock.calls[0][0]).toBe('rules-api-anon');
    expect(fakeDb.apiKeyLookups).toBe(1);
  });

  it('never calls the database for a limited request', async () => {
    setLibrary(standardLibrary());
    vi.stubEnv('VERCEL', '1');
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ rateLimited: true } as never);
    const res = await getRule(withKey(), 'test-cancelled-refund');
    expect(res.status).toBe(429);
    expect(fakeDb.apiKeyLookups).toBe(0);
  });

  it('skips the pre-check for a cached valid key', async () => {
    setLibrary(standardLibrary());
    fakeDb.apiKeys.push({ id: 'key-1', partner_id: 'acme', key_hash: hashKey(KEY), rate_limit_rule: 'rules-partner', revoked_at: null });
    await lookupKey(KEY);
    expect(isKeyCached(KEY)).toBe(true);
    vi.stubEnv('VERCEL', '1');
    await getRule(withKey(), 'test-cancelled-refund');
    expect(vi.mocked(checkRateLimit).mock.calls.map((c) => c[0])).toEqual(['rules-partner']);
  });

  it('reports uncached keys as uncached', () => {
    expect(isKeyCached(KEY)).toBe(false);
  });
});

describe('5. REST 401 challenges', () => {
  it('sends WWW-Authenticate', async () => {
    setLibrary(standardLibrary());
    const res = await getRule(withKey('nope'), 'test-cancelled-refund');
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer realm="elsewhere-rules"');
  });
});

describe('2. MCP platform rate rule', () => {
  const mcpReq = (ip: string | null) => new Request(url('/api/mcp'), { headers: ip ? { 'x-real-ip': ip } : {} });
  const anon = { tier: 'anonymous' } as const;

  it('uses rules-mcp-platform for MCP callers inside MCP_PLATFORM_CIDRS', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('MCP_PLATFORM_CIDRS', '10.0.0.0/8, 160.79.104.0/21');
    await enforceRateLimit(mcpReq('160.79.105.7'), anon, 'mcp');
    expect(vi.mocked(checkRateLimit).mock.calls[0][0]).toBe('rules-mcp-platform');
  });

  it('keeps rules-mcp-anon outside the list, without an IP, or when unset', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('MCP_PLATFORM_CIDRS', '10.0.0.0/8');
    await enforceRateLimit(mcpReq('8.8.8.8'), anon, 'mcp');
    await enforceRateLimit(mcpReq(null), anon, 'mcp');
    vi.stubEnv('MCP_PLATFORM_CIDRS', '');
    await enforceRateLimit(mcpReq('10.1.1.1'), anon, 'mcp');
    expect(vi.mocked(checkRateLimit).mock.calls.map((c) => c[0])).toEqual(['rules-mcp-anon', 'rules-mcp-anon', 'rules-mcp-anon']);
  });

  it('never applies to the REST surface or to partners', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('MCP_PLATFORM_CIDRS', '10.0.0.0/8');
    await enforceRateLimit(mcpReq('10.1.1.1'), anon, 'api');
    await enforceRateLimit(mcpReq('10.1.1.1'), { tier: 'partner', keyId: 'k', partnerId: 'p', rateLimitRule: 'rules-partner' }, 'mcp');
    expect(vi.mocked(checkRateLimit).mock.calls.map((c) => c[0])).toEqual(['rules-api-anon', 'rules-partner']);
  });
});

describe('6. app origin fallback', () => {
  it('falls back to the Vercel production URL when the app URL is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'elsewhere.example.com');
    expect(appOrigin()).toBe('https://elsewhere.example.com');
  });

  it('throws in production when nothing is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    expect(() => appOrigin()).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it('keeps localhost outside production', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', '');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(appOrigin()).toBe('http://localhost:3000');
  });

  it('prefers the configured app URL', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://elsewhere.test/');
    expect(appOrigin()).toBe('https://elsewhere.test');
  });
});

describe('7. rules.json is a valid library artifact', () => {
  it('passes the shared parseLibrary', async () => {
    setLibrary(standardLibrary());
    const body = await (await getArtifact(new Request(url('/api/rules.json')))).json();
    const parsed = parseLibrary(body);
    expect(parsed.rules.map((r) => r.id)).not.toContain('test-draft-rule');
    expect(parsed.library_version).toBe(standardLibrary().library_version);
  });
});

describe('8. terms wording', () => {
  it('scopes the IP statement to analytics and mentions the platform limit', () => {
    const html = renderToStaticMarkup(RulesTermsPage());
    expect(html).toContain('IP addresses are never stored in our analytics.');
    expect(html).toContain('30 MCP requests per minute');
    expect(html).toMatch(/AI-platform connector traffic has a higher shared limit/);
  });
});

describe('9. search token cap', () => {
  it('keeps at most 32 tokens after stopwords', () => {
    const q = Array.from({ length: 100 }, (_, i) => `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}x`).join(' ');
    expect(tokenize(q)).toHaveLength(32);
  });
});

describe('10. handler exceptions', () => {
  it('answers a JSON 500 (no-store) and records a 500 analytics row', async () => {
    setLibrary(standardLibrary());
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const boom = withRulesApi('boom', () => {
      throw new Error('kaboom secret detail');
    });
    const res = await boom(new Request(url('/api/boom')));
    expect(res.status).toBe(500);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(JSON.parse(text).error.code).toBe('internal_error');
    expect(text).not.toContain('kaboom');
    for (const [cb] of vi.mocked(after).mock.calls) await (cb as () => Promise<void>)();
    expect(fakeDb.events.at(-1)).toMatchObject({ endpoint: 'boom', status: 500, surface: 'api' });
  });

  it('rethrows Next control-flow errors from the handler', async () => {
    setLibrary(standardLibrary());
    const flow = Object.assign(new Error('Dynamic server usage'), { digest: 'DYNAMIC_SERVER_USAGE' });
    const h = withRulesApi('flow', () => {
      throw flow;
    });
    await expect(h(new Request(url('/api/flow')))).rejects.toBe(flow);
  });
});
