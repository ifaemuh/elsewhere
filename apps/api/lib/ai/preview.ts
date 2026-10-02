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

function hasGatewayAuth(): boolean {
  return !!process.env.AI_GATEWAY_API_KEY || !!process.env.VERCEL;
}

function fallbackEnhancedPrompt(destinationName: string, userPrompt: string): string {
  return [
    userPrompt,
    `Cinematic, photorealistic travel scene at ${destinationName}.`,
    'Golden hour lighting, natural pose, editorial travel photography, rich detail.',
  ].join(' ');
}

function cleanErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unknown error';
  // Remove ANSI escape sequences that otherwise show up raw in mobile UI.
  return message.replace(/\x1b\[[0-9;]*m/g, '').trim();
}

async function enhancePrompt(destinationName: string, userPrompt: string): Promise<string> {
  if (!hasGatewayAuth()) {
    return fallbackEnhancedPrompt(destinationName, userPrompt);
  }

  try {
    const { text } = await generateText({
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

    return text;
  } catch (error) {
    if (isLocalDev() && cleanErrorMessage(error).includes('Unauthenticated request to AI Gateway')) {
      return fallbackEnhancedPrompt(destinationName, userPrompt);
    }
    throw error;
  }
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

async function getReferencePhotoInput(
  photoId: string,
  userId: string,
  storage: StorageAdapter,
): Promise<string | Buffer | null> {
  if (isLocalDev()) {
    const photo = referencePhotoStore.get(photoId);
    if (!photo || photo.user_id !== userId) return null;
    return storage.download(photo.storage_path);
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
    // Step 1: Enhance the prompt when Gateway auth is available.
    // Local mobile validation should still work without AI Gateway because
    // the product wedge is the reference-photo -> Replicate path.
    const enhancedPrompt = await enhancePrompt(destinationName, userPrompt);

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
          const message = cleanErrorMessage(err);
          console.error('[preview] FLUX Kontext failed:', message);
          throw new Error(`Personalized preview generation failed: ${message}`);
        },
      );
    }

    // Fallback: generic Gemini generation
    if (!personalized) {
      if (!hasGatewayAuth()) {
        throw new Error(
          'AI_GATEWAY_API_KEY is required for generic previews. Add a selfie to test personalized previews locally, or set AI_GATEWAY_API_KEY.',
        );
      }

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
    const contentType = personalized ? 'image/jpeg' : 'image/webp';
    const extension = personalized ? 'jpg' : 'webp';
    const fileName = `previews/${userId}/${jobId}.${extension}`;
    const imageUrl = await storage.upload(fileName, imageBuffer!, contentType);

    // Step 4: Mark complete
    await jobs.updateStatus(jobId, 'completed', {
      playback_url: imageUrl,
      thumbnail_url: imageUrl,
    });

    return { imageUrl, enhancedPrompt, personalized };
  } catch (error) {
    const message = cleanErrorMessage(error);
    await jobs.updateStatus(jobId, 'failed', { error_message: message });
    throw new Error(message);
  }
}

async function tryPersonalizedGeneration(
  photoId: string,
  userId: string,
  destinationName: string,
  enhancedPrompt: string,
  storage: StorageAdapter,
): Promise<Buffer> {
  const referenceImage = await getReferencePhotoInput(photoId, userId, storage);
  if (!referenceImage) throw new Error('Reference photo not found');

  const prompt = buildPersonalizedPreviewPrompt(destinationName, enhancedPrompt);
  return generatePersonalizedImage(referenceImage, prompt);
}
