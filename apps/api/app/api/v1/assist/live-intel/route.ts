import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { isLocalDev } from '@lib/storage';
import { errorResponse } from '@lib/utils/errors';
import { getMockTripGuide } from '@lib/assist/mock-trip-guides';
import { buildLiveTripIntelligence } from '@lib/assist/live-intelligence';

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

    if (isLocalDev()) {
      const guide = getMockTripGuide(tripId);
      if (!guide) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Trip guide not found', statusCode: 404 },
          { status: 404 },
        );
      }

      return NextResponse.json(await buildLiveTripIntelligence(guide));
    }

    const { data: trip, error } = await supabase
      .from('trips')
      .select('id')
      .eq('id', tripId)
      .single();

    if (error || !trip) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Trip not found', statusCode: 404 },
        { status: 404 },
      );
    }

    return NextResponse.json(
      { error: 'Not Implemented', message: 'Live provider-backed intelligence is not connected for production trips yet.' },
      { status: 501 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
