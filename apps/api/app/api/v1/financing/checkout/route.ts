import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { financingCheckoutRequestSchema } from '@elsewhere/shared';
import { errorResponse } from '@lib/utils/errors';
import { getFinancingAdapter } from '@lib/providers/financing';
import { generateInstallments } from '@lib/engines/wallet';

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const body = await req.json();
    const validated = financingCheckoutRequestSchema.parse(body);

    // Check idempotency — if we already processed this key, return existing result
    const { data: existing } = await supabase
      .from('financing_checkouts')
      .select('*')
      .eq('idempotency_key', validated.idempotencyKey)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(existing);
    }

    // Fetch the offer to get provider details
    const { data: offer, error: offerError } = await supabase
      .from('financing_offers')
      .select('*')
      .eq('id', validated.offerId)
      .single();

    if (offerError || !offer) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Financing offer not found', statusCode: 404 },
        { status: 404 },
      );
    }

    // Execute checkout with provider
    const adapter = getFinancingAdapter();
    const result = await adapter.checkout(
      validated.offerId,
      validated.totalAmount,
      validated.idempotencyKey,
    );

    // Store checkout result
    const { data: checkout, error: checkoutError } = await supabase
      .from('financing_checkouts')
      .insert({
        offer_id: validated.offerId,
        trip_id: validated.tripId,
        checkout_id: result.checkoutId,
        provider_name: offer.provider_name,
        provider_reference: result.providerReference,
        status: result.status,
        idempotency_key: validated.idempotencyKey,
        policy_version: validated.policyVersion,
      })
      .select('*')
      .single();

    if (checkoutError) {
      return NextResponse.json(
        { error: 'Failed to record checkout', message: checkoutError.message, statusCode: 500 },
        { status: 500 },
      );
    }

    // Record financing disclosure
    await supabase.from('financing_disclosure_records').insert({
      trip_id: validated.tripId,
      user_id: user.id,
      accepted_at: new Date().toISOString(),
      policy_version: validated.policyVersion,
      terms_summary: `${offer.provider_name} ${offer.months}mo at ${offer.apr_percent}% APR`,
    });

    // Get travelers for the trip (or create owner as sole traveler)
    let { data: travelers } = await supabase
      .from('travelers')
      .select('id')
      .eq('trip_id', validated.tripId);

    if (!travelers?.length) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .single();

      const { data: newTraveler } = await supabase
        .from('travelers')
        .insert({
          trip_id: validated.tripId,
          user_id: user.id,
          name: profile?.display_name ?? 'Traveler',
          payment_state: 'pending',
        })
        .select('id')
        .single();

      travelers = newTraveler ? [newTraveler] : [];
    }

    // Generate wallet installments
    if (travelers.length > 0) {
      await generateInstallments(supabase, {
        tripId: validated.tripId,
        totalAmount: validated.totalAmount,
        months: offer.months,
        travelerIds: travelers.map((t) => t.id),
      });
    }

    return NextResponse.json(checkout);
  } catch (error) {
    return errorResponse(error);
  }
}
