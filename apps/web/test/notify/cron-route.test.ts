import { beforeEach, describe, expect, it, vi } from 'vitest';

const { flushDue } = vi.hoisted(() => ({ flushDue: vi.fn() }));
vi.mock('@/lib/notify/queue', () => ({ flushDue }));

beforeEach(() => {
  flushDue.mockReset().mockResolvedValue(3);
  process.env.CRON_SECRET = 'cron-test';
});

async function get(authorization?: string) {
  const { GET } = await import('@/app/api/cron/notifications/route');
  return GET(new Request('https://x.test/api/cron/notifications', authorization ? { headers: { authorization } } : {}));
}

describe('GET /api/cron/notifications', () => {
  it('flushes due notifications for Vercel Cron', async () => {
    const res = await get('Bearer cron-test');
    expect(await res.json()).toEqual({ sent: 3 });
  });

  it('refuses a wrong or missing secret', async () => {
    expect((await get('Bearer nope')).status).toBe(401);
    expect((await get('Bearer cron-tesx')).status).toBe(401);
    expect((await get()).status).toBe(401);
    expect(flushDue).not.toHaveBeenCalled();
  });

  it('refuses everyone while CRON_SECRET is unset or empty, including "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET;
    expect((await get('Bearer undefined')).status).toBe(401);
    expect((await get('Bearer ')).status).toBe(401);
    process.env.CRON_SECRET = '';
    expect((await get('Bearer ')).status).toBe(401);
    expect(flushDue).not.toHaveBeenCalled();
  });
});
