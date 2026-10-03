import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { classify, type FlightSnapshot } from './snapshot';

function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/**
 * Opens an incident when the snapshot reveals a new event, then saves the snapshot. Safe to call twice with the
 * same data. `last_status` is written last and every write is checked: if anything fails first, the error
 * propagates and the next alert or poll classifies the same change again, so an event is never hidden behind a
 * snapshot that was already saved.
 */
export async function recordFlightSnapshot(segmentId: string, snapshot: FlightSnapshot, source: 'alert' | 'poll'): Promise<{ incidentId: string | null }> {
  const admin = createAdminClient();
  const { data: segment, error } = await admin.from('booking_segments').select('id, trip_id, booking_id, scheduled_out, last_status').eq('id', segmentId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!segment) return { incidentId: null };
  // scheduled_out is the departure as booked; a snapshot that moves it is a schedule change.
  const event = classify((segment.last_status as FlightSnapshot | null) ?? null, snapshot, segment.scheduled_out);

  let incidentId: string | null = null;
  if (event) {
    const { data: affected, error: affectedError } = await admin.from('booking_members').select('trip_members!inner(user_id)').eq('booking_id', segment.booking_id);
    if (affectedError) throw new Error(affectedError.message);
    const affectedUserIds = (affected ?? []).map((row) => {
      const member = Array.isArray(row.trip_members) ? row.trip_members[0] : row.trip_members;
      return member.user_id as string;
    });
    const { data: inserted, error: incidentError } = await admin
      .from('incidents')
      .upsert(
        {
          trip_id: segment.trip_id,
          segment_id: segmentId,
          event_type: event.type,
          delay_minutes: event.delayMinutes,
          dedupe_key: `${segmentId}:${event.dedupeSuffix}`,
          raw_payload: { ...snapshot, source },
          affected_user_ids: affectedUserIds,
        },
        { onConflict: 'dedupe_key', ignoreDuplicates: true },
      )
      .select('id');
    if (incidentError) throw new Error(incidentError.message);
    // Null when an earlier alert or poll already recorded this incident.
    incidentId = (inserted?.[0]?.id as string | undefined) ?? null;
    if (incidentId) {
      check(await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'detected', detail: { source, type: event.type, delay_minutes: event.delayMinutes } }));
    }
  }
  check(await admin.from('booking_segments').update({ last_status: snapshot, fa_flight_id: snapshot.faFlightId }).eq('id', segmentId));
  return { incidentId };
}
