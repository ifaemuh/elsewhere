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
  /** Atomic received -> processing. True only for the one caller that made the change. */
  claimMessage(id: string): Promise<boolean>;
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
  /** Throws on a transient failure so the step retries; a duplicate (the trip already has one) is a no-op. */
  recordForwarded(tripId: string): Promise<void>;
  afterConfirmed(tripId: string, bookingIds: string[]): Promise<{ monitorSegmentIds: string[] }>;
}

/** A failure retrying cannot fix. The workflow turns it into a FatalError. The message is fixed text, never email content. */
export class PermanentIntakeError extends Error {}

export type FailureKind = 'unreadable' | 'save' | 'lookup';

export type IntakeResult =
  | { status: 'missing' }
  | { status: 'claimed_elsewhere' }
  | { status: 'failed'; reason: string; problems?: string[] }
  | { status: 'parsed' | 'needs_confirmation'; bookingIds: string[]; monitorSegmentIds: string[] };

/** Small enough to be a step result: no attachment bytes, no email body. */
export type ExtractOutcome =
  | { status: 'missing' }
  | { status: 'ready'; message: IntakeMessage; storagePath: string | null; bookings: NormalizedBooking[]; problems: string[] };
export type ReadyExtraction = Extract<ExtractOutcome, { status: 'ready' }>;

export interface PersistOutcome {
  bookingIds: string[];
  confirmedIds: string[];
  needsConfirmation: boolean;
}

async function plannerIds(deps: IntakeDeps, tripId: string): Promise<string[]> {
  const planner = (await deps.members(tripId)).find((member) => member.role === 'planner');
  return planner ? [planner.user_id] : [];
}

/** Step 0: take the message so no other run processes it. */
export async function claimPhase(messageId: string, deps: IntakeDeps): Promise<boolean> {
  return deps.claimMessage(messageId);
}

/** Step A: fetch and archive the message, then read it. The paid, nondeterministic part: it must not rerun on a later retry. */
export async function extractPhase(messageId: string, deps: IntakeDeps): Promise<ExtractOutcome> {
  const message = await deps.loadMessage(messageId);
  if (!message) return { status: 'missing' };

  let input: ExtractionInput;
  let storagePath = message.storagePath;
  const problems: string[] = [];
  if (message.source === 'email') {
    if (!message.providerMessageId) throw new PermanentIntakeError('missing provider message id');
    const email = await deps.loadEmail(message.providerMessageId);
    problems.push(...email.problems);
    storagePath = await deps.storeEmail(message, email);
    input = {
      text: email.text,
      html: email.html,
      images: email.attachments.filter((a) => a.contentType.startsWith('image/')).map((a) => ({ data: a.data, mediaType: a.contentType })),
      pdfs: email.attachments.filter((a) => a.contentType === 'application/pdf').map((a) => ({ data: a.data, mediaType: a.contentType })),
    };
  } else {
    if (!message.storagePath) throw new PermanentIntakeError('screenshot has no stored file');
    input = { text: null, html: null, images: [await deps.loadScreenshot(message.storagePath)], pdfs: [] };
  }

  const extracted = await deps.extract(input);
  return { status: 'ready', message, storagePath, bookings: extracted.bookings, problems: [...problems, ...extracted.problems] };
}

/** Step B: save the bookings, match passengers, ask the planner what is unclear, count the forwarded booking. Idempotent. */
export async function persistPhase(extraction: ReadyExtraction, deps: IntakeDeps): Promise<PersistOutcome> {
  const { message, bookings } = extraction;
  const members = await deps.members(message.tripId);
  const planner = members.find((member) => member.role === 'planner');
  const assignedTo = planner ? [planner.user_id] : [];

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
        assigned_user_ids: assignedTo,
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
        assigned_user_ids: assignedTo,
        source_kind: 'passenger_match',
        related_entity_id: bookingId,
      });
    }
  }
  if (createdAny) await deps.recordForwarded(message.tripId);
  return { bookingIds, confirmedIds, needsConfirmation };
}

/** Step C: resolve flights for the confirmed bookings, and only then mark the message done. Safe to retry. */
export async function confirmPhase(extraction: ReadyExtraction, persisted: PersistOutcome, deps: IntakeDeps): Promise<IntakeResult> {
  const { message, problems, storagePath } = extraction;
  const { monitorSegmentIds } =
    persisted.confirmedIds.length > 0 ? await deps.afterConfirmed(message.tripId, persisted.confirmedIds) : { monitorSegmentIds: [] };
  const status = persisted.needsConfirmation ? 'needs_confirmation' : 'parsed';
  await deps.setStatus(message.id, status, problems.length > 0 ? problems.join('; ') : null, storagePath);
  return { status, bookingIds: persisted.bookingIds, monitorSegmentIds };
}

/**
 * Terminal failure: the planner is told once, the message is marked failed, and the reason is fixed text
 * plus attachment problems, never email content. `lookup` is for a failure after the bookings were saved,
 * where "we couldn't read this" would be wrong.
 */
export async function failPhase(
  messageId: string,
  reason: string,
  problems: string[],
  deps: IntakeDeps,
  opts: { kind?: FailureKind; storagePath?: string | null } = {},
): Promise<IntakeResult> {
  const message = await deps.loadMessage(messageId);
  if (!message) return { status: 'missing' };
  const why = problems.length > 0 ? `: ${problems.join('; ')}` : '';
  const kind = opts.kind ?? 'unreadable';
  const subject = message.subject ?? 'a forwarded message';
  const note = problems.length > 0 ? ` ${problems.join('; ')}.` : '';
  const item =
    kind === 'lookup'
      ? { title: 'We couldn’t start flight tracking', detail: 'We saved your booking but couldn’t start flight tracking yet. We’ll retry; check the flight details.' }
      : kind === 'save'
        ? { title: 'We couldn’t finish saving a booking', detail: `We couldn’t finish saving the bookings from “${subject}”. Some may be saved; check the bookings page.${note}` }
        : { title: 'We couldn’t read a booking', detail: `We couldn’t find a booking in “${subject}”.${note} You can add it by hand on the bookings page.` };
  await deps.addActionItem({
    trip_id: message.tripId,
    kind: 'booking',
    ...item,
    assigned_user_ids: await plannerIds(deps, message.tripId),
    source_kind: 'booking_confirmation',
    related_entity_id: message.id,
  });
  await deps.setStatus(message.id, 'failed', `${reason[0].toUpperCase()}${reason.slice(1)}${why}`, opts.storagePath ?? message.storagePath);
  return { status: 'failed', reason, ...(problems.length > 0 ? { problems } : {}) };
}

/** The three phases in one process, for tests and scripts. The workflow runs them as separate steps. */
export async function processInboundMessage(messageId: string, deps: IntakeDeps): Promise<IntakeResult> {
  let extraction: ExtractOutcome;
  try {
    extraction = await extractPhase(messageId, deps);
  } catch (error) {
    if (!(error instanceof PermanentIntakeError)) throw error;
    return failPhase(messageId, error.message, [], deps);
  }
  if (extraction.status === 'missing') return extraction;
  if (extraction.bookings.length === 0) return failPhase(messageId, 'no booking found', extraction.problems, deps, { storagePath: extraction.storagePath });
  return confirmPhase(extraction, await persistPhase(extraction, deps), deps);
}
