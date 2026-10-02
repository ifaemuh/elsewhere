'use server';

import { revalidatePath } from 'next/cache';
import { start } from 'workflow/api';
import { requireUser } from '@/lib/auth/user';
import { onBookingsConfirmed } from '@/lib/bookings/confirm';
import { parseManualFlight } from '@/lib/bookings/manual';
import { validateScreenshot } from '@/lib/bookings/screenshot';
import { putInbound } from '@/lib/intake/storage';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { intakeWorkflow } from '@/workflows/intake';
import { segmentMonitorWorkflow } from '@/workflows/segment-monitor';

// Server-action arguments come from the client. Every action checks the caller's role on tripId through the
// user-scoped client before any write, and every target row must belong to that trip.
async function memberClient(tripId: string) {
  const user = await requireUser(`/trips/${tripId}/bookings`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: tripId });
  if (isMember !== true) throw new Error('You are not on this trip.');
  return { user, supabase };
}

async function plannerClient(tripId: string) {
  await requireUser(`/trips/${tripId}/bookings`);
  const supabase = await createClient();
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  if (isPlanner !== true) throw new Error('Only the planner can do that.');
  return supabase;
}

async function afterConfirm(tripId: string, bookingIds: string[]) {
  const { monitorSegmentIds } = await onBookingsConfirmed(tripId, bookingIds);
  for (const segmentId of monitorSegmentIds) await start(segmentMonitorWorkflow, [segmentId]);
}

export async function confirmBooking(tripId: string, bookingId: string): Promise<void> {
  const supabase = await plannerClient(tripId);
  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ confirmed_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('trip_id', tripId)
    .select('id');
  if (error) throw new Error(error.message);
  if (!updated || updated.length === 0) throw new Error('That booking is not on this trip.');
  await supabase.from('action_items').update({ status: 'done' }).eq('trip_id', tripId).eq('related_entity_id', bookingId);
  await afterConfirm(tripId, [bookingId]);
  revalidatePath(`/trips/${tripId}/bookings`);
}

export async function toggleAssignment(tripId: string, bookingId: string, memberId: string, on: boolean): Promise<void> {
  const { user, supabase } = await memberClient(tripId);
  const { data: isPlanner } = await supabase.rpc('is_trip_planner', { p_trip_id: tripId });
  const { data: booking } = await supabase.from('bookings').select('id').eq('id', bookingId).eq('trip_id', tripId).maybeSingle();
  if (!booking) throw new Error('That booking is not on this trip.');
  const { data: target } = await supabase.from('trip_members').select('id, user_id').eq('id', memberId).eq('trip_id', tripId).maybeSingle();
  if (!target) throw new Error('That person is not on this trip.');
  if (isPlanner !== true && target.user_id !== user.id) throw new Error('You can only change your own place on a booking.');

  if (on && isPlanner !== true) {
    // C1's RLS keeps booking_members inserts planner-only, so a member goes through claim_booking_seat,
    // which adds the caller's own member row on a trip they belong to.
    const { error } = await supabase.rpc('claim_booking_seat', { p_booking_id: bookingId });
    if (error) throw new Error(error.message);
  } else {
    // RLS lets the planner add or remove anyone, and a member remove only themselves.
    const { error } = on
      ? await supabase.from('booking_members').insert({ booking_id: bookingId, member_id: memberId, trip_id: tripId })
      : await supabase.from('booking_members').delete().eq('booking_id', bookingId).eq('member_id', memberId).eq('trip_id', tripId);
    if (error && error.code !== '23505') throw new Error(error.message);
  }
  revalidatePath(`/trips/${tripId}/bookings`);
}

export interface FormState {
  error: string | null;
  done: boolean;
}

