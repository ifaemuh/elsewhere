import { NextRequest, NextResponse } from 'next/server';
import type { TripMediaApprovalAction } from '@elsewhere/shared';
import { getAuthUser } from '@lib/supabase/middleware';
import { updateMockTripMediaApproval } from '@lib/trips/mock-trip-room';
import { errorResponse } from '@lib/utils/errors';

const VALID_ACTIONS: TripMediaApprovalAction[] = [
  'approve',
  'reject',
  'hide',
  'restore',
  'select_for_recap',
  'exclude_from_recap',
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; mediaId: string }> },
) {
  try {
    await getAuthUser(req);
    const { id, mediaId } = await params;
    const body = await req.json();

    if (!VALID_ACTIONS.includes(body.action)) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'Unsupported media approval action', statusCode: 400 },
        { status: 400 },
      );
    }

    return NextResponse.json(updateMockTripMediaApproval(id, mediaId, body.action));
  } catch (error) {
    return errorResponse(error);
  }
}
