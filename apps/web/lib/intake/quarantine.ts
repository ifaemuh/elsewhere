import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Moves a quarantined forwarded email back to `received` and closes its approval item. The planner's action
 * passes its trip id, so it can approve only its own trip's mail; /admin passes null. Returns true when the
 * message was quarantined and is now waiting, so the caller starts intake.
 */
export async function approveQuarantined(messageId: string, tripId: string | null): Promise<boolean> {
  const admin = createAdminClient();
  let update = admin.from('inbound_messages').update({ status: 'received' }).eq('id', messageId).eq('status', 'quarantined');
  if (tripId) update = update.eq('trip_id', tripId);
  const { data: message, error } = await update.select('id, trip_id').maybeSingle();
  if (error) throw new Error(error.message);
  const flipped = message !== null;
  let found = message;
  if (!found) {
    // Not quarantined (any more): if it is this trip's message, its approval item may be stuck open from an earlier
    // failed close, so close it again. Closing is idempotent and the caller still starts nothing.
    let lookup = admin.from('inbound_messages').select('id, trip_id').eq('id', messageId);
    if (tripId) lookup = lookup.eq('trip_id', tripId);
    const { data, error: lookupError } = await lookup.maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    found = data;
  }
  if (!found) return false;
  const { error: itemError } = await admin
    .from('action_items')
    .update({ status: 'done' })
    .eq('trip_id', found.trip_id)
    .eq('source_kind', 'inbound_quarantine')
    .eq('related_entity_id', messageId);
  // A failed close must not undo the approval or skip intake; the feed also hides items whose message is no longer quarantined.
  if (itemError) console.error('could not close the approval item', messageId, itemError.message);
  return flipped;
}
