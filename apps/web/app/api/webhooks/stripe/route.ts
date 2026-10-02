import type Stripe from 'stripe';
import { requireEnv } from '@/lib/env';
import { supabasePassStore } from '@/lib/payments/pass-store';
import { handleStripeEvent } from '@/lib/payments/passes';
import { stripe } from '@/lib/payments/stripe';

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
  return Response.json(outcome);
}
