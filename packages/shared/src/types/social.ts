export type SocialProviderKind = 'facebook' | 'instagram' | 'tiktok' | 'contacts' | 'manual' | 'elsewhere';
export type SocialConnectionStatus = 'connected' | 'missing_credentials' | 'not_connected' | 'limited' | 'mock';
export type SocialRelationshipStrength = 'close' | 'maybe_close' | 'loose';
export type SocialOccasionKind = 'birthday' | 'anniversary' | 'wedding' | 'graduation' | 'holiday' | 'event';
export type SocialReferencePhotoStatus = 'none' | 'requested' | 'available' | 'consented';

export interface SocialProviderCoverage {
  id: string;
  provider: SocialProviderKind;
  name: string;
  status: SocialConnectionStatus;
  configured: boolean;
  detail: string;
  limitations: string[];
}

export interface SocialAccountLink {
  provider: SocialProviderKind;
  providerUserId: string | null;
  handle: string | null;
  displayName: string | null;
  profileUrl: string | null;
  confidence: 'low' | 'medium' | 'high';
  verifiedSamePerson: boolean;
}

export interface SocialPerson {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  closeFriend: boolean;
  relationshipStrength: SocialRelationshipStrength;
  connectedElsewhereUserId: string | null;
  accounts: SocialAccountLink[];
  referencePhotoStatus: SocialReferencePhotoStatus;
  identityConsentStatus: 'not_requested' | 'pending' | 'granted' | 'declined';
}

export interface SocialOccasion {
  id: string;
  kind: SocialOccasionKind;
  title: string;
  date: string;
  sourceProvider: SocialProviderKind;
  sourceLabel: string;
  personIds: string[];
  confidence: 'low' | 'medium' | 'high';
  limitations: string[];
}

export interface SocialTripInviteCard {
  id: string;
  occasionId: string;
  title: string;
  subtitle: string;
  destinationName: string;
  destinationId: string | null;
  inviteePersonIds: string[];
  shareUrl: string;
  shareText: string;
  previewReadiness: 'ready' | 'needs_friend_consent' | 'needs_reference_photos';
}

export interface SocialGraphResult {
  generatedAt: string;
  providerCoverage: SocialProviderCoverage[];
  people: SocialPerson[];
  closeFriends: SocialPerson[];
  occasions: SocialOccasion[];
  inviteCards: SocialTripInviteCard[];
}
