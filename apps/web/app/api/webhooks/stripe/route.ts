import type Stripe from 'stripe';
import { start } from 'workflow/api';
import { requireEnv } from '@/lib/env';
import { supabasePassStore } from '@/lib/payments/pass-store';
import { handleStripeEvent } from '@/lib/payments/passes';
import { stripe } from '@/lib/payments/stripe';
import { tripMonitorWorkflow } from '@/workflows/trip-monitor';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  // Resolved outside the try: a missing env var is a 500 we must see, not a 400 that looks like a bad signature.
  const client = stripe();
  const secret = requireEnv('STRIPE_WEBHOOK_SECRET');
  let event: Stripe.Event;
  try {
    event = client.webhooks.constructEvent(body, request.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return new Response('invalid signature', { status: 400 });
  }
  const outcome = await handleStripeEvent(event, supabasePassStore());
  if (outcome.kind === 'activated') {
    // handleStripeEvent has marked the event processed, so Stripe will not retry it. A failed start is logged
    // and answered 200: /admin's "Start monitoring" restarts it (Task 16), and a second run exits at once.
    try {
      await start(tripMonitorWorkflow, [outcome.tripId]);
    } catch (error) {
      console.error('trip monitor did not start', outcome.tripId, error);
    }
  }
  return Response.json(outcome);
}
