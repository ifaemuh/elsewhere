export type TripStatus = 'draft' | 'booked' | 'in_progress' | 'completed' | 'canceled';

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
