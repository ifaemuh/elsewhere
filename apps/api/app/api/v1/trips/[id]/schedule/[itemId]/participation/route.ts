import { NextRequest, NextResponse } from 'next/server';
import type { TripParticipationStatus } from '@elsewhere/shared';
import { getAuthUser } from '@lib/supabase/middleware';
import { updateMockTripParticipation } from '@lib/trips/mock-trip-room';
import { errorResponse } from '@lib/utils/errors';

const VALID_STATUSES: TripParticipationStatus[] = [
  'interested',
  'going',
  'not_going',
  'maybe',
  'resting',
  'join_later',
  'needs_vote',
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  try {
    await getAuthUser(req);
    const { id, itemId } = await params;
    const body = await req.json();

    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Unsupported participation status', statusCode: 400 },
        { status: 400 },
      );
    }

    return NextResponse.json(updateMockTripParticipation(id, itemId, body.status));
  } catch (error) {
    return errorResponse(error);
  }
}
