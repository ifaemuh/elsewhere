import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checked: string[] = [];
const queried: string[] = [];
let failOn: string | null = null;
let tripRows: { id: string }[] = [{ id: 'trip-1' }, { id: 'trip-2' }];

vi.mock('@/lib/documents/service', () => ({
  runDocumentChecks: async (tripId: string) => {
    if (tripId === failOn) throw new Error('boom');
    checked.push(tripId);
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: async (_column: string, day: string) => {
          queried.push(day);
          return { data: tripRows, error: null };
        },
      }),
    }),
  }),
}));

beforeEach(() => {
  checked.length = 0;
  queried.length = 0;
  failOn = null;
  tripRows = [{ id: 'trip-1' }, { id: 'trip-2' }];
  process.env.CRON_SECRET = 'cron-test';
});

afterEach(() => vi.useRealTimers());

describe('GET /api/cron/document-checks', () => {
  it('refuses calls without the cron secret, or with a wrong one', async () => {
    const { GET } = await import('@/app/api/cron/document-checks/route');
    expect((await GET(new Request('https://x.test/api/cron/document-checks'))).status).toBe(401);
    expect((await GET(new Request('https://x.test/api/cron/document-checks', { headers: { authorization: 'Bearer wrong' } }))).status).toBe(401);
    expect(checked).toEqual([]);
  });

  it('refuses everyone while CRON_SECRET is unset, including "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import('@/app/api/cron/document-checks/route');
    for (const authorization of ['Bearer undefined', 'Bearer ']) {
      expect((await GET(new Request('https://x.test/api/cron/document-checks', { headers: { authorization } }))).status).toBe(401);
    }
    expect(checked).toEqual([]);
  });

  it('re-checks every trip that starts 30 days from today', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-04T13:00:00Z'));
    const { GET } = await import('@/app/api/cron/document-checks/route');
    const res = await GET(new Request('https://x.test/api/cron/document-checks', { headers: { authorization: 'Bearer cron-test' } }));
    expect(await res.json()).toEqual({ day: '2026-11-03', checked: 2 });
    expect(queried).toEqual(['2026-11-03']);
    expect(checked).toEqual(['trip-1', 'trip-2']);
  });

  it('keeps checking the other trips when one fails, and answers 500', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    failOn = 'trip-1';
    const { GET } = await import('@/app/api/cron/document-checks/route');
    const res = await GET(new Request('https://x.test/api/cron/document-checks', { headers: { authorization: 'Bearer cron-test' } }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ checked: 1, failed: ['trip-1'] });
    expect(checked).toEqual(['trip-2']);
    error.mockRestore();
  });
});
