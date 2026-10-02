import OpenAI from 'openai';
import type { PreviewVideoJob, PreviewVideoStatus, CreatePreviewVideoRequest } from '@elsewhere/shared';
import { createStorageAdapter, isLocalDev } from '../storage';
import { createAdminClient } from '../supabase/admin';

const globalForPreviewVideos = globalThis as typeof globalThis & {
  __elsewherePreviewVideoJobs?: Map<string, PreviewVideoJob & { userId: string }>;
};

const videoJobs = globalForPreviewVideos.__elsewherePreviewVideoJobs ??= new Map<
  string,
  PreviewVideoJob & { userId: string }
>();

function nowIso(): string {
  return new Date().toISOString();
}

function hasSoraAuth(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

function makeJobId(cardId: string): string {
  return `sora-${cardId}-${Date.now()}`.replace(/[^a-zA-Z0-9-_]/g, '-');
}

function buildSoraCommercialPrompt(input: CreatePreviewVideoRequest): string {
  if (input.mode === 'trip_recap') {
    return [
      'Use case: post-trip recap film for a mobile travel app',
      `Primary request: ${input.title}`,
      `Scene/background: ${input.destinationName}, cinematic vacation memories, realistic trip montage atmosphere`,
      'Subject: generic travelers only; do not depict any real person or use a recognizable likeness',
      'Action: quick recap montage with arrival movement, shared meal, local street scene, scenic moment, and one warm closing shot',
      'Camera: vertical 9:16 social video, smooth handheld travel-documentary motion, premium but natural',
      'Lighting/mood: warm, nostalgic, lived-in, celebratory without looking like an advertisement',
      'Style/format: polished post-vacation recap, no logos, no text overlays, no watermarks',
      `Timing/beats: ${input.seconds ?? '8'} seconds, four clean memory beats, readable pacing`,
      `Trip context: ${input.prompt}`,
      'Constraints: suitable for all audiences; generic people only; no celebrity, no copyrighted characters, no copyrighted music.',
    ].join('\n');
  }

  const people = input.people?.length ? input.people.join(' and ') : 'a small group of travelers';
  return [
    'Use case: mobile travel discovery commercial',
    `Primary request: ${input.title}`,
    `Scene/background: ${input.destinationName}, cinematic vacation spot, beautiful real-world travel atmosphere`,
    `Subject: generic travelers representing ${people}; do not depict any real person or use a recognizable likeness`,
    'Action: quick commercial montage with arrival, local food, scenic movement, and one memorable activity',
    'Camera: vertical 9:16 social video, smooth handheld travel-documentary motion, premium but natural',
    'Lighting/mood: warm, aspirational, relaxed, emotionally real',
    'Style/format: polished vacation commercial, no logos, no text overlays, no watermarks',
    `Timing/beats: ${input.seconds ?? '4'} seconds, fast but readable, one clear destination feeling`,
    `Destination context: ${input.prompt}`,
    'Constraints: suitable for all audiences; generic people only; no celebrity, no copyrighted characters, no copyrighted music.',
  ].join('\n');
}

function toJob(
  userId: string,
  input: CreatePreviewVideoRequest,
  patch: Partial<PreviewVideoJob>,
): PreviewVideoJob & { userId: string } {
  const timestamp = nowIso();
  return {
    userId,
    jobId: patch.jobId ?? makeJobId(input.cardId),
    providerJobId: patch.providerJobId ?? null,
    destinationName: input.destinationName,
    title: input.title,
    prompt: patch.prompt ?? buildSoraCommercialPrompt(input),
    status: patch.status ?? 'queued',
    progress: patch.progress ?? 0,
    videoUrl: patch.videoUrl ?? null,
    thumbnailUrl: patch.thumbnailUrl ?? null,
    errorMessage: patch.errorMessage ?? null,
    mock: patch.mock ?? false,
    limitation: patch.limitation ??
      'Sora test videos are generic destination films. Current Sora API testing does not use real user or friend likenesses.',
    createdAt: patch.createdAt ?? timestamp,
    updatedAt: patch.updatedAt ?? timestamp,
  };
}

export async function createPreviewVideoJob(
  userId: string,
  input: CreatePreviewVideoRequest,
): Promise<PreviewVideoJob> {
  if (!hasSoraAuth()) {
    const job = toJob(userId, input, {
      status: 'completed',
      progress: 100,
      mock: true,
      limitation: 'OPENAI_API_KEY is not set, so this is a mock Sora result. Set OPENAI_API_KEY to generate a real MP4.',
    });
    videoJobs.set(job.jobId, job);
    return stripUser(job);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildSoraCommercialPrompt(input);
  const video = await client.videos.create({
    model: process.env.ELSEWHERE_SORA_MODEL ?? 'sora-2',
    prompt,
    seconds: input.seconds ?? (input.mode === 'trip_recap' ? '8' : '4'),
    size: '720x1280',
  });

  const job = toJob(userId, input, {
    providerJobId: video.id,
    prompt,
    status: mapSoraStatus(video.status),
    progress: video.progress ?? 0,
  });
  videoJobs.set(job.jobId, job);
  return stripUser(job);
}

export async function getPreviewVideoJob(userId: string, jobId: string): Promise<PreviewVideoJob | null> {
  const existing = videoJobs.get(jobId);
  if (!existing || existing.userId !== userId) return null;
  if (existing.mock || !existing.providerJobId || existing.status === 'completed' && existing.videoUrl) {
    return stripUser(existing);
  }

  if (!hasSoraAuth()) {
    existing.status = 'failed';
    existing.errorMessage = 'OPENAI_API_KEY is required to refresh this Sora job.';
    existing.updatedAt = nowIso();
    return stripUser(existing);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const video = await client.videos.retrieve(existing.providerJobId);
  existing.status = mapSoraStatus(video.status);
  existing.progress = video.progress ?? existing.progress;
  existing.errorMessage = video.error?.message ?? null;
  existing.updatedAt = nowIso();

  if (video.status === 'completed' && !existing.videoUrl) {
    const storage = createStorageAdapter(isLocalDev() ? undefined : createAdminClient());
    const response = await client.videos.downloadContent(video.id, { variant: 'video' });
    const buffer = Buffer.from(await response.arrayBuffer());
    existing.videoUrl = await storage.upload(
      `preview-videos/${userId}/${jobId}.mp4`,
      buffer,
      'video/mp4',
    );

    try {
      const thumbnailResponse = await client.videos.downloadContent(video.id, { variant: 'thumbnail' });
      const thumbnailBuffer = Buffer.from(await thumbnailResponse.arrayBuffer());
      existing.thumbnailUrl = await storage.upload(
        `preview-videos/${userId}/${jobId}.jpg`,
        thumbnailBuffer,
        'image/jpeg',
      );
    } catch {
      existing.thumbnailUrl = existing.videoUrl;
    }
  }

  return stripUser(existing);
}

function mapSoraStatus(status: 'queued' | 'in_progress' | 'completed' | 'failed'): PreviewVideoStatus {
  return status;
}

function stripUser(job: PreviewVideoJob & { userId: string }): PreviewVideoJob {
  const { userId: _userId, ...publicJob } = job;
  return publicJob;
}
