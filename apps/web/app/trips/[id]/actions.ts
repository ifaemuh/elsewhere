'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireUser } from '@/lib/auth/user';
import { appUrl, requireEnv } from '@/lib/env';
import { ANONYMOUS_ID_COOKIE, isAnonymousId } from '@/lib/funnel/anonymous-id';
import { recordEvent } from '@/lib/funnel/events';
import { parseUtmCookie, UTM_COOKIE } from '@/lib/funnel/utm';
import { assignVariant, VARIANT_PRICE_CENTS } from '@/lib/funnel/variant';
import { priceIdFor, stripe } from '@/lib/payments/stripe';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { joinToken, nextJoinExpiry } from '@/lib/trips/join-token';

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

  // Reuse an in-flight checkout rather than opening a second one (second tab, early return from Stripe, webhook outage).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: pending, error: pendingError } = await createAdminClient()
    .from('passes')
    .select('stripe_session_id')
    .eq('trip_id', tripId)
    .eq('status', 'pending')
    .gte('created_at', since)
    .order('created_at', { ascending: false });
  if (pendingError) throw new Error(pendingError.message);
  for (const row of pending ?? []) {
    if (!row.stripe_session_id) continue;
    const existing = await stripe().checkout.sessions.retrieve(row.stripe_session_id);
    if (existing.status === 'complete') redirect(`/trips/${tripId}?pass=success`);
    if (existing.status === 'open' && existing.url) redirect(existing.url);
  }

  const store = await cookies();
  const anonymousId = store.get(ANONYMOUS_ID_COOKIE)?.value;
  const variant = isAnonymousId(anonymousId) ? assignVariant(anonymousId) : 'p19';
  const session = await stripe().checkout.sessions.create({
    mode: 'payment',
    // Delayed-settlement methods arrive unpaid and would charge without activating the trip.
    allowed_payment_method_types: ['card'],
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

async function requirePlanner(tripId: string) {
  await requireUser(`/trips/${tripId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can do that.');
  return supabase;
}

export async function createJoinLink(tripId: string): Promise<string> {
  const supabase = await requirePlanner(tripId);
  const { data: trip, error } = await supabase.from('trips').select('end_date, join_token_expires_at').eq('id', tripId).single();
  if (error || !trip?.end_date) throw new Error('Set the trip dates before inviting the group.');
  // Never equal to the stored expiry, so a reset always retires the old link.
  const expiresAt = nextJoinExpiry(trip.end_date, trip.join_token_expires_at);
  const token = joinToken(requireEnv('JOIN_LINK_SECRET'), tripId, expiresAt);
  // join_token_hash is not column-writable. set_join_token checks the planner again and stores only the hash.
  const { error: setError } = await supabase.rpc('set_join_token', { p_trip_id: tripId, p_token: token, p_expires_at: expiresAt });
  if (setError) throw new Error(setError.message);
  // The trip page shows the link; re-render it.
  revalidatePath(`/trips/${tripId}`);
  return `${appUrl()}/join/${token}`;
}

export async function currentJoinLink(tripId: string): Promise<string | null> {
  const supabase = await requirePlanner(tripId);
  const { data: trip } = await supabase.from('trips').select('join_token_expires_at').eq('id', tripId).single();
  if (!trip?.join_token_expires_at || new Date(trip.join_token_expires_at) < new Date()) return null;
  return `${appUrl()}/join/${joinToken(requireEnv('JOIN_LINK_SECRET'), tripId, trip.join_token_expires_at)}`;
}

/** The trip page's create/reset button. A failure (dates in the past, an RPC error) leaves a note, not a crash. */
export async function resetJoinLink(rawTripId: string): Promise<void> {
  const tripId = z.string().uuid().parse(rawTripId);
  // Outside the try: a sign-in redirect must not be swallowed as a link failure.
  await requireUser(`/trips/${tripId}`);
  let failed = false;
  try {
    await createJoinLink(tripId);
  } catch (error) {
    console.error('createJoinLink failed', error instanceof Error ? error.message : 'unknown error');
    failed = true;
  }
  // Land on the clean URL on success, so an earlier ?invite=failed note does not stick.
  redirect(failed ? `/trips/${tripId}?invite=failed` : `/trips/${tripId}`);
}
