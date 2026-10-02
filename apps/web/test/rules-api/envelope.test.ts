import { describe, expect, it } from 'vitest';
import { envelope, etagFor, jsonError, jsonOk } from '@/lib/rules-api/envelope';
import { standardLibrary } from '../helpers/fixture-library';

const anon = { tier: 'anonymous' } as const;
const partner = { tier: 'partner', keyId: 'k1', partnerId: 'acme', rateLimitRule: 'rules-partner' } as const;

describe('envelope', () => {
  it('wraps data with versions and attribution', () => {
    const lib = standardLibrary();
    expect(envelope(lib, { ok: true })).toEqual({
      schema_version: 1,
      library_version: lib.library_version,
      data: { ok: true },
      attribution: { text: 'Rules verified by Elsewhere from primary sources. Not legal advice.', required: true },
    });
  });
});

describe('jsonOk', () => {
  it('sends public CDN caching and an ETag to anonymous callers', async () => {
    const lib = standardLibrary();
    const res = jsonOk(new Request('https://elsewhere.test/api/rules/facts'), lib, { a: 1 }, anon);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(res.headers.get('vary')).toBe('Authorization');
    expect(res.headers.get('etag')).toBe(etagFor(lib));
    expect(res.headers.get('x-library-version')).toBe(lib.library_version);
    expect(await res.json()).toEqual({ a: 1 });
  });

  it('answers 304 when If-None-Match matches, including weak and listed tags', () => {
    const lib = standardLibrary();
    for (const header of [etagFor(lib), `W/${etagFor(lib)}`, `"other", ${etagFor(lib)}`, '*']) {
      const req = new Request('https://elsewhere.test/api/rules/facts', { headers: { 'if-none-match': header } });
      const res = jsonOk(req, lib, { a: 1 }, anon);
      expect(res.status).toBe(304);
      expect(res.body).toBeNull();
    }
  });

  it('carries the ETag and cache headers on a 304', () => {
    const lib = standardLibrary();
    const req = new Request('https://elsewhere.test/x', { headers: { 'if-none-match': etagFor(lib) } });
    const res = jsonOk(req, lib, {}, anon);
    expect(res.status).toBe(304);
    expect(res.headers.get('etag')).toBe(etagFor(lib));
    expect(res.headers.get('cache-control')).toBe('public, s-maxage=3600, stale-while-revalidate=86400');
    expect(res.headers.get('vary')).toBe('Authorization');
  });

  it('keeps a partner 304 private', () => {
    const lib = standardLibrary();
    const req = new Request('https://elsewhere.test/x', { headers: { 'if-none-match': etagFor(lib) } });
    const res = jsonOk(req, lib, {}, partner);
    expect(res.status).toBe(304);
    expect(res.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
    expect(res.headers.get('vary')).toBe('Authorization');
  });

  it('returns 200 when If-None-Match is a different tag', () => {
    const req = new Request('https://elsewhere.test/x', { headers: { 'if-none-match': '"stale"' } });
    expect(jsonOk(req, standardLibrary(), {}, anon).status).toBe(200);
  });

  it('never 304s a non-cacheable response', () => {
    const lib = standardLibrary();
    const req = new Request('https://elsewhere.test/x', { headers: { 'if-none-match': '*' } });
    expect(jsonOk(req, lib, {}, anon, { cacheable: false }).status).toBe(200);
  });

  it('keeps partner responses out of shared caches', () => {
    const res = jsonOk(new Request('https://elsewhere.test/x'), standardLibrary(), {}, partner);
    expect(res.headers.get('cache-control')).toBe('private, max-age=0, must-revalidate');
  });

  it('marks non-cacheable responses no-store without an ETag', () => {
    const res = jsonOk(new Request('https://elsewhere.test/x'), standardLibrary(), {}, anon, { cacheable: false });
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('etag')).toBeNull();
  });
});

describe('jsonError', () => {
  it('returns an error body that is never cached', async () => {
    const lib = standardLibrary();
    const res = jsonError(429, 'rate_limited', 'Slow down.', { library: lib, headers: { 'Retry-After': '60' } });
    expect(res.status).toBe(429);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('retry-after')).toBe('60');
    expect(await res.json()).toEqual({
      schema_version: 1,
      library_version: lib.library_version,
      error: { code: 'rate_limited', message: 'Slow down.' },
    });
  });

  it('includes details only when given', async () => {
    const body = await jsonError(400, 'invalid_facts', 'Bad.', { details: { errors: [] } }).json();
    expect(body.error.details).toEqual({ errors: [] });
    expect(body.library_version).toBeNull();
  });
});
