import { SupabaseClient } from '@supabase/supabase-js';
import { type BookingFlowState, canTransition } from '@elsewhere/shared';

export class BookingEngineError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = 'BookingEngineError';
  }
}

export interface TransitionResult {
  tripId: string;
  previousState: BookingFlowState;
  newState: BookingFlowState;
}

export async function transitionBookingState(
  supabase: SupabaseClient,
  tripId: string,
  targetState: BookingFlowState,
  updates?: Record<string, unknown>,
): Promise<TransitionResult> {
  const { data: trip, error: fetchError } = await supabase
    .from('trips')
    .select('id, booking_flow_state, booking_flow_attempt_count')
    .eq('id', tripId)
    .single();

  if (fetchError || !trip) {
    throw new BookingEngineError('Trip not found', 'TRIP_NOT_FOUND');
  }

  const currentState = trip.booking_flow_state as BookingFlowState;

  if (!canTransition(currentState, targetState)) {
    throw new BookingEngineError(
      `Cannot transition from ${currentState} to ${targetState}`,
      'INVALID_TRANSITION',
    );
  }

  const isRetry = currentState === 'failed' && targetState === 'quote_created';
  const updatePayload: Record<string, unknown> = {
    booking_flow_state: targetState,
    booking_flow_updated_at: new Date().toISOString(),
    ...(isRetry ? { booking_flow_attempt_count: trip.booking_flow_attempt_count + 1 } : {}),
    ...(targetState === 'confirmed' ? { status: 'booked' } : {}),
    ...(targetState === 'rolled_back' ? { booking_flow_error: null } : {}),
    ...updates,
  };

  const { error: updateError } = await supabase
    .from('trips')
    .update(updatePayload)
    .eq('id', tripId);

  if (updateError) {
    throw new BookingEngineError(
      `Failed to update trip: ${updateError.message}`,
      'UPDATE_FAILED',
    );
  }

  return { tripId, previousState: currentState, newState: targetState };
}

export async function failBooking(
  supabase: SupabaseClient,
  tripId: string,
  errorMessage: string,
): Promise<TransitionResult> {
  return transitionBookingState(supabase, tripId, 'failed', {
    booking_flow_error: errorMessage,
  });
}
