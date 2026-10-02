import { NextRequest, NextResponse } from 'next/server';
import type { TripActionItemStatus } from '@elsewhere/shared';
import { getAuthUser } from '@lib/supabase/middleware';
import { updateMockTripActionItem } from '@lib/trips/mock-trip-room';
import { errorResponse } from '@lib/utils/errors';

const VALID_STATUSES: TripActionItemStatus[] = ['open', 'snoozed', 'done'];

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; actionItemId: string }> },
) {
  try {
    await getAuthUser(req);
    const { id, actionItemId } = await params;
    const body = await req.json();

    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'status must be open, snoozed, or done', statusCode: 400 },
        { status: 400 },
      );
    }

    return NextResponse.json(updateMockTripActionItem(id, actionItemId, body.status));
  } catch (error) {
    return errorResponse(error);
  }
}
