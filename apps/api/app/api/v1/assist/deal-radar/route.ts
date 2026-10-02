import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { buildDealRadar } from '@lib/assist/travel-intel';
import { getMockTripGuide } from '@lib/assist/mock-trip-guides';
import { isLocalDev } from '@lib/storage';
import { errorResponse } from '@lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    await getAuthUser(req);
    const tripId = req.nextUrl.searchParams.get('tripId');

    const guide = tripId && isLocalDev() ? getMockTripGuide(tripId) : undefined;
    return NextResponse.json(await buildDealRadar({ guide }));
  } catch (error) {
    return errorResponse(error);
  }
}
