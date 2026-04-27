import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { tripQuoteRequestSchema } from '@elsewhere/shared';
import { errorResponse } from '@lib/utils/errors';
import { transitionBookingState } from '@lib/engines/booking';

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const body = await req.json();
    const validated = tripQuoteRequestSchema.parse(body);

    // Fetch destination for pricing
    const { data: destination, error: destError } = await supabase
      .from('destinations')
      .select('*')
      .eq('id', validated.destinationId)
      .single();

    if (destError || !destination) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Destination not found', statusCode: 404 },
        { status: 404 },
      );
    }

    const totalPerPerson =
      Number(destination.flight_cost) +
      Number(destination.hotel_cost) +
      Number(destination.activity_cost) +
      Number(destination.transfer_cost) +
      Number(destination.partner_fee);
    const total = totalPerPerson * validated.travelerCount;

    // Create or find draft trip
    let tripId: string;
    const { data: existingTrip } = await supabase
      .from('trips')
      .select('id')
      .eq('owner_id', user.id)
      .eq('destination_id', validated.destinationId)
      .eq('status', 'draft')
      .eq('booking_flow_state', 'idle')
      .maybeSingle();

    if (existingTrip) {
      tripId = existingTrip.id;
      await supabase
        .from('trips')
        .update({ traveler_count: validated.travelerCount, total_cost: total })
        .eq('id', tripId);
    } else {
      const { data: newTrip, error: tripError } = await supabase
        .from('trips')
        .insert({
          owner_id: user.id,
          destination_id: validated.destinationId,
          traveler_count: validated.travelerCount,
          total_cost: total,
          status: 'draft',
          booking_flow_state: 'idle',
        })
        .select('id')
        .single();

      if (tripError || !newTrip) {
        return NextResponse.json(
          { error: 'Failed to create trip', message: tripError?.message ?? 'Unknown', statusCode: 500 },
          { status: 500 },
        );
      }
      tripId = newTrip.id;
    }

    // Transition to quote_created
    await transitionBookingState(supabase, tripId, 'quote_created');

    // Create quote record
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min
    const { data: quote, error: quoteError } = await supabase
      .from('trip_quotes')
      .insert({
        trip_id: tripId,
        total,
        currency_code: 'USD',
        expires_at: expiresAt,
      })
      .select('*')
      .single();

    if (quoteError || !quote) {
      return NextResponse.json(
        { error: 'Failed to create quote', message: quoteError?.message ?? 'Unknown', statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json({ ...quote, tripId });
  } catch (error) {
    return errorResponse(error);
  }
}
