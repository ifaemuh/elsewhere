import 'server-only';
import { onBookingsConfirmed } from '@/lib/bookings/confirm';
import { recordEvent } from '@/lib/funnel/events';
import { createAdminClient } from '@/lib/supabase/admin';
import { extractBookings } from './extract';
import { fetchInboundEmail } from './inbound-source';
import type { IntakeDeps } from './process';
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
    async loadMessage(id) {
      // A missing message is a normal outcome ({ status: 'missing' }), so this read does not use must().
      const { data: row, error } = await admin.from('inbound_messages').select('id, trip_id, source, provider_message_id, storage_path, subject').eq('id', id).maybeSingle();
      if (error) throw new Error(error.message);
      return row
        ? { id: row.id, tripId: row.trip_id, source: row.source, providerMessageId: row.provider_message_id, storagePath: row.storage_path, subject: row.subject }
        : null;
    },
    loadEmail: fetchInboundEmail,
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
    extract: (input) => extractBookings(input),
    async members(tripId) {
      return must(await admin.from('trip_members').select('id, user_id, display_name, role').eq('trip_id', tripId));
    },
    async saveBooking(message, booking, { confirmed }) {
      const inserted = must(
        await admin
          .from('bookings')
          .upsert(
            {
              trip_id: message.tripId,
              inbound_message_id: message.id,
              kind: booking.kind,
              provider: booking.provider,
              confirmation_code: booking.confirmationCode,
              booked_via: booking.bookedVia,
              booked_at: booking.bookedAt,
              passenger_names: booking.passengerNames,
              extraction_confidence: Math.round(booking.confidence * 100) / 100,
              dedupe_key: booking.dedupeKey,
              confirmed_at: confirmed ? new Date().toISOString() : null,
            },
            { onConflict: 'trip_id,dedupe_key', ignoreDuplicates: true },
          )
          .select('id'),
      );
      // A booking this same message saved before a crash is a retry: finish it (segments, passengers, items).
      // One that another message saved is a duplicate, and is left alone.
      let bookingId: string;
      if (inserted.length === 0) {
        const existing = must(
          await admin.from('bookings').select('id, inbound_message_id').eq('trip_id', message.tripId).eq('dedupe_key', booking.dedupeKey).single(),
        );
        if (existing.inbound_message_id !== message.id) return { bookingId: existing.id, created: false };
        bookingId = existing.id;
      } else {
        bookingId = inserted[0].id as string;
      }
      if (booking.segments.length > 0) {
        check(
          await admin.from('booking_segments').upsert(
            booking.segments.map((segment, index) => ({
              booking_id: bookingId,
              trip_id: message.tripId,
              position: index + 1,
              carrier_iata: segment.carrierIata,
              flight_number: segment.flightNumber,
              origin_iata: segment.originIata,
              destination_iata: segment.destinationIata,
              departure_local: segment.departureLocal,
              arrival_local: segment.arrivalLocal,
            })),
            { onConflict: 'booking_id,position', ignoreDuplicates: true },
          ),
        );
      }
      return { bookingId, created: true };
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
      await recordEvent({ anonymousId: trip.created_anonymous_id, event: 'booking_forwarded', tripId, utm: trip.created_utm as Record<string, string> });
    },
    afterConfirmed: onBookingsConfirmed,
  };
}
