import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const inserted: unknown[] = [];
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: async (row: unknown) => {
        inserted.push(row);
        return { error: null };
      },
    }),
    rpc: async () => ({ data: [{ post_id: 'p1', clicks: 2, forwarded_bookings: 1, paid_passes: 1 }], error: null }),
  }),
}));

beforeAll(() => {
  process.env.FOUNDRY_ATTRIBUTION_KEY = 'k3y';
});

describe('GET /r/[postId]', () => {
  it('records a touchpoint and redirects with UTM tags and a visitor cookie', async () => {
    const { GET } = await import('@/app/r/[postId]/route');
    const res = await GET(new NextRequest('https://example.test/r/p1?p=tt'), { params: Promise.resolve({ postId: 'p1' }) });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/rules?utm_source=tiktok');
    expect(res.headers.get('set-cookie')).toContain('elsewhere_aid=');
    expect(inserted).toHaveLength(1);
  });

  it('persists the UTM cookie so tags survive until trip_started/checkout_started', async () => {
    const { GET } = await import('@/app/r/[postId]/route');
    const res = await GET(new NextRequest('https://example.test/r/p1?p=tt'), { params: Promise.resolve({ postId: 'p1' }) });
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('elsewhere_utm=');
    expect(decodeURIComponent(setCookie)).toContain('"utm_source":"tiktok"');
  });

  it('stays on the app origin for hostile `to` values', async () => {
    const { GET } = await import('@/app/r/[postId]/route');
    for (const to of ['//evil.test', 'https://evil.test', '/\\evil.test', '%2F%2Fevil.test', '/%2F/evil.test', '/rules/..%2F..%2Fevil', 'javascript:alert(1)']) {
      const res = await GET(new NextRequest(`https://example.test/r/p1?p=ig&to=${to}`), { params: Promise.resolve({ postId: 'p1' }) });
      const location = new URL(res.headers.get('location')!);
      expect(location.origin).toBe('https://example.test');
      expect(location.pathname).toBe('/rules');
    }
  });
});

describe('GET /api/attribution', () => {
  it('rejects every request, even an empty bearer, when the key is unset or empty', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    const original = process.env.FOUNDRY_ATTRIBUTION_KEY;
    try {
      for (const value of [undefined, '']) {
        if (value === undefined) delete process.env.FOUNDRY_ATTRIBUTION_KEY;
        else process.env.FOUNDRY_ATTRIBUTION_KEY = value;
        for (const authorization of ['Bearer ', 'Bearer', 'Bearer anything']) {
          const res = await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01', { headers: { authorization } }));
          expect(res.status).toBe(401);
        }
      }
    } finally {
      process.env.FOUNDRY_ATTRIBUTION_KEY = original;
    }
  });

  it('requires the foundry key', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    const res = await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01'));
    expect(res.status).toBe(401);
  });

  it('returns per-post counts', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    const res = await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01', { headers: { authorization: 'Bearer k3y' } }));
    expect(res.status).toBe(200);
    expect((await res.json()).posts).toEqual([{ post_id: 'p1', clicks: 2, forwarded_bookings: 1, paid_passes: 1 }]);
  });
});
