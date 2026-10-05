'use server';

import { revalidatePath } from 'next/cache';
import { start } from 'workflow/api';
import { requireUser } from '@/lib/auth/user';
import { approveQuarantined } from '@/lib/intake/quarantine';
import { createClient } from '@/lib/supabase/server';
import { intakeWorkflow } from '@/workflows/intake';

export async function approveQuarantinedMail(tripId: string, messageId: string): Promise<void> {
  await requireUser(`/trips/${tripId}`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can approve forwarded mail.');
  // Planners read their own trip's inbound mail under RLS; a message from another trip is invisible here.
  const { data: message } = await supabase.from('inbound_messages').select('id').eq('id', messageId).eq('trip_id', tripId).maybeSingle();
  if (!message) throw new Error('That message is not on this trip.');
  // Guarded flip: a second click finds nothing quarantined and starts nothing.
  if (await approveQuarantined(messageId, tripId)) await start(intakeWorkflow, [messageId]);
  revalidatePath(`/trips/${tripId}`);
}
