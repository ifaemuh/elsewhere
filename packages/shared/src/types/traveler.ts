export type PaymentState = 'pending' | 'paid' | 'overdue';

export interface Traveler {
  id: string;
  tripId: string;
  userId: string | null;
  name: string;
  paymentState: PaymentState;
  createdAt: string;
}
