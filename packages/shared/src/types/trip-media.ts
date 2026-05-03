export type TripMediaSource = 'photo_library' | 'manual_upload' | 'in_app_camera' | 'social_post' | 'recap_output';
export type TripMediaType = 'photo' | 'video' | 'social_post' | 'recap_video';
export type TripMediaStatus =
  | 'candidate'
  | 'pending_owner_approval'
  | 'shared'
  | 'rejected'
  | 'hidden'
  | 'recap_selected'
  | 'recap_excluded';
export type TripMediaMatchConfidence = 'high' | 'medium' | 'low' | 'manual';
export type TripMediaSharingMode = 'off' | 'approval_required' | 'auto_share_trip_matched';
export type TripMediaApprovalAction =
  | 'approve'
  | 'reject'
  | 'hide'
  | 'restore'
  | 'select_for_recap'
  | 'exclude_from_recap';

export interface TripMediaLocation {
  name: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface TripMediaItem {
  id: string;
  tripId: string;
  ownerUserId: string;
  ownerName: string;
  source: TripMediaSource;
  mediaType: TripMediaType;
  status: TripMediaStatus;
  caption: string | null;
  capturedAt: string | null;
  uploadedAt: string;
  sourceUrl: string | null;
  thumbnailUrl: string | null;
  socialProvider: string | null;
  socialPostUrl: string | null;
  socialAuthorHandle: string | null;
  location: TripMediaLocation | null;
  matchedPlaceId: string | null;
  matchedScheduleItemId: string | null;
  matchConfidence: TripMediaMatchConfidence;
  matchReasons: string[];
  visibleToTrip: boolean;
  eligibleForRecap: boolean;
}

export interface TripMediaApproval {
  id: string;
  tripId: string;
  mediaId: string;
  actorUserId: string;
  action: TripMediaApprovalAction;
  reason: string | null;
  createdAt: string;
}

export interface TripMediaShareSettings {
  tripId: string;
  userId: string;
  sharingMode: TripMediaSharingMode;
  allowPhotoLibraryScan: boolean;
  allowVideoCandidates: boolean;
  allowSocialPostSuggestions: boolean;
  autoShareMinConfidence: TripMediaMatchConfidence;
  defaultRecapEligible: boolean;
}

export interface TripMediaResult {
  items: TripMediaItem[];
  shareSettings: TripMediaShareSettings;
}
