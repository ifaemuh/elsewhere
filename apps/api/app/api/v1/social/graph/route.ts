import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { getMockSocialGraph } from '@lib/social/mock-social';
import { errorResponse } from '@lib/utils/errors';

export async function GET(req: NextRequest) {
  try {
    await getAuthUser(req);
    const filter = req.nextUrl.searchParams.get('filter') === 'close' ? 'close' : 'all';
    return NextResponse.json(getMockSocialGraph(filter));
  } catch (error) {
    return errorResponse(error);
  }
}
