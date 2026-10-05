import 'server-only';
import Stripe from 'stripe';
import { requireEnv } from '@/lib/env';
import type { PriceVariant } from '@/lib/funnel/variant';

let client: Stripe | null = null;

export function stripe(): Stripe {
  client ??= new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  return client;
}

export function priceIdFor(variant: PriceVariant): string {
  return requireEnv(variant === 'p9' ? 'STRIPE_PRICE_P9' : 'STRIPE_PRICE_P19');
}
