import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { respondToMockTripVote } from '@lib/trips/mock-trip-room';
import { errorResponse } from '@lib/utils/errors';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; voteId: string }> },
) {
  try {
    await getAuthUser(req);
    const { id, voteId } = await params;
    const body = await req.json();

    if (typeof body.optionId !== 'string' || !body.optionId) {
      return NextResponse.json(
        { error: 'Validation Error', message: 'optionId is required', statusCode: 400 },
        { status: 400 },
      );
    }

    return NextResponse.json(respondToMockTripVote(id, voteId, body.optionId));
  } catch (error) {
    return errorResponse(error);
  }
}
