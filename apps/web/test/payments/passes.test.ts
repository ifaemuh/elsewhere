import type Stripe from 'stripe';
import { describe, expect, it } from 'vitest';
import { handleStripeEvent, type PassStore } from '@/lib/payments/passes';

function memoryStore(pass: { anonymousId: string | null; variant: string; utm: Record<string, string> } | null = {
  anonymousId: 'a'.repeat(32),
  variant: 'p9',
  utm: { utm_source: 'tiktok' },
}) {
  const calls = { processed: new Set<string>(), completed: [] as unknown[], activated: [] as unknown[], paid: [] as unknown[] };
  const store: PassStore = {
    async alreadyProcessed(id) {
      return calls.processed.has(id);
    },
    async markProcessed(id) {
      calls.processed.add(id);
    },
    async completePass(input) {
      calls.completed.push(input);
      return pass;
    },
    async activateTrip(tripId, status) {
      calls.activated.push({ tripId, status });
    },
    async recordPaid(input) {
      calls.paid.push(input);
    },
  };
  return { store, calls };
}

function checkoutEvent(overrides: Partial<Stripe.Checkout.Session> = {}, id = 'evt_1'): Stripe.Event {
  return {
    id,
    type: 'checkout.session.completed',
    created: 1_790_000_000,
    data: {
      object: {
        id: 'cs_test_1',
        client_reference_id: 'trip-1',
        payment_status: 'paid',
        amount_total: 900,
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

describe('handleStripeEvent', () => {
  it('activates a paid pass and records the paid funnel event with the trip’s utm', async () => {
    const { store, calls } = memoryStore();
    const outcome = await handleStripeEvent(checkoutEvent(), store);
    expect(outcome).toEqual({ kind: 'activated', tripId: 'trip-1', status: 'paid' });
    expect(calls.activated).toEqual([{ tripId: 'trip-1', status: 'active' }]);
    expect(calls.paid).toEqual([{ anonymousId: 'a'.repeat(32), tripId: 'trip-1', variant: 'p9', amountCents: 900, utm: { utm_source: 'tiktok' } }]);
  });

  it('treats a 100% promotion code as a comp and keeps it out of paid metrics', async () => {
    const { store, calls } = memoryStore();
    const outcome = await handleStripeEvent(checkoutEvent({ payment_status: 'no_payment_required', amount_total: 0 }), store);
    expect(outcome).toEqual({ kind: 'activated', tripId: 'trip-1', status: 'comp' });
    expect(calls.activated).toEqual([{ tripId: 'trip-1', status: 'comp' }]);
    expect(calls.paid).toEqual([]);
  });

  it('ignores duplicates, other events, and unpaid sessions', async () => {
    const { store } = memoryStore();
    await handleStripeEvent(checkoutEvent(), store);
    expect(await handleStripeEvent(checkoutEvent(), store)).toEqual({ kind: 'ignored', reason: 'duplicate' });
    expect(await handleStripeEvent({ id: 'evt_2', type: 'charge.refunded' } as unknown as Stripe.Event, store)).toEqual({
      kind: 'ignored',
      reason: 'unhandled charge.refunded',
    });
    expect(await handleStripeEvent(checkoutEvent({ payment_status: 'unpaid' }, 'evt_3'), store)).toEqual({
      kind: 'ignored',
      reason: 'payment_status unpaid',
    });
  });

  it('never activates a trip for a session it did not create', async () => {
    const { store, calls } = memoryStore(null);
    const outcome = await handleStripeEvent(checkoutEvent(), store);
    expect(outcome).toEqual({ kind: 'ignored', reason: 'unknown session' });
    expect(calls.activated).toEqual([]);
    expect(calls.paid).toEqual([]);
    expect(calls.processed.has('evt_1')).toBe(true);
  });

  it('does not treat an unpaid zero-amount session as a comp', async () => {
    const { store, calls } = memoryStore();
    const outcome = await handleStripeEvent(checkoutEvent({ payment_status: 'unpaid', amount_total: 0 }, 'evt_4'), store);
    expect(outcome).toEqual({ kind: 'ignored', reason: 'payment_status unpaid' });
    expect(calls.completed).toEqual([]);
    expect(calls.activated).toEqual([]);
  });
});
