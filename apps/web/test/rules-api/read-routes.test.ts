import { afterEach, describe, expect, it, vi } from 'vitest';
import { after } from 'next/server';
import { checkRateLimit } from '@vercel/firewall';
import { GET as getArtifact } from '@/app/api/rules.json/route';
import { GET as getRuleRoute } from '@/app/api/rules/[id]/route';
import { GET as getFacts } from '@/app/api/rules/facts/route';
import * as auth from '@/lib/rules-api/auth';
import { setLibrary } from '../helpers/library-holder';
import { standardLibrary } from '../helpers/fixture-library';

const url = (path: string) => `https://elsewhere.test${path}`;
const getRule = (req: Request, id: string) => getRuleRoute(req, { params: Promise.resolve({ id }) });
const ruleReq = (id: string, init?: RequestInit) => new Request(url(`/api/rules/${id}`), init);

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.VERCEL;
});

describe('GET /api/rules.json', () => {
  it('returns the artifact without drafts and with sources', async () => {
    setLibrary(standardLibrary());
    const res = await getArtifact(new Request(url('/api/rules.json')));
    expect(res.status).toBe(200);
    expect(res.headers.get('vary')).toBe('Authorization');
    const body = await res.json();
    expect(body.schema_version).toBe(1);
    expect(body.rules.map((r: { id: string }) => r.id)).not.toContain('test-draft-rule');
    expect(body.rules).toHaveLength(3);
    expect(body.rules[0]).toHaveProperty('lead_character');
    expect(body.changes.map((c: { rule_id: string }) => c.rule_id)).not.toContain('test-draft-rule');
    expect(body.sources).toHaveProperty('test-source');
    expect(body.attribution.required).toBe(true);
  });

  it('answers 304 to a matching If-None-Match', async () => {
    const lib = standardLibrary();
    setLibrary(lib);
    const res = await getArtifact(new Request(url('/api/rules.json'), { headers: { 'if-none-match': `"${lib.library_version}"` } }));
    expect(res.status).toBe(304);
  });

  it('answers 503 without leaking details when the library failed to load', async () => {
    setLibrary(null);
    const res = await getArtifact(new Request(url('/api/rules.json')));
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = JSON.stringify(await res.json());
    expect(text).not.toContain('No rules library set');
    expect(text).not.toContain(' at ');
  });
});

describe('GET /api/rules/:id', () => {
  it('returns a verified rule in the envelope with an api-tagged page_url', async () => {
    setLibrary(standardLibrary());
    const res = await getRule(ruleReq('test-cancelled-refund'), 'test-cancelled-refund');
    expect(res.status).toBe(200);
    expect(res.headers.get('vary')).toBe('Authorization');
    const body = await res.json();
    expect(body.data.rule.id).toBe('test-cancelled-refund');
    expect(body.data.rule.page_url).toContain('utm_source=api&utm_medium=anonymous');
    expect(after).toHaveBeenCalled();
  });

  it('returns byte-identical 404s for drafts and unknown ids', async () => {
    setLibrary(standardLibrary());
    const draft = await getRule(ruleReq('test-draft-rule'), 'test-draft-rule');
    const unknown = await getRule(ruleReq('no-such-rule'), 'no-such-rule');
    expect(draft.status).toBe(404);
    expect(unknown.status).toBe(404);
    expect([...draft.headers]).toEqual([...unknown.headers]);
    const [d, u] = [await draft.text(), await unknown.text()];
    expect(d).toBe(u);
    expect(d).not.toContain('Secret draft rule');
  });

  it('returns retired rules with replaced_by and needs_review rules with a notice', async () => {
    setLibrary(standardLibrary());
    const retired = await (await getRule(ruleReq('test-old-voucher-rule'), 'test-old-voucher-rule')).json();
    expect(retired.data.rule.replaced_by).toBe('test-cancelled-refund');
    const review = await (await getRule(ruleReq('test-tarmac-delay'), 'test-tarmac-delay')).json();
    expect(review.data.rule.notice).toMatch(/^Being re-checked since 2026-10-05/);
  });

  it('rejects an invalid partner key with 401', async () => {
    setLibrary(standardLibrary());
    const res = await getRule(ruleReq('test-cancelled-refund', { headers: { authorization: 'Bearer nope' } }), 'test-cancelled-refund');
    expect(res.status).toBe(401);
  });

  it('rate-limits an invalid key as anonymous before answering 401', async () => {
    setLibrary(standardLibrary());
    process.env.VERCEL = '1';
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ rateLimited: true } as never);
    const res = await getRule(ruleReq('test-cancelled-refund', { headers: { authorization: 'Bearer nope' } }), 'test-cancelled-refund');
    expect(res.status).toBe(429);
    expect(vi.mocked(checkRateLimit).mock.calls[0][0]).toBe('rules-api-anon');
  });

  it('answers 503 and logs the message only when the key lookup throws', async () => {
    setLibrary(standardLibrary());
    const key = 'els_' + 'A1b2C3d4'.repeat(4);
    vi.spyOn(auth, 'resolveCaller').mockRejectedValueOnce(new Error('db down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await getRule(ruleReq('test-cancelled-refund', { headers: { authorization: `Bearer ${key}` } }), 'test-cancelled-refund');
    expect(res.status).toBe(503);
    expect(res.headers.get('cache-control')).toBe('no-store');
    const text = await res.text();
    expect(text).not.toContain(key);
    expect(err).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(err.mock.calls)).not.toContain(key);
  });
});

describe('GET /api/rules/facts', () => {
  it('lists the vocabulary with types and enum values', async () => {
    setLibrary(standardLibrary());
    const body = await (await getFacts(new Request(url('/api/rules/facts')))).json();
    const eventType = body.data.facts.find((f: { name: string }) => f.name === 'event.type');
    expect(eventType.type).toBe('enum');
    expect(eventType.values).toContain('cancellation');
    expect(eventType.description.length).toBeGreaterThan(0);
  });
});
