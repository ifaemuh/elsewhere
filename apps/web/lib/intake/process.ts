import type { ExtractionInput } from './extract';
import type { InboundEmail } from './inbound-source';
import { CONFIDENCE_THRESHOLD, type NormalizedBooking } from './normalize';
import { matchPassengers } from './passengers';

export interface IntakeMessage {
  id: string;
  tripId: string;
  source: 'email' | 'screenshot';
  providerMessageId: string | null;
  storagePath: string | null;
  subject: string | null;
}

export interface NewActionItem {
  trip_id: string;
  kind: 'booking' | 'approval';
  title: string;
  detail: string;
  assigned_user_ids: string[];
  source_kind: 'booking_confirmation' | 'passenger_match';
  related_entity_id: string;
}

export interface IntakeDeps {
  loadMessage(id: string): Promise<IntakeMessage | null>;
  loadEmail(providerMessageId: string): Promise<InboundEmail>;
  storeEmail(message: IntakeMessage, email: InboundEmail): Promise<string>;
  loadScreenshot(storagePath: string): Promise<{ data: Uint8Array; mediaType: string }>;
  extract(input: ExtractionInput): Promise<{ bookings: NormalizedBooking[]; problems: string[] }>;
  members(tripId: string): Promise<{ id: string; user_id: string; display_name: string; role: 'planner' | 'member' }[]>;
  /**
   * `created` means "this message still has work to do on the booking": it was inserted now, or this same
   * message inserted it before a crash. A booking another message already saved is `created: false`.
   */
  saveBooking(message: IntakeMessage, booking: NormalizedBooking, opts: { confirmed: boolean }): Promise<{ bookingId: string; created: boolean }>;
  assignMembers(tripId: string, bookingId: string, memberIds: string[]): Promise<void>;
  addActionItem(item: NewActionItem): Promise<void>;
  setStatus(messageId: string, status: 'parsed' | 'needs_confirmation' | 'failed', error: string | null, storagePath: string | null): Promise<void>;
  recordForwarded(tripId: string): Promise<void>;
  afterConfirmed(tripId: string, bookingIds: string[]): Promise<{ monitorSegmentIds: string[] }>;
}

export type IntakeResult =
  | { status: 'missing' }
  | { status: 'failed'; reason: string; problems?: string[] }
  | { status: 'parsed' | 'needs_confirmation'; bookingIds: string[]; monitorSegmentIds: string[] };

export async function processInboundMessage(messageId: string, deps: IntakeDeps): Promise<IntakeResult> {
  const message = await deps.loadMessage(messageId);
  if (!message) return { status: 'missing' };
  const members = await deps.members(message.tripId);
  const planner = members.find((member) => member.role === 'planner');
  const plannerIds = planner ? [planner.user_id] : [];

  let input: ExtractionInput;
  let storagePath = message.storagePath;
  if (message.source === 'email') {
    if (!message.providerMessageId) {
      await deps.setStatus(message.id, 'failed', 'missing provider message id', null);
      return { status: 'failed', reason: 'missing provider message id' };
    }
    const email = await deps.loadEmail(message.providerMessageId);
    storagePath = await deps.storeEmail(message, email);
    input = {
      text: email.text,
      html: email.html,
      images: email.attachments.filter((a) => a.contentType.startsWith('image/')).map((a) => ({ data: a.data, mediaType: a.contentType })),
      pdfs: email.attachments.filter((a) => a.contentType === 'application/pdf').map((a) => ({ data: a.data, mediaType: a.contentType })),
    };
  } else {
    input = { text: null, html: null, images: [await deps.loadScreenshot(message.storagePath ?? '')], pdfs: [] };
  }

  const { bookings, problems } = await deps.extract(input);
  if (bookings.length === 0) {
    const why = problems.length > 0 ? `: ${problems.join('; ')}` : '';
    await deps.setStatus(message.id, 'failed', `No booking found${why}`, storagePath);
    await deps.addActionItem({
      trip_id: message.tripId,
      kind: 'booking',
      title: 'We couldn’t read a booking',
      detail: `We couldn’t find a booking in “${message.subject ?? 'a forwarded message'}”. ${problems.length > 0 ? ` ${problems.join('; ')}.` : ''} You can add it by hand on the bookings page.`,
      assigned_user_ids: plannerIds,
      source_kind: 'booking_confirmation',
      related_entity_id: message.id,
    });
    return { status: 'failed', reason: 'no booking found', ...(problems.length > 0 ? { problems } : {}) };
  }

  const bookingIds: string[] = [];
  const confirmedIds: string[] = [];
  let needsConfirmation = false;
  let createdAny = false;
  for (const booking of bookings) {
    const { matched, unmatched } = matchPassengers(booking.passengerNames, members);
    const unclear = booking.confidence < CONFIDENCE_THRESHOLD || booking.problems.length > 0;
    const confirmed = !unclear && unmatched.length === 0;
    const { bookingId, created } = await deps.saveBooking(message, booking, { confirmed });
    bookingIds.push(bookingId);
    if (!created) continue;
    createdAny = true;

    const memberIds = [...new Set(Object.values(matched))];
    if (memberIds.length > 0) await deps.assignMembers(message.tripId, bookingId, memberIds);
    if (confirmed) confirmedIds.push(bookingId);
    if (unclear) {
      needsConfirmation = true;
      await deps.addActionItem({
        trip_id: message.tripId,
        kind: 'booking',
        title: 'Confirm this booking',
        detail: `Check ${booking.provider}${booking.confirmationCode ? ` (${booking.confirmationCode})` : ''} before we watch it.${booking.problems.length ? ` ${booking.problems.join('; ')}.` : ''}`,
        assigned_user_ids: plannerIds,
        source_kind: 'booking_confirmation',
        related_entity_id: bookingId,
      });
    }
    if (unmatched.length > 0) {
      needsConfirmation = true;
      await deps.addActionItem({
        trip_id: message.tripId,
        kind: 'booking',
        title: 'Who is on this booking?',
        detail: `We couldn’t match ${unmatched.join(', ')} to anyone in the group. Pick who’s on ${booking.provider}.`,
        assigned_user_ids: plannerIds,
        source_kind: 'passenger_match',
        related_entity_id: bookingId,
      });
    }
  }

  const status = needsConfirmation ? 'needs_confirmation' : 'parsed';
  await deps.setStatus(message.id, status, problems.length > 0 ? problems.join('; ') : null, storagePath);
  if (createdAny) await deps.recordForwarded(message.tripId);
  const { monitorSegmentIds } = confirmedIds.length > 0 ? await deps.afterConfirmed(message.tripId, confirmedIds) : { monitorSegmentIds: [] };
  return { status, bookingIds, monitorSegmentIds };
}
