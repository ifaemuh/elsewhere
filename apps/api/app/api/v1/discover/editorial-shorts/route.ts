import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { buildEditorialShort } from '@lib/discover/content-intelligence';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

const shortSchema = z.object({
  destinationName: z.string().min(2),
  hook: z.string().min(2),
  fact: z.string().min(2),
  mediaUrl: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await getAuthUser(req);
    const input = shortSchema.parse(await req.json());
    return NextResponse.json(buildEditorialShort(input));
  } catch (error) {
    return errorResponse(error);
  }
}
