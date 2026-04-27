import { apiBaseUrl } from './utils';
import {
  totalCost as calculateTotalCost,
  type Destination,
  type PreviewJob,
  type ReferencePhoto,
  type UploadReferencePhotoResponse,
} from '@elsewhere/shared';

export const POLICY_VERSION = '2026.04.v1';

export type DestinationRow = Destination;
export type { PreviewJob };

export function totalCost(d: DestinationRow): number {
  return calculateTotalCost(d);
}

export async function fetchDestinations(): Promise<DestinationRow[]> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/destinations`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch destinations: ${res.status}`);
  return res.json();
}

export async function fetchHealth(): Promise<{ status: string; environment: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/health`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export interface RecordConsentArgs {
  destinationName: string;
  prompt: string;
  hasIdentityConsent: boolean;
  hasReferenceMedia: boolean;
}

export async function recordPreviewConsent(
  token: string,
  args: RecordConsentArgs,
): Promise<{ consentId: string; storedAt: string }> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/consents/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      destinationName: args.destinationName,
      prompt: args.prompt,
      hasIdentityConsent: args.hasIdentityConsent,
      hasRightsConfirmation: true,
      hasReferenceMedia: args.hasReferenceMedia,
      policyVersion: POLICY_VERSION,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to record consent (${res.status})`);
  }
  return res.json();
}

export async function createPreviewJob(
  token: string,
  destination: DestinationRow,
  consentId: string,
  customPrompt?: string,
  referencePhotoIds?: string[],
): Promise<{ jobId: string }> {
  const prompt =
    customPrompt?.trim() ||
    `${destination.teaser} Cinematic travel photography of ${destination.name}, ${destination.country}.`;

  const body: Record<string, unknown> = {
    destinationId: destination.id,
    destinationName: destination.name,
    prompt,
    mediaType: 'image',
    consentId,
  };
  if (referencePhotoIds && referencePhotoIds.length > 0) {
    body.referencePhotoIds = referencePhotoIds;
  }

  const res = await fetch(`${apiBaseUrl()}/api/v1/preview-jobs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to create preview job (${res.status})`);
  }
  return res.json();
}

export async function listReferencePhotos(token: string): Promise<ReferencePhoto[]> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/reference-photos`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to list reference photos (${res.status})`);
  return res.json();
}

export async function uploadReferencePhoto(
  token: string,
  file: Blob,
  fileName: string,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp',
): Promise<UploadReferencePhotoResponse> {
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('fileName', fileName);
  formData.append('contentType', contentType);

  const res = await fetch(`${apiBaseUrl()}/api/v1/reference-photos`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to upload photo (${res.status})`);
  }
  return res.json();
}

export async function deleteReferencePhoto(token: string, photoId: string): Promise<void> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/reference-photos/${photoId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to delete photo (${res.status})`);
}

export async function fetchPreviewJob(token: string, jobId: string): Promise<PreviewJob> {
  const res = await fetch(`${apiBaseUrl()}/api/v1/preview-jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Failed to fetch preview job: ${res.status}`);
  return res.json();
}
