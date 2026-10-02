import 'server-only';
import { AeroApiError, aeroApi } from '@/lib/flights/aeroapi';
import { resolveSegment } from '@/lib/flights/resolve';
import { runDocumentChecks } from '@/lib/documents/service';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Runs whenever bookings become confirmed: by the planner, by high-confidence intake, or by manual entry.
 * Returns the segment ids the caller should start monitoring (Task 9 fills this in).
 *
 * AeroAPI bills per call: resolved segments (scheduled_out set) are skipped, and so are segments whose
 * flight-not-found item is still open or snoozed. That is at most one lookup per planner action; marking
 * the item done without fixing the flight triggers one more lookup, which reopens it.
 * If AeroAPI fails with a retryable error, the other segments are still processed and the first error is
 * rethrown afterwards for the caller to retry; only the failed segments are looked up again.
 */
export async function onBookingsConfirmed(tripId: string, bookingIds: string[]): Promise<{ monitorSegmentIds: string[] }> {
  if (bookingIds.length === 0) return { monitorSegmentIds: [] };
  try {
    return await resolveConfirmedSegments(tripId, bookingIds);
  } finally {
    // Bookings changed, so passengers and flights may have too. Runs on every exit, and never masks the flight result or error.
    try {
      await runDocumentChecks(tripId);
    } catch (e) {
      console.error('confirm: document checks failed', e instanceof Error ? e.message : 'unknown');
    }
  }
}

async function resolveConfirmedSegments(tripId: string, bookingIds: string[]): Promise<{ monitorSegmentIds: string[] }> {
  const admin = createAdminClient();
  const { data: found, error } = await admin
    .from('booking_segments')
    .select('id, booking_id, carrier_iata, flight_number, origin_iata, destination_iata, departure_local, scheduled_out')
    .in('booking_id', bookingIds)
    .is('scheduled_out', null);
  if (error) throw new Error(error.message);
  if (!found || found.length === 0) return { monitorSegmentIds: [] };

  const { data: flagged, error: flaggedError } = await admin
    .from('action_items')
    .select('related_entity_id')
    .eq('trip_id', tripId)
    .eq('source_kind', 'flight_not_found')
    .in('status', ['open', 'snoozed'])
    .in('related_entity_id', found.map((s) => s.id));
  if (flaggedError) throw new Error(flaggedError.message);
  const alreadyFlagged = new Set((flagged ?? []).map((i) => i.related_entity_id));
  const segments = found.filter((s) => !alreadyFlagged.has(s.id));
  if (segments.length === 0) return { monitorSegmentIds: [] };

  const api = await aeroApi();
  const { data: planner } = await admin.from('trip_members').select('user_id').eq('trip_id', tripId).eq('role', 'planner').single();
  let firstFailure: AeroApiError | null = null;
  for (const segment of segments) {
    let resolution;
    try {
      resolution = await resolveSegment(
        { id: segment.id, carrierIata: segment.carrier_iata, flightNumber: segment.flight_number, originIata: segment.origin_iata, destinationIata: segment.destination_iata, departureLocal: segment.departure_local },
        api,
      );
    } catch (e) {
      if (!(e instanceof AeroApiError)) throw e;
      firstFailure ??= e;
      continue;
    }
    if (resolution.kind === 'not_found') {
      // Reopens a done item, so a planner who dismisses it without fixing the flight sees it again.
      const { error: itemError } = await admin.from('action_items').upsert(
        {
          trip_id: tripId,
          kind: 'booking',
          title: 'Check this flight number',
          detail: `We couldn’t find ${segment.carrier_iata} ${segment.flight_number} from ${segment.origin_iata} on ${segment.departure_local.slice(0, 10)}. Check the flight number and date.`,
          assigned_user_ids: planner ? [planner.user_id] : [],
          status: 'open',
          source_kind: 'flight_not_found',
          related_entity_id: segment.id,
        },
        { onConflict: 'trip_id,source_kind,related_entity_id,title' },
      );
      if (itemError) throw new Error(itemError.message);
      continue;
    }
    // Guarded so overlapping runs cannot overwrite a segment another run already resolved.
    const { error: updateError } = await admin
      .from('booking_segments')
      .update({
        scheduled_out: resolution.scheduledOut,
        scheduled_in: resolution.scheduledIn,
        origin_country: resolution.originCountry,
        destination_country: resolution.destinationCountry,
        distance_km: resolution.distanceKm,
      })
      .eq('id', segment.id)
      .is('scheduled_out', null);
    if (updateError) throw new Error(updateError.message);
  }
  if (firstFailure) throw firstFailure;
  return { monitorSegmentIds: [] };
}
