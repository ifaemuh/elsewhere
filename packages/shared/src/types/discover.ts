export type DiscoverFeedItemKind =
  | 'editorial'
  | 'editorial_short'
  | 'cultural_video'
  | 'unique_stay'
  | 'collection_rail'
  | 'personal_preview'
  | 'personal_trip_ad'
  | 'personal_deal'
  | 'occasion'
  | 'deal'
  | 'sponsored'
  | 'sponsored_native'
  | 'photo_memory'
  | 'interactive_prompt'
  | 'assist_alert'
  | 'travel_admin'
  | 'live_view'
  | 'social_link';

export type DiscoverMediaType = 'image' | 'video' | 'carousel';
export type DiscoverFeedScope = 'here' | 'elsewhere' | 'both';
export type DiscoverContentSourceKind =
  | 'publisher_feed'
  | 'public_research'
  | 'pexels'
  | 'google_places'
  | 'youtube'
  | 'partner'
  | 'social_link'
  | 'live_camera'
  | 'photo_library'
  | 'ai_generated'
  | 'local_demo';
export type DiscoverValueConfidence = 'low' | 'medium' | 'high';
export type DiscoverDealTrend = 'down' | 'flat' | 'up' | 'watching';
export type DiscoverMediaMode = 'video' | 'animated_still' | 'embed' | 'ai_video' | 'personal_ai';
export type DiscoverRightsStatus = 'owned' | 'licensed' | 'partner' | 'embed_only' | 'user_shared';
export type DiscoverPostFamily = 'content' | 'personal' | 'vibe';
export type MusicRightsStatus = 'owned' | 'licensed' | 'partner' | 'rights_pending' | 'spotify_reference_only' | 'not_cleared';
export type MusicProviderKind = 'elsewhere_licensed' | 'spotify_catalog' | 'direct_label' | 'commercial_library' | 'partner';
export type PhotoMemoryApprovalStatus = 'private_candidate' | 'approved_for_discover' | 'approved_for_recap' | 'rejected';

export interface DiscoverCurationAction {
  label: string;
  prompt: string;
  destinationName?: string;
}

export interface DiscoverContentSource {
  kind: DiscoverContentSourceKind;
  name: string;
  url: string | null;
  attribution: string | null;
  freshnessLabel: string | null;
  limitation: string | null;
}

export interface DiscoverArticleSource {
  publisher: string;
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
  usagePolicy: 'summary_link_only' | 'licensed_partner' | 'owned';
}

export interface DiscoverMediaGenerationRequest {
  status: 'not_needed' | 'queued' | 'ready' | 'missing_provider';
  provider: 'pexels' | 'openai_image' | 'sora' | 'publisher_feed';
  prompt: string;
  searchQuery: string;
  reason: string;
  generatedAt: string | null;
}

export interface DiscoverHeroMedia {
  id: string;
  mediaType: DiscoverMediaType;
  url: string;
  posterUrl?: string;
  mediaMode?: DiscoverMediaMode;
  sourceName?: string;
  rightsStatus?: DiscoverRightsStatus;
  alt?: string;
}

export interface DiscoverSourceHighlight {
  id: string;
  title: string;
  body: string;
  mediaUrl?: string;
  sourceName?: string;
  sourceUrl?: string | null;
}

export interface DiscoverGeneratedVideo {
  status: 'not_needed' | 'queued' | 'ready' | 'missing_provider';
  videoUrl?: string;
  posterUrl?: string;
  prompt: string;
  provider: 'sora' | 'openai_video' | 'local_demo';
  generatedAt?: string | null;
}

export interface DiscoverLearnSection {
  id: string;
  title: string;
  body: string;
  kind: 'story' | 'fact' | 'trivia' | 'source' | 'context' | 'practical';
  sourceUrl?: string | null;
}

export interface DiscoverTripValue {
  totalEstimateAmount: number;
  monthlyAmount: number;
  financingMonths: number;
  currencyCode: string;
  confidence: DiscoverValueConfidence;
  label: string;
  limitation: string;
}

export interface DiscoverTripProposalComponent {
  id: string;
  kind: 'flight' | 'hotel' | 'airbnb' | 'activity' | 'event' | 'ground';
  title: string;
  summary: string;
  estimatedPriceAmount: number;
  sourceKind: DiscoverContentSourceKind | 'mock';
}

export interface DiscoverTripProposal {
  origin: string | null;
  destination: string;
  dateWindow: string;
  calendarFit: string;
  groupFit: string;
  dealTrend: DiscoverDealTrend;
  flightEstimateAmount: number;
  stayEstimateAmount: number;
  activityEstimateAmount: number;
  components: DiscoverTripProposalComponent[];
  assistWatchItems: string[];
}

