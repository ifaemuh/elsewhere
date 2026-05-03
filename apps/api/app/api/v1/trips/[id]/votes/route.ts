import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { getMockTripVotes } from '@lib/trips/mock-trip-room';
import { errorResponse } from '@lib/utils/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await getAuthUser(req);
    const { id } = await params;
    return NextResponse.json(getMockTripVotes(id));
  } catch (error) {
    return errorResponse(error);
  }
}
