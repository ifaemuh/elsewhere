import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';
import { isLocalDev } from '@lib/storage';
import { previewJobStore } from '@lib/stores/memory';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const { jobId } = await params;

    if (isLocalDev()) {
      const job = previewJobStore.get(jobId);
      if (!job || job.user_id !== user.id) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Preview job not found', statusCode: 404 },
          { status: 404 },
        );
      }
      return NextResponse.json(job);
    }

    const { data: job, error } = await supabase
      .from('preview_jobs')
      .select('*')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Preview job not found', statusCode: 404 },
        { status: 404 },
      );
    }

    return NextResponse.json(job);
  } catch (error) {
    return errorResponse(error);
  }
}
