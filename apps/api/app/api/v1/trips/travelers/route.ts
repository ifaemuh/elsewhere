import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';
import { z } from 'zod';

const addTravelerSchema = z.object({
  tripId: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const body = await req.json();
    const validated = addTravelerSchema.parse(body);

    const { data: traveler, error } = await supabase
      .from('travelers')
      .insert({
        trip_id: validated.tripId,
        name: validated.name,
        payment_state: 'pending',
      })
      .select('*')
      .single();

    if (error) {
      return NextResponse.json(
        { error: 'Failed to add traveler', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json(traveler, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const tripId = req.nextUrl.searchParams.get('tripId');

    if (!tripId) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'tripId is required', statusCode: 400 },
        { status: 400 },
      );
    }

    const { data: travelers, error } = await supabase
      .from('travelers')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch travelers', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    return NextResponse.json(travelers);
  } catch (error) {
    return errorResponse(error);
  }
}
