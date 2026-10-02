import Stripe from 'stripe';
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/payments/pass-store', () => ({
  supabasePassStore: () => ({
    alreadyProcessed: async () => false,
    markProcessed: async () => undefined,
    completePass: async () => ({ anonymousId: null, variant: 'p19', utm: {} }),
    activateTrip: async () => undefined,
    recordPaid: async () => undefined,
  }),
}));

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
  });

  it('activates the trip for a correctly signed event', async () => {
    const { POST } = await import('@/app/api/webhooks/stripe/route');
    const signature = new Stripe('sk_test_123').webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
    const res = await POST(new Request('http://test/api/webhooks/stripe', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ kind: 'activated', tripId: 'trip-9', status: 'paid' });
  });
});
