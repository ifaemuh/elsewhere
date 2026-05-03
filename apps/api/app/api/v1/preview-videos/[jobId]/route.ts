import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { getPreviewVideoJob } from '@lib/ai/sora-videos';
import { errorResponse } from '@lib/utils/errors';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { user } = await getAuthUser(req);
    const { jobId } = await params;
    const job = await getPreviewVideoJob(user.id, jobId);
    if (!job) {
      return NextResponse.json({ error: 'Preview video not found' }, { status: 404 });
    }
    return NextResponse.json(job);
  } catch (error) {
    return errorResponse(error);
  }
}
