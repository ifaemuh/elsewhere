export type FinancingProvider = 'uplift' | 'klarna' | 'affirm' | 'unknown';
export type InstallmentStatus = 'pending' | 'paid' | 'late';

export interface FinancingOffer {
  id: string;
  tripId: string;
  providerName: FinancingProvider;
  months: number;
  aprPercent: number;
  monthlyAmount: number;
  createdAt: string;
}

export interface FinancingOfferRequest {
  tripId: string;
  totalAmount: number;
  travelerCount: number;
}

export interface FinancingCheckoutRequest {
  offerId: string;
  tripId: string;
  totalAmount: number;
  travelerCount: number;
  policyVersion: string;
  idempotencyKey: string;
}

export interface FinancingCheckoutResult {
  id: string;
  checkoutId: string;
  providerName: FinancingProvider;
  providerReference: string | null;
  status: string;
  idempotencyKey: string;
  policyVersion: string;
  createdAt: string;
}

export interface WalletInstallment {
  id: string;
  tripId: string;
  travelerId: string;
  referenceKey: string | null;
  dueDate: string;
  amount: number;
  status: InstallmentStatus;
  createdAt: string;
  updatedAt: string;
}

export type FinancingEventType = 'payment_posted' | 'payment_late' | 'payment_pending';

export interface FinancingStatusEvent {
  id: string;
  installmentId: string;
  eventType: FinancingEventType;
  occurredAt: string;
  createdAt: string;
}

export interface FinancingDisclosureRecord {
  id: string;
  tripId: string;
  userId: string;
  acceptedAt: string;
  policyVersion: string;
  termsSummary: string;
}
