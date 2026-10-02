import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthUser } from '@lib/supabase/middleware';
import { createPreviewVideoJob } from '@lib/ai/sora-videos';
import { errorResponse } from '@lib/utils/errors';

const createPreviewVideoSchema = z.object({
  cardId: z.string().min(1),
  destinationName: z.string().min(1),
  title: z.string().min(1),
  prompt: z.string().min(1),
  people: z.array(z.string()).optional(),
  mode: z.enum(['discover_preview', 'trip_recap']).optional(),
  seconds: z.enum(['4', '8', '12']).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { user } = await getAuthUser(req);
    const input = createPreviewVideoSchema.parse(await req.json());
    const job = await createPreviewVideoJob(user.id, input);
    return NextResponse.json(job, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
