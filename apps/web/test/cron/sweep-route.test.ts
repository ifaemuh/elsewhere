import { beforeEach, describe, expect, it, vi } from 'vitest';

const sweepStuckWork = vi.hoisted(() => vi.fn());
vi.mock('@/lib/admin/sweep', () => ({ sweepStuckWork }));

import { GET } from '@/app/api/cron/sweep/route';

const call = (authorization?: string) => GET(new Request('https://x.test/api/cron/sweep', authorization ? { headers: { authorization } } : {}));

beforeEach(() => {
  sweepStuckWork.mockReset().mockResolvedValue({ incidents: { started: 1, failed: [] }, messages: { started: 0, failed: [] } });
  process.env.CRON_SECRET = 'cron-test';
});

describe('GET /api/cron/sweep', () => {
  it('refuses a call without the secret, and a wrong one', async () => {
    expect((await call()).status).toBe(401);
    expect((await call('Bearer wrong')).status).toBe(401);
    expect(sweepStuckWork).not.toHaveBeenCalled();
  });

  it('refuses everyone while CRON_SECRET is unset, including "Bearer undefined"', async () => {
    delete process.env.CRON_SECRET;
    for (const authorization of ['Bearer undefined', 'Bearer ', 'Bearer']) expect((await call(authorization)).status).toBe(401);
    expect(sweepStuckWork).not.toHaveBeenCalled();
  });

  it('runs the sweep and reports it', async () => {
    const res = await call('Bearer cron-test');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ incidents: { started: 1, failed: [] }, messages: { started: 0, failed: [] } });
  });

  it('answers 500 when a start failed, so the cron shows red', async () => {
    sweepStuckWork.mockResolvedValue({ incidents: { started: 0, failed: ['i1'] }, messages: { started: 0, failed: [] } });
    expect((await call('Bearer cron-test')).status).toBe(500);
  });
});
