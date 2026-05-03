import { NextRequest, NextResponse } from 'next/server';
import type { ActiveTripGuide } from '@elsewhere/shared';
import { getAuthUser } from '@lib/supabase/middleware';
import { isLocalDev } from '@lib/storage';
import { errorResponse } from '@lib/utils/errors';
import { getMockTripGuide, listMockTripGuides } from '@lib/assist/mock-trip-guides';

type TripRow = {
  id: string;
  status: 'draft' | 'booked' | 'in_progress';
  traveler_count: number;
  total_cost: number | string | null;
  destination?: {
    name?: string | null;
    country?: string | null;
  } | null;
};

function emptyGuideFromTrip(row: TripRow): ActiveTripGuide {
  const totalCost = Number(row.total_cost ?? 0);
  const destinationName = row.destination?.name ?? 'Trip';
  return {
    tripId: row.id,
    tripName: `${destinationName} ${new Date().getFullYear()}`,
    tripTagline: null,
    destinationName,
    destinationCountry: row.destination?.country ?? '',
    status: row.status,
    travelerCount: row.traveler_count,
    totalCost,
    protectedValue: 0,
    potentialSavings: 0,
    monitoredAt: new Date().toISOString(),
    segments: [],
    opportunities: [],
    cancellation: {
      tripId: row.id,
      summary: 'Assist is monitoring this trip. Detailed rules will appear when booking segment data is available.',
      refundAmount: 0,
      travelCreditAmount: 0,
      feeAmount: 0,
      decisionWindowEndsAt: null,
      creditExpiresAt: null,
      risks: ['Live provider rule ingestion is not connected for this production trip yet.'],
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { supabase } = await getAuthUser(req);
    const tripId = req.nextUrl.searchParams.get('tripId');

    if (isLocalDev()) {
      if (tripId) {
        const guide = getMockTripGuide(tripId);
        if (!guide) {
          return NextResponse.json(
            { error: 'Not Found', message: 'Trip guide not found', statusCode: 404 },
            { status: 404 },
          );
        }
        return NextResponse.json(guide);
      }

      return NextResponse.json(listMockTripGuides());
    }

    let query = supabase
      .from('trips')
      .select('id, status, traveler_count, total_cost, destination:destinations(name, country)')
      .in('status', ['booked', 'in_progress']);

    if (tripId) {
      query = query.eq('id', tripId);
    }

    const { data, error } = await query.order('updated_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch trip guide', message: error.message, statusCode: 500 },
        { status: 500 },
      );
    }

    const guides = (data ?? []).map((row) => emptyGuideFromTrip(row as unknown as TripRow));
    if (tripId) {
      const guide = guides[0];
      if (!guide) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Trip guide not found', statusCode: 404 },
          { status: 404 },
        );
      }
      return NextResponse.json(guide);
    }

    return NextResponse.json(guides);
  } catch (error) {
    return errorResponse(error);
  }
}
