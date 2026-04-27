import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';
import { transitionBookingState } from '@lib/engines/booking';

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const { tripId } = await req.json();

    if (!tripId) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'tripId is required', statusCode: 400 },
        { status: 400 },
      );
    }

    // Transition: payment_pending -> confirmed
    const result = await transitionBookingState(supabase, tripId, 'confirmed');

    // Add trip owner as first traveler
    const { data: trip } = await supabase
      .from('trips')
      .select('owner_id, traveler_count')
      .eq('id', tripId)
      .single();

    if (trip) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('id', trip.owner_id)
        .single();

      await supabase.from('travelers').insert({
        trip_id: tripId,
        user_id: trip.owner_id,
        name: profile?.display_name ?? 'Traveler',
        payment_state: 'paid',
      });
    }

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
