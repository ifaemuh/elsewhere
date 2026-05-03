import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildDiscoverFeed } from '@lib/discover/content-intelligence';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

const scopeSchema = z.enum(['here', 'elsewhere', 'both']).default('both');

export async function GET(req: NextRequest) {
  try {
    await getAuthUser(req);
    const scope = scopeSchema.parse(req.nextUrl.searchParams.get('scope') ?? undefined);
    return NextResponse.json(buildDiscoverFeed(scope));
  } catch (error) {
    return errorResponse(error);
  }
}
