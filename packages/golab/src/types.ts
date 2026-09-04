export type VisualStyle = 'photoreal' | 'stylized';
export type PoiCategory = 'hotel' | 'attraction' | 'restaurant';
export type AudioSource = 'trending' | 'cml' | 'ai-generated';

export interface Variant {
  visualStyle: VisualStyle;
  poiCategory: PoiCategory;
  /** Free text, e.g. 'question', 'pov', 'list'. Compared as an exact string. */
  hookFormat: string;
}

export interface VideoRecord {
  /** Stable slug, e.g. '001-summit-one-vanderbilt'. */
  id: string;
  /** ISO 8601 date the video was posted. */
  postedAt: string;
  poiName: string;
  /** Expected commission per booking in USD, read from partner.tiktok-go.us. */
  poiCommissionUsd: number;
  variant: Variant;
  audioSource: AudioSource;
  tiktokUrl?: string;
}

export interface Outcome {
  videoId: string;
  /** ISO 8601 date these numbers were read off TikTok. */
  recordedAt: string;
  views: number;
  poiTaps: number;
  /** Confirmed bookings, net of clawbacks. The number the verdict turns on. */
  bookings: number;
  /** Commission actually received. Lags 60-120 days. Never gate on this. */
  commissionUsd: number;
}

export interface ExperimentStore {
  videos: VideoRecord[];
  outcomes: Outcome[];
}
