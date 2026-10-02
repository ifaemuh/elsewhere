export type PreviewVideoStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

export interface PreviewVideoJob {
  jobId: string;
  providerJobId: string | null;
  destinationName: string;
  title: string;
  prompt: string;
  status: PreviewVideoStatus;
  progress: number;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  errorMessage: string | null;
  mock: boolean;
  limitation: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePreviewVideoRequest {
  cardId: string;
  destinationName: string;
  title: string;
  prompt: string;
  people?: string[];
  mode?: 'discover_preview' | 'trip_recap';
  seconds?: '4' | '8' | '12';
}
