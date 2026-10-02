import { NextRequest } from 'next/server';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AttributionResponseSchema } from '@/lib/attribution/summary';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({
      data: [
        { post_id: 'b-x-c', clicks: 12, forwarded_bookings: 2, paid_passes: 1 },
        { post_id: 'b-x-r', clicks: '4', forwarded_bookings: '0', paid_passes: '0' },
      ],
      error: null,
    }),
  }),
}));

beforeAll(() => {
  process.env.FOUNDRY_ATTRIBUTION_KEY = 'contract-key';
});

describe('foundry attribution contract', () => {
  it('returns exactly { since: YYYY-MM-DD, generated_at: ISO, posts: [{ post_id, clicks, forwarded_bookings, paid_passes }] }', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    const res = await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01', { headers: { authorization: 'Bearer contract-key' } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(AttributionResponseSchema.parse(body)).toEqual(body);
    expect(body.since).toBe('2026-10-01');
    expect(body.posts[1]).toEqual({ post_id: 'b-x-r', clicks: 4, forwarded_bookings: 0, paid_passes: 0 });
  });

  it('returns 401 for a missing or wrong key, and 400 for a bad date', async () => {
    const { GET } = await import('@/app/api/attribution/route');
    expect((await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01'))).status).toBe(401);
    expect((await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01', { headers: { authorization: 'Bearer nope' } }))).status).toBe(401);
    expect((await GET(new NextRequest('https://example.test/api/attribution?since=2026-10-01T00:00:00Z', { headers: { authorization: 'Bearer contract-key' } }))).status).toBe(400);
  });
});
