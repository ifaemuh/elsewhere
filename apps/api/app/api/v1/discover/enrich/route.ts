import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { enrichDiscoverContent } from '@lib/discover/content-intelligence';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

const enrichSchema = z.object({
  title: z.string().min(2),
  destinationName: z.string().min(2).optional(),
  sourceUrl: z.string().url().optional(),
  prompt: z.string().min(2).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await getAuthUser(req);
    const input = enrichSchema.parse(await req.json());
    return NextResponse.json(enrichDiscoverContent(input));
  } catch (error) {
    return errorResponse(error);
  }
}
