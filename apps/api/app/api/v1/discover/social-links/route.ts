import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { importSocialLink } from '@lib/discover/content-intelligence';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';

const socialLinkSchema = z.object({
  url: z.string().url(),
  destinationHint: z.string().min(2).optional(),
});

export async function POST(req: NextRequest) {
  try {
    await getAuthUser(req);
    const input = socialLinkSchema.parse(await req.json());
    return NextResponse.json(importSocialLink(input));
  } catch (error) {
    return errorResponse(error);
  }
}
