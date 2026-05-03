import type {
  Destination,
  Trip,
  TripQuote,
  TripQuoteRequest,
  TripIntakeRequest,
  TripIntakeResult,
  CheckoutRequest,
  CheckoutSession,
  FinancingOffer,
  FinancingOfferRequest,
  FinancingCheckoutRequest,
  FinancingCheckoutResult,
  WalletInstallment,
  Traveler,
  AssistDisruptionEvent,
  AssistIncident,
  ActiveTripGuide,
  LiveTripIntelligence,
  DealRadarResult,
  TripActionItem,
  TripChatProvider,
  TripChatSuggestion,
  TripFeedCard,
  TripMediaResult,
  TripMediaApprovalAction,
  TripMessage,
  TripNotification,
  TripPaymentSummary,
  TripParticipationStatus,
  TripPlannerSuggestion,
  TripScheduleItem,
  TripActionItemStatus,
  TripVote,
  PreviewJob,
  CreatePreviewJobRequest,
  PreviewConsentRequest,
  PreviewConsentResult,
  PreviewVideoJob,
  CreatePreviewVideoRequest,
  DiscoverEditorialShortRequest,
  DiscoverEnrichRequest,
  DiscoverEnrichResult,
  DiscoverFeedResponse,
  DiscoverFeedScope,
  DiscoverSocialLinkRequest,
  DiscoverSocialLinkResult,
  ReferencePhoto,
  SocialGraphResult,
  SocialPublishingStatus,
  SocialPerson,
  UploadReferencePhotoResponse,
} from '@elsewhere/shared';
import { Platform } from 'react-native';
import { useAuthStore } from '@/stores/auth';

// On a real device, this must be the dev machine's LAN IP (e.g. http://192.168.1.x:3002),
// not localhost. Override via EXPO_PUBLIC_API_URL in .env.
const API_BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  Platform.select({
    android: 'http://10.0.2.2:3002',
    default: 'http://localhost:3002',
  })!;

async function getToken(): Promise<string | null> {
  return useAuthStore.getState().session?.access_token ?? null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `API error: ${res.status}`);
  }

  return res.json();
}

