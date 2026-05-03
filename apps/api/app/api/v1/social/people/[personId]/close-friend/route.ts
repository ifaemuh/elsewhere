import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { updateMockCloseFriend } from '@lib/social/mock-social';
import { errorResponse } from '@lib/utils/errors';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ personId: string }> },
) {
  try {
    await getAuthUser(req);
    const { personId } = await params;
    const body = await req.json().catch(() => ({}));
    if (typeof body.closeFriend !== 'boolean') {
      return NextResponse.json({ message: 'closeFriend boolean is required' }, { status: 400 });
    }

    return NextResponse.json(updateMockCloseFriend(personId, body.closeFriend));
  } catch (error) {
    return errorResponse(error);
  }
}