export interface EditorialShort {
  hook: string;
  script: string;
  captionText: string;
  narrationUrl: string | null;
  durationSeconds: number;
  ctaLabel: string;
  disclosure: string | null;
}

export interface DiscoverCaptionBeat {
  id: string;
  text: string;
  emphasis?: string;
  startMs?: number;
  durationMs?: number;
}

export type DiscoverCaptionTokenTone = 'normal' | 'accent' | 'quiet' | 'question' | 'answer' | 'price' | 'place';

export interface DiscoverCaptionToken {
  id: string;
  text: string;
  startMs: number;
  durationMs: number;
  tone: DiscoverCaptionTokenTone;
  scale: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  letterDelayMs?: number;
}

export interface DiscoverCaptionSegment {
  id: string;
  startMs: number;
  durationMs: number;
  tokens: DiscoverCaptionToken[];
  emphasis?: string;
  narrationCueId?: string;
}

export interface DiscoverNarration {
  script: string;
  voiceLabel: string;
  audioUrl: string | null;
  captionsAvailable: boolean;
  syncOffsetMs?: number;
  disclosure: string;
}

export interface MusicLoopPoint {
  startMs: number;
  endMs: number;
  confidence: DiscoverValueConfidence;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  provider: MusicProviderKind;
  rightsStatus: MusicRightsStatus;
  spotifyUrl: string | null;
  isrc: string | null;
  bpm: number;
  beatGridMs: number;
  vibeTags: string[];
  genre: string;
  loopPoints: MusicLoopPoint[];
  licenseTerritory: string | null;
  licenseUse: string | null;
  playableInApp: boolean;
  audioUrl: string | null;
  limitation: string | null;
}

export interface MusicCue {
  id: string;
  trackId: string;
  startMs: number;
  durationMs: number;
  beatAligned: boolean;
  captionBeatIds: string[];
}

export interface SoundtrackRecommendation {
  id: string;
  track: MusicTrack;
  reason: string;
  usePolicy: 'play_in_app' | 'suggest_on_export' | 'taste_signal_only';
}

export interface DiscoverAudioMix {
  mode: 'video_embedded' | 'music_plus_voice' | 'music_only' | 'narration_ready';
  musicTrackId?: string;
  bpm: number;
  beatGridMs: number;
  musicUrl: string | null;
  narrationUrl: string | null;
  cues?: MusicCue[];
  loopStrategy: 'seamless_loop' | 'crossfade' | 'poster_motion';
  limitation: string | null;
}

export interface DiscoverCollectionRail {
  title: string;
  subtitle: string;
  items: Array<{
    id: string;
    title: string;
    detail: string;
    imageUrl?: string;
    curationPrompt: string;
  }>;
}

export interface DiscoverMusicAttribution {
  trackId?: string;
  title: string;
  artistOrLibrary: string;
  genre: string;
  licenseKind: 'owned' | 'licensed' | 'platform_embed' | 'royalty_free_demo' | 'rights_pending';
  rightsStatus?: MusicRightsStatus;
  provider?: MusicProviderKind;
  spotifyUrl?: string | null;
  isrc?: string | null;
  beatGridMs?: number;
  loopPoints?: MusicLoopPoint[];
  vibeTags?: string[];
  licenseTerritory?: string | null;
  licenseUse?: string | null;
  playableInApp?: boolean;
  fallbackTrackId?: string | null;
  bpm?: number;
}

export interface PhotoMemoryCandidate {
  id: string;
  localAssetIds: string[];
  previewAssetId: string | null;
  mediaCount: number;
  dateRangeLabel: string;
  inferredLocation: string;
  matchConfidence: DiscoverValueConfidence;
  approvalStatus: PhotoMemoryApprovalStatus;
  privacyLabel: string;
}

export interface PhotoMemoryCluster {
  id: string;
  title: string;
  dateRangeLabel: string;
  inferredLocation: string;
  confidence: DiscoverValueConfidence;
  mediaCount: number;
  localAssetIds: string[];
  approvalStatus: PhotoMemoryApprovalStatus;
}

export interface PhotoMemoryReel {
  id: string;
  clusterId: string;
  title: string;
  generatedPostId: string | null;
  approvalStatus: PhotoMemoryApprovalStatus;
  sourceAssetIds: string[];
  privacyLabel: string;
}

export interface PhotoMemoryApproval {
  candidateId: string;
  action: 'approve_for_discover' | 'approve_for_recap' | 'keep_private' | 'reject';
  decidedAt: string;
}

