import 'server-only';
import { NoObjectGeneratedError, NoOutputGeneratedError, TypeValidationError } from 'ai';
import { onBookingsConfirmed } from '@/lib/bookings/confirm';
import { recordEventStrict } from '@/lib/funnel/events';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractBookings } from './extract';
import { fetchInboundEmail, InboundSourceError } from './inbound-source';
import { PermanentIntakeError, type IntakeDeps } from './process';
import { getInbound, putInbound } from './storage';

/** Throws on a PostgREST error. For writes that return no rows. */
function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/** Throws on a PostgREST error or a missing row, so callers always get data. */
function must<T>(result: { data: T; error: { message: string } | null }): NonNullable<T> {
  check(result);
  if (result.data === null || result.data === undefined) throw new Error('expected a row, got none');
  return result.data as NonNullable<T>;
}

export function liveIntakeDeps(): IntakeDeps {
  const admin = createAdminClient();
  return {
    async claimMessage(id, runId) {
      // One conditional UPDATE is the lock: the run that flips received -> processing gets a row back, and so does
      // the same run if a step retry claims again after the first claim committed but its result was lost.
      const { data, error } = await admin.from('inbound_messages').update({ status: 'processing', claimed_by: runId })
        .eq('id', id)
        .or(`status.eq.received,and(status.eq.processing,claimed_by.eq.${runId})`)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },
    async loadMessage(id) {
      // A missing message is a normal outcome ({ status: 'missing' }), so this read does not use must().
      const { data: row, error } = await admin.from('inbound_messages').select('id, trip_id, source, provider_message_id, storage_path, subject').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return row
        ? { id: row.id, tripId: row.trip_id, source: row.source, providerMessageId: row.provider_message_id, storagePath: row.storage_path, subject: row.subject }
        : null;
    },
    async loadEmail(providerMessageId) {
      try {
        return await fetchInboundEmail(providerMessageId);
      } catch (error) {
        if (error instanceof InboundSourceError) throw new PermanentIntakeError(error.message);
        throw error;
      }
    },
    async storeEmail(message, email) {
      const base = `${message.tripId}/${message.id}`;
      await putInbound(`${base}/email.json`, JSON.stringify({ from: email.from, subject: email.subject, text: email.text, html: email.html }), 'application/json');
      for (const [index, attachment] of email.attachments.entries()) {
        await putInbound(`${base}/${index}-${(attachment.filename ?? 'attachment').replace(/[^\w.-]/g, '_')}`, attachment.data, attachment.contentType);
      }
      return `${base}/email.json`;
    },
    async loadScreenshot(storagePath) {
      const mediaType = storagePath.endsWith('.png') ? 'image/png' : storagePath.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
      return { data: await getInbound(storagePath), mediaType };
    },
    async extract(input) {
      try {
        return await extractBookings(input);
      } catch (error) {
        // The model's output failed the schema: asking again will not make the email readable.
        if (NoObjectGeneratedError.isInstance(error) || NoOutputGeneratedError.isInstance(error) || TypeValidationError.isInstance(error)) {
          throw new PermanentIntakeError('the model could not read this message');
        }
        throw error;
      }
    },
    async members(tripId) {
      return must(await admin.from('trip_members').select('id, user_id, display_name, role').eq('trip_id', tripId));
    },
    async saveBooking(message, booking, { confirmed }) {
      // One transaction in save_booking: the booking and its segments land together or not at all.
      const rows = must(
        await admin.rpc('save_booking', {
          p_trip_id: message.tripId,
          p_message_id: message.id,
          p_booking: {
            kind: booking.kind,
            provider: booking.provider,
            confirmation_code: booking.confirmationCode,
            booked_via: booking.bookedVia,
            booked_at: booking.bookedAt,
            passenger_names: booking.passengerNames,
            confidence: booking.confidence,
            dedupe_key: booking.dedupeKey,
            segments: booking.segments.map((segment) => ({
              carrier_iata: segment.carrierIata,
              flight_number: segment.flightNumber,
              origin_iata: segment.originIata,
              destination_iata: segment.destinationIata,
              departure_local: segment.departureLocal,
              arrival_local: segment.arrivalLocal,
            })),
          },
          p_confirmed: confirmed,
        }),
      );
      const row = (rows as { out_booking_id: string; out_created: boolean }[])[0];
      return { bookingId: row.out_booking_id, created: row.out_created };
    },
    async assignMembers(tripId, bookingId, memberIds) {
      check(
        await admin
          .from('booking_members')
          .upsert(memberIds.map((memberId) => ({ booking_id: bookingId, member_id: memberId, trip_id: tripId })), { ignoreDuplicates: true }),
      );
    },
    async addActionItem(item) {
      check(await admin.from('action_items').upsert(item, { onConflict: 'trip_id,source_kind,related_entity_id,title', ignoreDuplicates: true }));
    },
    async setStatus(messageId, status, error, storagePath) {
      check(await admin.from('inbound_messages').update({ status, error, storage_path: storagePath }).eq('id', messageId));
    },
    async recordForwarded(tripId) {
      const trip = must(await admin.from('trips').select('created_anonymous_id, created_utm').eq('id', tripId).single());
      if (!trip.created_anonymous_id) return;
      // Every email that adds a booking lands here. funnel_forwarded_trip_idx keeps the first, and recordEvent
      // treats the duplicate as a no-op, so the funnel counts trips, not emails.
      await recordEventStrict({ anonymousId: trip.created_anonymous_id, event: 'booking_forwarded', tripId, utm: trip.created_utm as Record<string, string> });
    },
    afterConfirmed: onBookingsConfirmed,
  };
}
