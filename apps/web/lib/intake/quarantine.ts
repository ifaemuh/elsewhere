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
  if (!message) return false;
  const { error: itemError } = await admin
    .from('action_items')
    .update({ status: 'done' })
    .eq('trip_id', message.trip_id)
    .eq('source_kind', 'inbound_quarantine')
    .eq('related_entity_id', messageId);
  // The message is already approved; a stale card is better than leaving it approved with intake never started.
  if (itemError) console.error('could not close the approval item', messageId, itemError.message);
  return true;
}
