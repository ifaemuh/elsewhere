import type { BookingFlowState } from '../types/trip';

export const BOOKING_TRANSITIONS: Record<BookingFlowState, BookingFlowState[]> = {
  idle: ['quote_created'],
  quote_created: ['reserving_inventory'],
  reserving_inventory: ['payment_pending', 'failed'],
  payment_pending: ['confirmed', 'failed'],
  confirmed: [],
  failed: ['rolled_back', 'quote_created'],
  rolled_back: ['idle'],
};

export function canTransition(from: BookingFlowState, to: BookingFlowState): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}
