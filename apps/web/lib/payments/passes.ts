import type Stripe from 'stripe';

export interface CompletedPass {
  anonymousId: string | null;
  variant: string;
  utm: Record<string, string>;
}

export interface PassStore {
  alreadyProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
  /** Matches on both the Stripe session id and the trip; returns null when no pass row we created matches. */
  completePass(input: { sessionId: string; tripId: string; status: 'paid' | 'comp'; amountCents: number; paidAt: string }): Promise<CompletedPass | null>;
  /** True when another session on this trip is already paid or comped. */
  hasOtherActivePass(tripId: string, sessionId: string): Promise<boolean>;
  activateTrip(tripId: string, passStatus: 'active' | 'comp'): Promise<void>;
  recordPaid(input: { anonymousId: string; tripId: string; variant: string; amountCents: number; utm: Record<string, string> }): Promise<void>;
}

export type PassOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'activated'; tripId: string; status: 'paid' | 'comp' };

/**
 * Idempotent on the Stripe event id. Every write is safe to repeat (recordPaid is guarded by a
 * unique index on the trip's paid event and throws on any other failure), and the event is
 * marked processed last, so a crash mid-way lets Stripe's retry finish the job.
 */
export async function handleStripeEvent(event: Stripe.Event, store: PassStore): Promise<PassOutcome> {
  if (event.type !== 'checkout.session.completed') return { kind: 'ignored', reason: `unhandled ${event.type}` };
  if (await store.alreadyProcessed(event.id)) return { kind: 'ignored', reason: 'duplicate' };

  const session = event.data.object;
  const tripId = session.client_reference_id;
  if (!tripId) {
    await store.markProcessed(event.id);
    return { kind: 'ignored', reason: 'no trip' };
  }
  // A comp only when Stripe says no payment is required, never because the amount happens to be 0.
  const free = session.payment_status === 'no_payment_required';
  if (session.payment_status !== 'paid' && !free) {
    await store.markProcessed(event.id);
    return { kind: 'ignored', reason: `payment_status ${session.payment_status}` };
  }

  const status = free ? 'comp' : 'paid';
  const amountCents = session.amount_total ?? 0;
  const pass = await store.completePass({
    sessionId: session.id,
    tripId,
    status,
    amountCents,
    paidAt: new Date(event.created * 1000).toISOString(),
  });
  if (!pass) {
    // Not a session we created for this trip: never activate on it.
    await store.markProcessed(event.id);
    return { kind: 'ignored', reason: 'unknown session' };
  }
  if (await store.hasOtherActivePass(tripId, session.id)) {
    console.error(`second paid session on an active trip: ${session.id}, refund needed`);
  }
  await store.activateTrip(tripId, status === 'paid' ? 'active' : 'comp');
  if (status === 'paid' && pass.anonymousId) {
    await store.recordPaid({ anonymousId: pass.anonymousId, tripId, variant: pass.variant, amountCents, utm: pass.utm });
  }
  await store.markProcessed(event.id);
  return { kind: 'activated', tripId, status };
}