export async function addManualFlight(tripId: string, _prev: FormState, form: FormData): Promise<FormState> {
  let supabase;
  try {
    supabase = await plannerClient(tripId);
  } catch {
    return { error: 'Only the planner can add a flight.', done: false };
  }
  const parsed = parseManualFlight(form);
  if (!parsed.success) return { error: parsed.error, done: false };
  const f = parsed.data;
  // Alerts go only to the people on a booking, so a hand-added flight needs at least one traveler.
  const { data: members } = await supabase.from('trip_members').select('id').eq('trip_id', tripId);
  const memberIds = new Set((members ?? []).map((m) => m.id as string));
  const travelers = [...new Set(form.getAll('travelers').map(String))].filter((memberId) => memberIds.has(memberId));
  if (travelers.length === 0) return { error: 'Pick who is on this flight.', done: false };
  const admin = createAdminClient();
  const { data: booking, error } = await admin
    .from('bookings')
    .insert({
      trip_id: tripId,
      kind: 'flight',
      provider: f.carrierIata,
      confirmation_code: f.confirmationCode,
      extraction_confidence: 1,
      dedupe_key: `${f.confirmationCode ?? 'MANUAL'}|${f.carrierIata}${f.flightNumber}@${f.departureLocal.slice(0, 10)}`,
      confirmed_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) return { error: error.code === '23505' ? 'That flight is already on the trip.' : 'We could not add that flight.', done: false };
  const { error: segmentError } = await admin.from('booking_segments').insert({
    booking_id: booking.id,
    trip_id: tripId,
    position: 1,
    carrier_iata: f.carrierIata,
    flight_number: f.flightNumber,
    origin_iata: f.originIata,
    destination_iata: f.destinationIata,
    departure_local: f.departureLocal,
  });
  const { error: assignError } = segmentError
    ? { error: segmentError }
    : await admin.from('booking_members').insert(travelers.map((memberId) => ({ booking_id: booking.id, member_id: memberId, trip_id: tripId })));
  if (assignError) {
    // Leave nothing half-added: the segment and the travelers cascade with the booking.
    await admin.from('bookings').delete().eq('id', booking.id);
    return { error: 'We could not add that flight.', done: false };
  }
  await afterConfirm(tripId, [booking.id]);
  revalidatePath(`/trips/${tripId}/bookings`);
  return { error: null, done: true };
}

/**
 * Planner-only fix for a flight AeroAPI could not find. Order matters: the item is closed before
 * onBookingsConfirmed runs, because that skips any segment that still has an open or snoozed
 * flight_not_found item. If the flight still is not found, it reopens the item.
 */
export async function correctFlight(tripId: string, segmentId: string, _prev: FormState, form: FormData): Promise<FormState> {
  let supabase;
  try {
    supabase = await plannerClient(tripId);
  } catch {
    return { error: 'Only the planner can correct a flight.', done: false };
  }
  const parsed = parseManualFlight(form);
  if (!parsed.success) return { error: parsed.error, done: false };
  const f = parsed.data;

  const { data: segment } = await supabase.from('booking_segments').select('id, booking_id').eq('id', segmentId).eq('trip_id', tripId).maybeSingle();
  if (!segment) return { error: 'That flight is not on this trip.', done: false };
  const { data: items, error: itemsError } = await supabase
    .from('action_items')
    .select('id')
    .eq('trip_id', tripId)
    .eq('source_kind', 'flight_not_found')
    .eq('related_entity_id', segmentId)
    .in('status', ['open', 'snoozed']);
  if (itemsError) return { error: 'We could not check that flight. Try again.', done: false };
  if (!items || items.length === 0) return { error: 'That flight does not need a correction.', done: false };

  // Members cannot update segments under RLS, so the write uses the service role, after the checks above.
  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from('booking_segments')
    .update({
      carrier_iata: f.carrierIata,
      flight_number: f.flightNumber,
      origin_iata: f.originIata,
      destination_iata: f.destinationIata,
      departure_local: f.departureLocal,
      scheduled_out: null,
      scheduled_in: null,
      arrival_local: null,
      origin_country: null,
      destination_country: null,
      distance_km: null,
      fa_flight_id: null,
      last_status: null,
    })
    .eq('id', segmentId)
    .eq('trip_id', tripId);
  if (updateError) return { error: 'We could not save that correction.', done: false };

  const closeItem = (status: 'done' | 'open') =>
    admin
      .from('action_items')
      .update({ status })
      .eq('trip_id', tripId)
      .eq('source_kind', 'flight_not_found')
      .eq('related_entity_id', segmentId);
  const { error: closeError } = await closeItem('done');
  if (closeError) return { error: 'We saved the correction but could not close the reminder. Try again.', done: false };

  try {
    await afterConfirm(tripId, [segment.booking_id as string]);
  } catch {
    // A flight lookup failed after the item was closed. Reopen it so the planner can try again.
    await closeItem('open');
    return { error: 'We saved the correction but could not look the flight up yet. Try again in a minute.', done: false };
  }
  revalidatePath(`/trips/${tripId}/bookings`);
  return { error: null, done: true };
}

export async function uploadScreenshot(tripId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const user = await requireUser(`/trips/${tripId}/bookings`);
  const supabase = await createClient();
  const { data: isMember } = await supabase.rpc('is_trip_member', { p_trip_id: tripId });
  if (isMember !== true) return { error: 'Join the trip first.', done: false };
  const file = form.get('screenshot');
  if (!(file instanceof File)) return { error: 'Choose a screenshot.', done: false };
  const check = validateScreenshot(file);
  if (!check.ok) return { error: check.error, done: false };
  const objectPath = await putInbound(`${tripId}/screenshots/${crypto.randomUUID()}.${check.ext}`, new Uint8Array(await file.arrayBuffer()), file.type);
  const { data: message, error } = await createAdminClient()
    .from('inbound_messages')
    .insert({ trip_id: tripId, source: 'screenshot', sender: user.email, subject: file.name, storage_path: objectPath, status: 'received' })
    .select('id')
    .single();
  if (error) return { error: 'We could not take that screenshot.', done: false };
  await start(intakeWorkflow, [message.id]);
  return { error: null, done: true };
}
