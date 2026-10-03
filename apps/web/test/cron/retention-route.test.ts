import { beforeEach, describe, expect, it, vi } from 'vitest';

const runRetention = vi.hoisted(() => vi.fn());
vi.mock('@/lib/retention', () => ({ runRetention }));

import { GET } from '@/app/api/cron/retention/route';

const call = (authorization?: string) => GET(new Request('https://x.test/api/cron/retention', authorization ? { headers: { authorization } } : {}));

beforeEach(() => {
  runRetention.mockReset().mockResolvedValue({ documentsDeleted: 2, purgeInbound: [{ id: 'm', storage_path: 'p' }], deleteBookingsForTrips: [] });
  process.env.CRON_SECRET = 'cron-test';
});

describe('GET /api/cron/retention', () => {
  it('refuses a call without the secret, and a wrong one', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect(runRetention).not.toHaveBeenCalled();
  });

  it('refuses everyone while CRON_SECRET is unset, including "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET;
    for (const authorization of ['Bearer undefined', 'Bearer ']) expect((await call(authorization)).status).toBe(401);
    expect(runRetention).not.toHaveBeenCalled();
  });

  it('runs retention and reports counts only', async () => {
    expect(await (await call('Bearer cron-test')).json()).toEqual({ documentsDeleted: 2, inboundPurged: 1, tripsWithBookingsDeleted: 0 });
  });
});
