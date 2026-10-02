import type Stripe from 'stripe';
import { requireEnv } from '@/lib/env';
import { supabasePassStore } from '@/lib/payments/pass-store';
import { handleStripeEvent } from '@/lib/payments/passes';
import { stripe } from '@/lib/payments/stripe';

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, request.headers.get('stripe-signature') ?? '', requireEnv('STRIPE_WEBHOOK_SECRET'));
  } catch {
    return new Response('invalid signature', { status: 400 });
  }
  const outcome = await handleStripeEvent(event, supabasePassStore());
  return Response.json(outcome);
}
