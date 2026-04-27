import { generateText } from 'ai';
import { gateway } from '@ai-sdk/gateway';
import { models } from './providers';
import { buildPreviewPrompt, buildPersonalizedPreviewPrompt } from './prompts';
import { generatePersonalizedImage } from './replicate';
import { createStorageAdapter, isLocalDev } from '../storage';
import type { StorageAdapter } from '../storage';
import { createAdminClient } from '../supabase/admin';
import { referencePhotoStore } from '../stores/memory';

interface PreviewResult {
  imageUrl: string;
  enhancedPrompt: string;
  personalized: boolean;
}

interface JobUpdater {
  updateStatus(jobId: string, status: string, extra?: Record<string, unknown>): Promise<void>;
}

function createJobUpdater(): JobUpdater {
  if (isLocalDev()) {
    return {
      async updateStatus(jobId, status, extra = {}) {
        // Import is at top of file — previewJobStore from stores/memory
        const { previewJobStore: store } = await import('../stores/memory');
        store.update(jobId, { status, ...extra });
      },
    };
  }

  const supabase = createAdminClient();
  return {
    async updateStatus(jobId, status, extra = {}) {
      await supabase
        .from('preview_jobs')
        .update({ status, ...extra, updated_at: new Date().toISOString() })
        .eq('id', jobId);
    },
  };
}

async function getReferencePhotoUrl(
  photoId: string,
  userId: string,
  storage: StorageAdapter,
): Promise<string | null> {
  if (isLocalDev()) {
    const photo = referencePhotoStore.get(photoId);
    if (!photo || photo.user_id !== userId) return null;
    return photo.url;
  }

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('reference_photos')
    .select('storage_path')
    .eq('id', photoId)
    .is('deleted_at', null)
    .single();

  if (!data) return null;
  return storage.getPublicUrl(data.storage_path);
}

export async function generatePreviewImage(
  jobId: string,
  userId: string,
  destinationName: string,
  userPrompt: string,
  referencePhotoIds?: string[],
): Promise<PreviewResult> {
  const jobs = createJobUpdater();
  const supabase = isLocalDev() ? undefined : createAdminClient();
  const storage = createStorageAdapter(supabase);

  await jobs.updateStatus(jobId, 'processing');

  try {
    // Step 1: Enhance the prompt with a text model (same for both paths)
    const { text: enhancedPrompt } = await generateText({
      model: gateway(models.text),
      prompt: `Enhance this travel image prompt for AI image generation. Make it vivid, cinematic, and specific.
Keep it under 200 words. Only output the enhanced prompt, nothing else.

Destination: ${destinationName}
User's vision: ${userPrompt}`,
      providerOptions: {
        gateway: {
          tags: ['feature:preview', 'step:prompt-enhance'],
          models: [models.textFallback],
        },
      },
    });

    let imageBuffer: Buffer;
    let personalized = false;

    // Step 2: Generate image — personalized path or generic path
    if (referencePhotoIds?.length) {
      personalized = await tryPersonalizedGeneration(
        referencePhotoIds[0],
        userId,
        destinationName,
        enhancedPrompt,
        storage,
      ).then(
        (buf) => {
          imageBuffer = buf;
          return true;
        },
        (err) => {
          console.error('[preview] FLUX Kontext failed, falling back to generic:', err.message);
          return false;
        },
      );
    }

    // Fallback: generic Gemini generation
    if (!personalized) {
      const imageResult = await generateText({
        model: gateway(models.image),
        prompt: buildPreviewPrompt(destinationName, enhancedPrompt),
        providerOptions: {
          gateway: {
            tags: ['feature:preview', 'step:image-gen'],
          },
        },
      });

      const imageFile = imageResult.files?.find((f) => f.mediaType?.startsWith('image/'));
      if (!imageFile) throw new Error('No image returned from generation model');
      imageBuffer = Buffer.from(imageFile.uint8Array);
    }

    // Step 3: Upload to storage
    const fileName = `previews/${userId}/${jobId}.webp`;
    const imageUrl = await storage.upload(fileName, imageBuffer!, 'image/webp');

    // Step 4: Mark complete
    await jobs.updateStatus(jobId, 'completed', {
      playback_url: imageUrl,
      thumbnail_url: imageUrl,
    });

    return { imageUrl, enhancedPrompt, personalized };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await jobs.updateStatus(jobId, 'failed', { error_message: message });
    throw error;
  }
}

async function tryPersonalizedGeneration(
  photoId: string,
  userId: string,
  destinationName: string,
  enhancedPrompt: string,
  storage: StorageAdapter,
): Promise<Buffer> {
  const photoUrl = await getReferencePhotoUrl(photoId, userId, storage);
  if (!photoUrl) throw new Error('Reference photo not found');

  const prompt = buildPersonalizedPreviewPrompt(destinationName, enhancedPrompt);
  return generatePersonalizedImage(photoUrl, prompt);
}
