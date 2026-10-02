import Stripe from 'stripe';
import { beforeAll, describe, expect, it, vi } from 'vitest';

const store = {
  alreadyProcessed: vi.fn(async () => false),
  markProcessed: vi.fn(async () => undefined),
  completePass: vi.fn(async () => ({ anonymousId: null, variant: 'p19', utm: {} })),
  hasOtherActivePass: vi.fn(async () => false),
  activateTrip: vi.fn(async () => undefined),
  recordPaid: vi.fn(async () => undefined),
};
vi.mock('@/lib/payments/pass-store', () => ({ supabasePassStore: () => store }));

beforeAll(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_123';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
});

const payload = JSON.stringify({
  id: 'evt_route_1',
  object: 'event',
  type: 'checkout.session.completed',
  created: 1_790_000_000,
  data: { object: { id: 'cs_test_9', object: 'checkout.session', client_reference_id: 'trip-9', payment_status: 'paid', amount_total: 1900 } },
});

describe('POST /api/webhooks/stripe', () => {
  it('rejects a bad signature', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const res = await POST(new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': 't=1,v1=bad' } }));
    expect(res.status).toBe(400);
    for (const fn of Object.values(store)) expect(fn).not.toHaveBeenCalled();
  });

  it('activates the trip for a correctly signed event', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const signature = new Stripe('sk_test_123').webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    const res = await POST(new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: 'activated', tripId: 'trip-9', status: 'paid' });
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
