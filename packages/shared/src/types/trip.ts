export type TripStatus = 'draft' | 'booked' | 'in_progress' | 'completed' | 'canceled';
export type TripSource = 'elsewhere_booked' | 'imported_booking' | 'photo_library_inferred' | 'manual';
export type TripCoverMediaType = 'photo' | 'video';
export type PhotoLibraryTripApprovalStatus =
  | 'private_candidate'
  | 'added_to_trips'
  | 'approved_for_discover'
  | 'approved_for_recap'
  | 'rejected';

export type BookingFlowState =
  | 'idle'
  | 'quote_created'
  | 'reserving_inventory'
  | 'payment_pending'
  | 'confirmed'
  | 'failed'
  | 'rolled_back';

export interface Trip {
  id: string;
  ownerId: string;
  destinationId: string;
  status: TripStatus;
  source?: TripSource;
  travelerCount: number;
  totalCost: number | null;
  startDate: string | null;
  endDate: string | null;
  bookingFlowState: BookingFlowState;
  bookingFlowAttemptCount: number;
  bookingFlowError: string | null;
  bookingFlowCheckoutUrl: string | null;
  bookingFlowUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TripCoverMedia {
  id: string;
  localAssetId: string | null;
  uri: string;
  mediaType: TripCoverMediaType;
  capturedAt: string | null;
  width: number | null;
  height: number | null;
}

export interface PhotoLibraryTripCluster {
  id: string;
  title: string;
  tagline: string;
  destinationName: string;
  destinationCountry: string;
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  centerLatitude: number | null;
  centerLongitude: number | null;
  confidence: 'low' | 'medium' | 'high';
  mediaCount: number;
  photoCount: number;
  videoCount: number;
  localAssetIds: string[];
  coverMedia: TripCoverMedia[];
  approvalStatus: PhotoLibraryTripApprovalStatus;
  privacyLabel: string;
  createdAt: string;
}

export interface PhotoMemoryTrip {
  id: string;
  source: 'photo_library_inferred';
  clusterId: string;
  title: string;
  tagline: string;
  destinationName: string;
  destinationCountry: string;
  status: 'completed';
  travelerCount: number;
  dateRangeLabel: string;
  startDate: string;
  endDate: string;
  mediaCount: number;
  photoCount: number;
  videoCount: number;
  coverMedia: TripCoverMedia[];
  privacyLabel: string;
  approvalStatus: PhotoLibraryTripApprovalStatus;
  discoverPrompt: string;
  recapPrompt: string;
}

export interface TripQuoteRequest {
  destinationId: string;
  travelerCount: number;
}

export interface TripQuote {
  id: string;
  tripId: string;
  total: number;
  currencyCode: string;
  expiresAt: string;
  createdAt: string;
}

export interface CheckoutRequest {
  tripId: string;
  financingOfferId?: string;
}

export interface CheckoutSession {
  checkoutUrl: string;
  sessionId: string;
}

export type MessageAuthorType = 'traveler' | 'system';

export interface TripRoomMessage {
  id: string;
  tripId: string;
  authorId: string | null;
  authorName: string;
  authorType: MessageAuthorType;
  text: string;
  createdAt: string;
}
