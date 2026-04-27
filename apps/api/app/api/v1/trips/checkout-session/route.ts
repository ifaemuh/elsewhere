import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { checkoutRequestSchema } from '@elsewhere/shared';
import { errorResponse } from '@lib/utils/errors';
import { transitionBookingState, failBooking } from '@lib/engines/booking';
import { randomUUID } from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const body = await req.json();
    const validated = checkoutRequestSchema.parse(body);

    // Transition: quote_created -> reserving_inventory
    await transitionBookingState(supabase, validated.tripId, 'reserving_inventory');

    // Simulate inventory reservation (replace with real provider in production)
    const inventoryReserved = true;
    if (!inventoryReserved) {
      await failBooking(supabase, validated.tripId, 'Inventory unavailable');
      return NextResponse.json(
        { error: 'Booking Failed', message: 'Inventory unavailable', statusCode: 409 },
        { status: 409 },
      );
    }

    // Transition: reserving_inventory -> payment_pending
    const sessionId = `checkout-${randomUUID()}`;
    const checkoutUrl = `https://checkout.elsewhere.app/session/${sessionId}`;

    await transitionBookingState(supabase, validated.tripId, 'payment_pending', {
      booking_flow_checkout_url: checkoutUrl,
    });

    return NextResponse.json({ checkoutUrl, sessionId });
  } catch (error) {
    return errorResponse(error);
  }
}
