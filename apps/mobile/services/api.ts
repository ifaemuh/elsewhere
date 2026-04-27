import type {
  Destination,
  Trip,
  TripQuote,
  TripQuoteRequest,
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
  PreviewJob,
  CreatePreviewJobRequest,
  PreviewConsentRequest,
  PreviewConsentResult,
  ReferencePhoto,
  UploadReferencePhotoResponse,
} from '@elsewhere/shared';
import { useAuthStore } from '@/stores/auth';

// On a real device, this must be the dev machine's LAN IP (e.g. http://192.168.1.x:3002),
// not localhost. Override via EXPO_PUBLIC_API_URL in .env.
const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3002';

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
    throw new Error(body.message ?? `API error: ${res.status}`);
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
    throw new Error(body.message ?? `API error: ${res.status}`);
  }

  return res.json();
}

export const api = {
  // Destinations
  getFeaturedDestinations: () => request<Destination[]>('/destinations'),

  // Trips
  listTrips: () => request<Trip[]>('/trips'),
  getTrip: (id: string) => request<Trip>(`/trips/${id}`),
  quoteTrip: (req: TripQuoteRequest) =>
    request<TripQuote>('/trips/quote', { method: 'POST', body: JSON.stringify(req) }),
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

  // Preview
  createPreviewJob: (req: CreatePreviewJobRequest) =>
    request<{ jobId: string }>('/preview-jobs', { method: 'POST', body: JSON.stringify(req) }),
  getPreviewJob: (jobId: string) => request<PreviewJob>(`/preview-jobs/${jobId}`),

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
