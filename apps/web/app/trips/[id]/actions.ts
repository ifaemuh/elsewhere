'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/user';
import { appUrl } from '@/lib/env';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { recordEvent } from '@/lib/funnel/events';
import { parseUtmCookie, UTM_COOKIE } from '@/lib/funnel/utm';
import { assignVariant, VARIANT_PRICE_CENTS } from '@/lib/funnel/variant';
import { priceIdFor, stripe } from '@/lib/payments/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

export async function startPassCheckout(rawTripId: string): Promise<void> {
  const tripId = z.string().uuid().parse(rawTripId);
  const user = await requireUser(`/trips/${tripId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can start the trip pass.');

  // Never open a second checkout for a trip that already has a pass.
  const { data: trip, error: tripError } = await supabase.from('trips').select('pass_status').eq('id', tripId).maybeSingle();
  if (tripError) throw new Error(tripError.message);
  if (!trip) throw new Error('Trip not found.');
  if (trip.pass_status !== 'none') redirect(`/trips/${tripId}`);

  const store = await cookies();
  const anonymousId = store.get(ANONYMOUS_ID_COOKIE)?.value;
  const variant = isAnonymousId(anonymousId) ? assignVariant(anonymousId) : 'p19';
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    line_items: [{ price: priceIdFor(variant), quantity: 1 }],
    client_reference_id: tripId,
    customer_email: user.email ?? undefined,
    allow_promotion_codes: true,
    metadata: { trip_id: tripId, variant },
    success_url: `${appUrl()}/trips/${tripId}?pass=success`,
    cancel_url: `${appUrl()}/trips/${tripId}?pass=cancelled`,
  });
  const { error } = await createAdminClient().from('passes').insert({
    trip_id: tripId,
    stripe_session_id: session.id,
    price_variant: variant,
    amount_cents: VARIANT_PRICE_CENTS[variant],
    status: 'pending',
    anonymous_id: isAnonymousId(anonymousId) ? anonymousId : null,
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  if (isAnonymousId(anonymousId)) {
    await recordEvent({ anonymousId, event: 'checkout_started', userId: user.id, tripId, variant, utm: parseUtmCookie(store.get(UTM_COOKIE)?.value) });
  }
  if (!session.url) throw new Error('Stripe did not return a checkout URL.');
  redirect(session.url);
}