async function requestMultipart<T>(path: string, formData: FormData): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/api/v1${path}`, {
    method: 'POST',
    body: formData,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      // Do NOT set Content-Type — fetch sets it with the correct boundary for multipart
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message ?? body.error ?? `API error: ${res.status}`);
  }

  return res.json();
}

export interface DiscoverWatchResult {
  cardId: string;
  watched: boolean;
  saved: boolean;
  watchId: string | null;
  message: string;
  monitoringSignals: string[];
  limitation: string;
}

export const api = {
  baseUrl: API_BASE,

  // Health
  getHealth: () => fetch(`${API_BASE}/api/v1/health`).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? body.error ?? `API error: ${res.status}`);
    }
    return res.json() as Promise<{ status: string; environment: string; timestamp: string }>;
  }),

  // Destinations
  getFeaturedDestinations: () => request<Destination[]>('/destinations'),

  // Trips
  listTrips: () => request<Trip[]>('/trips'),
  getTrip: (id: string) => request<Trip>(`/trips/${id}`),
  quoteTrip: (req: TripQuoteRequest) =>
    request<TripQuote>('/trips/quote', { method: 'POST', body: JSON.stringify(req) }),
  intakeTrip: (req: TripIntakeRequest) =>
    request<TripIntakeResult>('/trips/intake', { method: 'POST', body: JSON.stringify(req) }),
  createCheckoutSession: (req: CheckoutRequest) =>
    request<CheckoutSession>('/trips/checkout-session', { method: 'POST', body: JSON.stringify(req) }),

  // Financing
  getFinancingOffers: (req: FinancingOfferRequest) =>
    request<FinancingOffer[]>('/financing/offers', { method: 'POST', body: JSON.stringify(req) }),
  financingCheckout: (req: FinancingCheckoutRequest) =>
    request<FinancingCheckoutResult>('/financing/checkout', { method: 'POST', body: JSON.stringify(req) }),

  // Wallet
  getWalletInstallments: (tripId: string) =>
    request<WalletInstallment[]>(`/financing/events?tripId=${tripId}`),

  // Travelers
  getTravelers: (tripId: string) =>
    request<Traveler[]>(`/trips/travelers?tripId=${tripId}`),
  addTraveler: (tripId: string, name: string) =>
    request<Traveler>('/trips/travelers', { method: 'POST', body: JSON.stringify({ tripId, name }) }),

  // Assist
  getAssistEvents: (since?: string) =>
    request<AssistDisruptionEvent[]>(`/assist/events${since ? `?since=${since}` : ''}`),
  getAssistIncidents: () => request<AssistIncident[]>('/assist/incidents'),
  listTripGuides: () => request<ActiveTripGuide[]>('/assist/trip-guide'),
  getTripGuide: (tripId: string) =>
    request<ActiveTripGuide>(`/assist/trip-guide?tripId=${encodeURIComponent(tripId)}`),
  getLiveTripIntelligence: (tripId: string) =>
    request<LiveTripIntelligence>(`/assist/live-intel?tripId=${encodeURIComponent(tripId)}`),
  getDealRadar: (tripId?: string) =>
    request<DealRadarResult>(`/assist/deal-radar${tripId ? `?tripId=${encodeURIComponent(tripId)}` : ''}`),

  // Social graph / occasion discovery
  getSocialGraph: (filter: 'all' | 'close' = 'all') =>
    request<SocialGraphResult>(`/social/graph?filter=${filter}`),
  updateSocialCloseFriend: (personId: string, closeFriend: boolean) =>
    request<SocialPerson>(`/social/people/${personId}/close-friend`, {
      method: 'PATCH',
      body: JSON.stringify({ closeFriend }),
    }),
  getSocialPublishingStatus: () =>
    request<SocialPublishingStatus>('/social/publishing/status'),

  // Discover watchlist / advertiser-backed trip ideas
  getDiscoverFeed: (scope: DiscoverFeedScope = 'both') =>
    request<DiscoverFeedResponse>(`/discover/feed?scope=${encodeURIComponent(scope)}`),
  enrichDiscoverContent: (req: DiscoverEnrichRequest) =>
    request<DiscoverEnrichResult>('/discover/enrich', { method: 'POST', body: JSON.stringify(req) }),
  createEditorialShort: (req: DiscoverEditorialShortRequest) =>
    request<DiscoverEnrichResult>('/discover/editorial-shorts', { method: 'POST', body: JSON.stringify(req) }),
  importDiscoverSocialLink: (req: DiscoverSocialLinkRequest) =>
    request<DiscoverSocialLinkResult>('/discover/social-links', { method: 'POST', body: JSON.stringify(req) }),
  watchDiscoverCard: (cardId: string, options: { watch?: boolean; saved?: boolean } = {}) =>
    request<DiscoverWatchResult>(`/discover/cards/${encodeURIComponent(cardId)}/watch`, {
      method: 'POST',
      body: JSON.stringify(options),
    }),

  // Trip room
  getTripFeed: (tripId: string) => request<TripFeedCard[]>(`/trips/${tripId}/feed`),
  getTripSchedule: (tripId: string) => request<TripScheduleItem[]>(`/trips/${tripId}/schedule`),
  getTripPlannerSuggestions: (tripId: string) =>
    request<TripPlannerSuggestion[]>(`/trips/${tripId}/planner/suggestions`),
  getTripVotes: (tripId: string) => request<TripVote[]>(`/trips/${tripId}/votes`),
  getTripActionItems: (tripId: string) => request<TripActionItem[]>(`/trips/${tripId}/action-items`),
  getTripPaymentSummary: (tripId: string) =>
    request<TripPaymentSummary>(`/trips/${tripId}/payments/summary`),
  getTripMedia: (tripId: string) => request<TripMediaResult>(`/trips/${tripId}/media`),
  getTripChatProvider: (tripId: string) => request<TripChatProvider>(`/trips/${tripId}/chat/provider`),
  getTripChatSuggestions: (tripId: string) =>
    request<TripChatSuggestion[]>(`/trips/${tripId}/chat/suggestions`),
  getTripMessages: (tripId: string) => request<TripMessage[]>(`/trips/${tripId}/messages`),
  getTripNotifications: (tripId: string) =>
    request<TripNotification[]>(`/trips/${tripId}/notifications`),
  respondToTripVote: (tripId: string, voteId: string, optionId: string) =>
    request<TripVote>(`/trips/${tripId}/votes/${voteId}/responses`, {
      method: 'POST',
      body: JSON.stringify({ optionId }),
    }),
  updateTripActionItem: (tripId: string, actionItemId: string, status: TripActionItemStatus) =>
    request<TripActionItem>(`/trips/${tripId}/action-items/${actionItemId}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  updateTripMediaApproval: (tripId: string, mediaId: string, action: TripMediaApprovalAction) =>
    request<TripMediaResult['items'][number]>(`/trips/${tripId}/media/${mediaId}/approval`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }),
  updateTripParticipation: (tripId: string, itemId: string, status: TripParticipationStatus) =>
    request<TripScheduleItem>(`/trips/${tripId}/schedule/${itemId}/participation`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  // Preview
  createPreviewJob: (req: CreatePreviewJobRequest) =>
    request<{ jobId: string }>('/preview-jobs', { method: 'POST', body: JSON.stringify(req) }),
  getPreviewJob: (jobId: string) => request<PreviewJob>(`/preview-jobs/${jobId}`),
  createPreviewVideo: (req: CreatePreviewVideoRequest) =>
    request<PreviewVideoJob>('/preview-videos', { method: 'POST', body: JSON.stringify(req) }),
  getPreviewVideo: (jobId: string) => request<PreviewVideoJob>(`/preview-videos/${jobId}`),

  // Consent
  submitConsent: (req: PreviewConsentRequest) =>
    request<PreviewConsentResult>('/consents/preview', { method: 'POST', body: JSON.stringify(req) }),

  // Reference Photos
  uploadReferencePhoto: (formData: FormData) =>
    requestMultipart<UploadReferencePhotoResponse>('/reference-photos', formData),
  listReferencePhotos: () =>
    request<ReferencePhoto[]>('/reference-photos'),
  deleteReferencePhoto: (photoId: string) =>
    request<{ deleted: boolean }>(`/reference-photos/${photoId}`, { method: 'DELETE' }),
};
