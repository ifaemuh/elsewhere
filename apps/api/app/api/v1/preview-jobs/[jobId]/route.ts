import { NextRequest, NextResponse } from 'next/server';
import type { PreviewJob } from '@elsewhere/shared';
import { getAuthUser } from '@lib/supabase/middleware';
import { errorResponse } from '@lib/utils/errors';
import { isLocalDev } from '@lib/storage';
import { previewJobStore } from '@lib/stores/memory';

type PreviewJobRecord = {
  id: string;
  user_id: string;
  destination_id: string | null;
  destination_name: string;
  prompt: string;
  media_type: string;
  status: string;
  playback_url: string | null;
  thumbnail_url: string | null;
  error_message: string | null;
  consent_id: string | null;
  provider_job_id?: string | null;
  reference_photo_ids?: string[] | null;
  created_at: string;
  updated_at: string;
};

function toPreviewJob(job: PreviewJobRecord): PreviewJob {
  return {
    id: job.id,
    userId: job.user_id,
    destinationId: job.destination_id,
    destinationName: job.destination_name,
    prompt: job.prompt,
    mediaType: job.media_type === 'video' ? 'video' : 'image',
    status: job.status as PreviewJob['status'],
    playbackUrl: job.playback_url,
    thumbnailUrl: job.thumbnail_url,
    errorMessage: job.error_message,
    consentId: job.consent_id,
    providerJobId: job.provider_job_id ?? null,
    referencePhotoIds: job.reference_photo_ids ?? null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

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
      return NextResponse.json(toPreviewJob(job));
    }

    const { data: job, error } = await supabase
      .from('preview_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (error || !job) {
      return NextResponse.json(
        { error: 'Not Found', message: 'Preview job not found', statusCode: 404 },
        { status: 404 },
      );
    }

    return NextResponse.json(toPreviewJob(job));
  } catch (error) {
    return errorResponse(error);
  }
}