export interface DiscoverParticipant {
  name: string;
  avatarUrl?: string;
}

export interface DiscoverInteractiveAnswer {
  id: string;
  label: string;
  responseHook: string;
  responseDetail: string;
  responseMediaUrl?: string;
  responsePosterUrl?: string;
  responseCtaLabel: string;
  isPreferred?: boolean;
}

export interface DiscoverInteractivePrompt {
  question: string;
  contextLabel: string;
  revealAfterMs?: number;
  answers: DiscoverInteractiveAnswer[];
}

export interface DiscoverAdminAction {
  kind: 'passport' | 'global_entry' | 'tsa_precheck' | 'visa' | 'document';
  statusLabel: string;
  deadlineLabel: string;
  actionLabel: string;
  partnerName?: string;
  partnerUrl?: string;
}

export interface DiscoverFeedItem {
  id: string;
  kind: DiscoverFeedItemKind;
  postFamily?: DiscoverPostFamily;
  feedScope?: DiscoverFeedScope;
  hook?: string;
  creatorLabel?: string;
  postType?:
    | 'destination_short'
    | 'hotel_reveal'
    | 'itinerary_spark'
    | 'deal_drop'
    | 'personal_preview'
    | 'personal_trip_ad'
    | 'personal_deal'
    | 'sponsored_native'
    | 'photo_memory'
    | 'interactive_prompt'
    | 'assist_alert'
    | 'travel_admin'
    | 'live_view'
    | 'social_import';
  title: string;
  detail: string;
  mediaType: DiscoverMediaType;
  mediaUrl?: string;
  mediaPosterUrl?: string;
  heroMediaGallery?: DiscoverHeroMedia[];
  mediaMode?: DiscoverMediaMode;
  rightsStatus?: DiscoverRightsStatus;
  music?: DiscoverMusicAttribution;
  audioMix?: DiscoverAudioMix;
  participants?: DiscoverParticipant[];
  sponsored?: boolean;
  advertiserName?: string;
  targetingReason?: string;
  soundtrackRecommendations?: SoundtrackRecommendation[];
  photoMemory?: PhotoMemoryReel;
  sourceLine: string;
  locationLabel?: string;
  primaryValueLabel?: string;
  priceBadgeLabel?: string;
  relevanceReason?: string;
  dealAttachedToPlan?: boolean;
  sourceTripId?: string;
  contentTopics?: string[];
  textTreatment?: 'documentary' | 'question' | 'personal' | 'deal' | 'admin' | 'memory';
  captionBeats?: DiscoverCaptionBeat[];
  captionSegments?: DiscoverCaptionSegment[];
  narration?: DiscoverNarration;
  interactionStats?: {
    likes: number;
    learns: number;
    plans: number;
    shares: number;
  };
  contentSources?: DiscoverContentSource[];
  articleSource?: DiscoverArticleSource;
  sourceHighlights?: DiscoverSourceHighlight[];
  mediaGeneration?: DiscoverMediaGenerationRequest;
  generatedVideo?: DiscoverGeneratedVideo;
  learnSections?: DiscoverLearnSection[];
  tripValue?: DiscoverTripValue;
  tripProposal?: DiscoverTripProposal;
  planProposal?: DiscoverTripProposal;
  assistWatchItems?: string[];
  interactivePrompt?: DiscoverInteractivePrompt;
  adminAction?: DiscoverAdminAction;
  primaryAction?: DiscoverCurationAction;
  editorialShort?: EditorialShort;
  curationAction: DiscoverCurationAction;
  collection?: DiscoverCollectionRail;
}

export interface DiscoverFeedResponse {
  generatedAt: string;
  scope: DiscoverFeedScope;
  providerCoverage: Array<{
    provider: string;
    sourceKind: DiscoverContentSourceKind;
    status: 'connected' | 'missing_credentials' | 'local_demo' | 'not_configured';
    detail: string;
  }>;
  items: DiscoverFeedItem[];
}

export interface DiscoverEnrichRequest {
  title: string;
  destinationName?: string;
  sourceUrl?: string;
  prompt?: string;
}

export interface DiscoverEnrichResult {
  item: DiscoverFeedItem;
  assumptions: string[];
}

export interface DiscoverEditorialShortRequest {
  destinationName: string;
  hook: string;
  fact: string;
  mediaUrl?: string;
}

export interface DiscoverSocialLinkRequest {
  url: string;
  destinationHint?: string;
}

export interface DiscoverSocialLinkResult {
  item: DiscoverFeedItem;
  limitation: string;
}
