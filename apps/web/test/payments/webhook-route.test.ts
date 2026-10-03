import Stripe from 'stripe';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const store = {
  alreadyProcessed: vi.fn(async () => false),
  markProcessed: vi.fn(async () => undefined),
  completePass: vi.fn(async () => ({ anonymousId: null, variant: 'p19', utm: {} })),
  hasOtherActivePass: vi.fn(async () => false),
  activateTrip: vi.fn(async () => undefined),
  recordPaid: vi.fn(async () => undefined),
};
vi.mock('@/lib/payments/pass-store', () => ({ supabasePassStore: () => store }));
const { start } = vi.hoisted(() => ({ start: vi.fn() }));
vi.mock('workflow/api', () => ({ start }));
vi.mock('@/workflows/trip-monitor', () => ({ tripMonitorWorkflow: 'tripMonitorWorkflow' }));

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
});
beforeEach(() => {
  start.mockReset().mockResolvedValue({ runId: 'wrun_test' });
});

const payload = JSON.stringify({
  id: 'evt_route_1',
  object: 'event',
  type: 'checkout.session.completed',
  created: 1_790_000_000,
  data: { object: { id: 'cs_test_9', object: 'checkout.session', client_reference_id: 'trip-9', payment_status: 'paid', amount_total: 1900 } },
});

function signedRequest() {
  const signature = new Stripe('sk_test_123').webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
  return new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } });
}

describe('POST /api/webhooks/stripe', () => {
  it('rejects a bad signature', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=1,v1=bad' } }));
    expect(res.status).toBe(400);
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('activates the trip for a correctly signed event, and starts watching it', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(signedRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: 'activated', tripId: 'trip-9', status: 'paid' });
    expect(start).toHaveBeenCalledWith('tripMonitorWorkflow', ['trip-9']);
  });

  it('still answers 200 when monitoring cannot start, and logs it for /admin', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    start.mockRejectedValueOnce(new Error('queue unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(signedRequest());
    expect(res.status).toBe(200);
    expect(error).toHaveBeenCalledWith('trip monitor did not start', 'trip-9', expect.any(Error));
    error.mockRestore();
  });

  it('answers 500, not 400, when the webhook secret is missing', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const saved = process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    try {
      await expect(POST(new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=1,v1=x' } }))).rejects.toThrow(
        'STRIPE_WEBHOOK_SECRET',
      );
    } finally {
      process.env.STRIPE_WEBHOOK_SECRET = saved;
    }
  });
});
