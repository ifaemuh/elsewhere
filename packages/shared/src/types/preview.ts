export type PreviewJobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
export type PreviewMediaType = 'image' | 'video';

export interface PreviewJob {
  id: string;
  userId: string;
  destinationId: string | null;
  destinationName: string;
  prompt: string;
  mediaType: PreviewMediaType;
  status: PreviewJobStatus;
  playbackUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  consentId: string | null;
  providerJobId: string | null;
  referencePhotoIds: string[] | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePreviewJobRequest {
  destinationId: string;
  destinationName: string;
  prompt: string;
  consentId: string;
  mediaType?: PreviewMediaType;
  referencePhotoIds?: string[];
}

export type ReferencePhotoStatus = 'pending' | 'validated' | 'rejected';

export interface ReferencePhoto {
  id: string;
  userId: string;
  fileName: string;
  url: string;
  contentType: string;
  status: ReferencePhotoStatus;
  createdAt: string;
}

export interface UploadReferencePhotoResponse {
  photoId: string;
  url: string;
  status: ReferencePhotoStatus;
}
