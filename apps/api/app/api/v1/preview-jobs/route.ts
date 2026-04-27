import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@lib/supabase/middleware';
import { createPreviewJobRequestSchema } from '@elsewhere/shared';
import { errorResponse } from '@lib/utils/errors';
import { generatePreviewImage } from '@lib/ai/preview';
import { isLocalDev } from '@lib/storage';
import { previewJobStore, consentStore } from '@lib/stores/memory';
import { after } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser(req);
    const body = await req.json();
    const validated = createPreviewJobRequestSchema.parse(body);

    const hasReferencePhotos = validated.referencePhotoIds && validated.referencePhotoIds.length > 0;

    // If using face personalization, verify identity consent
    if (hasReferencePhotos) {
      if (isLocalDev()) {
        const consent = consentStore.get(validated.consentId);
        if (!consent?.has_identity_consent) {
          return NextResponse.json(
            { error: 'Identity consent required for personalized previews' },
            { status: 403 },
          );
        }
      } else {
        const { data: consent } = await supabase
          .from('consent_audit_entries')
          .select('has_identity_consent')
          .eq('id', validated.consentId)
          .single();

        if (!consent?.has_identity_consent) {
          return NextResponse.json(
            { error: 'Identity consent required for personalized previews' },
            { status: 403 },
          );
        }
      }
    }

    let jobId: string;

    if (isLocalDev()) {
      const job = previewJobStore.create({
        user_id: user.id,
        destination_id: validated.destinationId ?? null,
        destination_name: validated.destinationName,
        prompt: validated.prompt,
        media_type: validated.mediaType,
        consent_id: validated.consentId,
        status: 'pending',
        reference_photo_ids: validated.referencePhotoIds ?? null,
      });
      jobId = job.id;
    } else {
      const { data: job, error } = await supabase
        .from('preview_jobs')
        .insert({
          user_id: user.id,
          destination_id: validated.destinationId,
          destination_name: validated.destinationName,
          prompt: validated.prompt,
          media_type: validated.mediaType,
          consent_id: validated.consentId,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error || !job) {
        return NextResponse.json(
          { error: 'Failed to create preview job', message: error?.message ?? 'Unknown', statusCode: 500 },
          { status: 500 },
        );
      }
      jobId = job.id;
    }

    // Run image generation in background after response is sent
    after(async () => {
      try {
        await generatePreviewImage(
          jobId,
          user.id,
          validated.destinationName,
          validated.prompt,
          validated.referencePhotoIds,
        );
      } catch {
        // Error already recorded in job store by generatePreviewImage
      }
    });

    return NextResponse.json({ jobId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
