import 'server-only';
import type { Primitive } from '@elsewhere/rules/core';
import { appUrl } from '@/lib/env';
import { aeroApi } from '@/lib/flights/aeroapi';
import { incidentAlert, incidentNotice, questionNotice, reviewHoldNotice } from '@/lib/notify/templates';
import { queueNotifications } from '@/lib/notify/queue';
import { getLibrary } from '@/lib/rules/library';
import { createAdminClient } from '@/lib/supabase/admin';
import { assess, summarizeEvent, type Assessment, type LegRow } from './assess';
import { generatePlaybook } from './playbook';
import { answerValue, PlannerAnswerError, type PlannerAnswer, type PlannerQuestion } from './questions';

const LEG = 'carrier_iata, operator_iata, origin_iata, destination_iata, origin_country, destination_country, scheduled_out, scheduled_in';

function check(result: { error: { message: string } | null }): void {
  if (result.error) throw new Error(result.error.message);
}

/** PostgREST returns a to-one embed as an object or, depending on the relationship, a one-element array. */
function first<T>(embedded: T | T[] | null | undefined): T | undefined {
  return Array.isArray(embedded) ? embedded[0] : (embedded ?? undefined);
}

async function loadIncident(incidentId: string) {
  const admin = createAdminClient();
  const { data: incident, error } = await admin
    .from('incidents')
    .select('id, trip_id, segment_id, event_type, delay_minutes, detected_at, facts, raw_payload, previous_status, previous_status_at, affected_user_ids, trips!inner(name, pass_status)')
    .eq('id', incidentId)
    .single();
  if (error) throw new Error(`incident ${incidentId} could not be read: ${error.message}`);
  if (!incident) throw new Error(`incident ${incidentId} not found`);
  // last_status is AeroAPI's latest snapshot of the flight; raw_payload (above) is the one that raised the incident.
  const { data: segment, error: segmentError } = await admin
    .from('booking_segments')
    .select(`booking_id, flight_number, departure_local, distance_km, last_status, last_status_at, ${LEG}`)
    .eq('id', incident.segment_id)
    .single();
  if (segmentError) throw new Error(`segment of incident ${incidentId} could not be read: ${segmentError.message}`);
  if (!segment) throw new Error(`segment of incident ${incidentId} not found`);
  // The itinerary and journey facts need every flight on the booking, with its airports, countries, and scheduled times.
  const { data: booking, error: bookingError } = await admin.from('bookings').select('booked_via, booked_at, confirmation_code').eq('id', segment.booking_id).single();
  if (bookingError) throw new Error(bookingError.message);
  const { data: legs, error: legsError } = await admin.from('booking_segments').select(LEG).eq('booking_id', segment.booking_id).order('position');
  if (legsError) throw new Error(legsError.message);
  // A forwarded rebooking is saved as its own booking (Task 5 dedupes on the code plus the flights), and an airline
  // keeps the record locator when it rebooks. So the offered re-routings are the trip's other bookings with this code.
  let offers: LegRow[][] = [];
  if (booking?.confirmation_code) {
    const { data: rebookings, error: rebookingsError } = await admin
      .from('bookings')
      .select(`id, booking_segments(position, ${LEG})`)
      .eq('trip_id', incident.trip_id)
      .eq('confirmation_code', booking.confirmation_code)
      .neq('id', segment.booking_id);
    if (rebookingsError) throw new Error(rebookingsError.message);
    offers = (rebookings ?? []).map((b) =>
      [...(b.booking_segments as (LegRow & { position: number })[])].sort((x, y) => x.position - y.position).map(({ position: _position, ...row }) => row),
    );
  }
  // Coordinates for the journey's great-circle distance. A failed lookup only leaves flight.distance_km unset.
  const codes = [...new Set((legs ?? []).flatMap((l) => [l.origin_iata, l.destination_iata]))];
  const airports: Record<string, { latitude: number; longitude: number }> = {};
  try {
    const api = await aeroApi();
    const found = await Promise.all(codes.map(async (code) => [code, await api.airport(code).catch(() => null)] as const));
    for (const [code, a] of found) if (a?.latitude != null && a.longitude != null) airports[code] = { latitude: a.latitude, longitude: a.longitude };
  } catch (e) {
    // No AeroAPI configured or reachable: the assessment still runs, without the journey distance.
    console.error('airport lookup skipped', e instanceof Error ? e.message : 'unknown');
  }
  // Asking is recorded as an event, so a question that was asked (and answered, or timed out) is not asked again.
  const { data: asked, error: askedError } = await admin.from('incident_events').select('detail').eq('incident_id', incidentId).eq('kind', 'question_asked');
  if (askedError) throw new Error(askedError.message);
  const trip = first(incident.trips as { name: string; pass_status: string } | { name: string; pass_status: string }[])!;
  return {
    incident,
    segment,
    booking: { booked_via: booking?.booked_via ?? null, booked_at: booking?.booked_at ?? null, segments: (legs ?? []) as LegRow[] },
    offers,
    airports,
    asked: (asked ?? []).map((e) => (e.detail as { fact: string }).fact),
    trip,
  };
}

export async function assessIncident(incidentId: string): Promise<Assessment & { tripId: string; tripName: string; affectedUserIds: string[]; passStatus: string }> {
  const loaded = await loadIncident(incidentId);
  const assessment = assess({
    incident: { ...loaded.incident, event_type: loaded.incident.event_type as 'cancellation' | 'delay' | 'schedule_change', facts: (loaded.incident.facts ?? {}) as Record<string, Primitive> },
    segment: loaded.segment as LegRow & { flight_number: string; departure_local: string; distance_km: number | null; last_status: unknown; last_status_at: string | null },
    booking: loaded.booking,
    offers: loaded.offers,
    airports: loaded.airports,
    asked: loaded.asked,
    // Only verified rules are cited; the assessment itself also lists needs_review ones, for caveats.
    rules: getLibrary().rules,
  });
  return { ...assessment, tripId: loaded.incident.trip_id, tripName: loaded.trip.name, affectedUserIds: loaded.incident.affected_user_ids, passStatus: loaded.trip.pass_status };
}

async function hasEvent(incidentId: string, kind: string, fact?: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('incident_events').select('detail').eq('incident_id', incidentId).eq('kind', kind);
  if (error) throw new Error(error.message);
  return (data ?? []).some((event) => fact === undefined || (event.detail as { fact?: string } | null)?.fact === fact);
}

/**
 * True when a notification for this incident and template is already queued. The guard against sending twice
 * when a step is retried after it queued the messages but before it wrote its event.
 */
async function alreadyQueued(incidentId: string, template: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('notifications').select('id').eq('related_entity_id', incidentId).eq('template', template).limit(1);
  if (error) throw new Error(`notifications for incident ${incidentId} could not be read: ${error.message}`);
  return (data ?? []).length > 0;
}

/** True once the group has been told: the guard that keeps a restarted run from notifying twice. */
export async function isNotified(incidentId: string): Promise<boolean> {
  return hasEvent(incidentId, 'notified');
}

export async function askPlanner(incidentId: string, question: PlannerQuestion): Promise<void> {
  // A retried step must not ask, or text the planner, a second time.
  if (await hasEvent(incidentId, 'question_asked', question.fact)) return;
  const admin = createAdminClient();
  const { data: incident, error } = await admin.from('incidents').select('trip_id, trips!inner(name)').eq('id', incidentId).single();
  if (error) throw new Error(`incident ${incidentId} could not be read: ${error.message}`);
  if (!incident) throw new Error(`incident ${incidentId} not found`);
  const { data: planner, error: plannerError } = await admin.from('trip_members').select('user_id').eq('trip_id', incident.trip_id).eq('role', 'planner').maybeSingle();
  if (plannerError) throw new Error(plannerError.message);
  check(await admin.from('incidents').update({ status: 'needs_answer', pending_question: question }).eq('id', incidentId));
  const trip = first(incident.trips as { name: string } | { name: string }[])!;
  // A retry after the text went out but before the event was written must not text the planner again.
  if (!(await alreadyQueued(incidentId, 'incident_question'))) {
    await queueNotifications({
      userIds: planner ? [planner.user_id] : [],
      tripId: incident.trip_id,
      template: 'incident_question',
      rendered: questionNotice({ tripName: trip.name, prompt: question.prompt, url: `${appUrl()}/trips/${incident.trip_id}/incidents/${incidentId}` }),
      urgent: true,
      relatedEntityId: incidentId,
    });
  }
  check(await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'question_asked', detail: { fact: question.fact } }));
}

/**
 * Stores the planner's answer, or that none came. The event keeps the raw `{ fact, value }`. The fact is set only for a
 * listed value that decides it: "mixed" leaves it unset, and an answer off the list is recorded as rejected and ignored.
 */
export async function recordAnswer(incidentId: string, answer: PlannerAnswer | null): Promise<void> {
  const admin = createAdminClient();
  const { data: incident, error } = await admin.from('incidents').select('facts').eq('id', incidentId).single();
  if (error) throw new Error(error.message);
  let value: Primitive | undefined;
  let rejected = false;
  if (answer) {
    try {
      value = answerValue(answer);
    } catch (e) {
      if (!(e instanceof PlannerAnswerError)) throw e;
      rejected = true;
    }
  }
  const facts = { ...((incident?.facts ?? {}) as Record<string, Primitive>), ...(answer && value !== undefined ? { [answer.fact]: value } : {}) };
  check(await admin.from('incidents').update({ facts, status: 'open', pending_question: null }).eq('id', incidentId));
  check(await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'answered', detail: answer ? { ...answer, ...(rejected ? { rejected: true } : {}) } : { timed_out: true } }));
}

/** Saves the playbook. On a hand-run trip it is saved held: hidden from the group by RLS until releaseHeldPlaybooks. */
export async function savePlaybook(incidentId: string): Promise<{ playbookId: string; held: boolean }> {
  const admin = createAdminClient();
  // A retried step reuses the playbook it already saved instead of generating (and paying for) another, unless the
  // planner has answered since: that playbook was drafted without the answer.
  const { data: existing, error: existingError } = await admin.from('playbooks').select('id, held_for_review, created_at').eq('incident_id', incidentId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (existingError) throw new Error(`playbooks of incident ${incidentId} could not be read: ${existingError.message}`);
  if (existing) {
    const { data: answers, error: answersError } = await admin.from('incident_events').select('created_at').eq('incident_id', incidentId).eq('kind', 'answered').gt('created_at', existing.created_at).limit(1);
    if (answersError) throw new Error(`answers of incident ${incidentId} could not be read: ${answersError.message}`);
    if ((answers ?? []).length === 0) return { playbookId: existing.id, held: existing.held_for_review };
  }

  const assessment = await assessIncident(incidentId);
  // Backstop beside generatePlaybook's own: only verified rules are cited.
  const result = await generatePlaybook({ ...assessment, applying: assessment.applying.filter((rule) => rule.status === 'verified') });
  const held = await needsReview(incidentId);
  const { data: playbook, error } = await admin
    .from('playbooks')
    .insert({
      incident_id: incidentId,
      content: result.playbook,
      rules_cited: result.rulesCited,
      model: result.model,
      citation_check_passed: result.citationCheckPassed,
      held_for_review: held,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  // A held playbook is not ready for the group until the founder releases it.
  if (!held) check(await admin.from('incidents').update({ status: 'playbook_ready' }).eq('id', incidentId));
  check(await admin.from('incident_events').insert({ incident_id: incidentId, kind: 'playbook_generated', detail: { playbook_id: playbook.id, model: result.model, held } }));
  return { playbookId: playbook.id, held };
}

/** Hand-run trips (comped from /admin) hold every playbook for the founder's review. A promotion-code comp is not hand-run. */
export async function needsReview(incidentId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from('incidents').select('trips!inner(hand_run)').eq('id', incidentId).single();
  if (error) throw new Error(error.message);
  return first(data.trips as { hand_run: boolean } | { hand_run: boolean }[])?.hand_run === true;
}

/** Shows the incident's held playbooks to the group: on the founder's release, or when the two-hour hold runs out. */
export async function releaseHeldPlaybooks(incidentId: string): Promise<void> {
  const admin = createAdminClient();
  check(await admin.from('playbooks').update({ held_for_review: false }).eq('incident_id', incidentId).eq('held_for_review', true));
  check(await admin.from('incidents').update({ status: 'playbook_ready' }).eq('id', incidentId).neq('status', 'resolved'));
}

/** Open incidents on a segment with no `notified` event: new ones, and any whose workflow never started. */
export async function unnotifiedIncidentIds(segmentId: string): Promise<string[]> {
  const { data, error } = await createAdminClient().from('incidents').select('id, incident_events(kind)').eq('segment_id', segmentId).neq('status', 'resolved');
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((incident) => !((incident.incident_events ?? []) as { kind: string }[]).some((event) => event.kind === 'notified'))
    .map((incident) => incident.id as string);
}

export async function requestReview(incidentId: string): Promise<void> {
  const admin = createAdminClient();
  const emails = (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0) return;
  const { data: admins, error } = await admin.from('profiles').select('id').in('email', emails);
  if (error) throw new Error(error.message);
  const { data: incident, error: incidentError } = await admin.from('incidents').select('trips!inner(name)').eq('id', incidentId).single();
  if (incidentError) throw new Error(incidentError.message);
  const trip = first(incident.trips as { name: string } | { name: string }[]);
  await queueNotifications({
    userIds: (admins ?? []).map((a) => a.id),
    tripId: null,
    template: 'review_hold',
    rendered: reviewHoldNotice({ tripName: trip?.name ?? 'A hand-run trip', url: `${appUrl()}/admin#${incidentId}` }),
    urgent: true,
    relatedEntityId: incidentId,
  });
}

/**
 * Who an incident notice goes to, and its words. The people on the booking; when nobody is, the trip's planner, with a
 * link to add who is flying. The planner is never left without a notice: no recipient at all is an error.
 */
async function noticeFor(incidentId: string) {
  const admin = createAdminClient();
  const { data: incident, error } = await admin
    .from('incidents')
    .select('trip_id, event_type, delay_minutes, affected_user_ids, booking_segments!inner(carrier_iata, flight_number, origin_iata, departure_local), trips!inner(name)')
    .eq('id', incidentId)
    .single();
  if (error) throw new Error(`incident ${incidentId} could not be read: ${error.message}`);
  if (!incident) throw new Error(`incident ${incidentId} not found`);
  const segment = first(incident.booking_segments as Record<string, string> | Record<string, string>[])!;
  const trip = first(incident.trips as { name: string } | { name: string }[])!;
  let userIds: string[] = incident.affected_user_ids;
  let bookingsUrl: string | undefined;
  if (userIds.length === 0) {
    const { data: planner, error: plannerError } = await admin.from('trip_members').select('user_id').eq('trip_id', incident.trip_id).eq('role', 'planner').maybeSingle();
    if (plannerError) throw new Error(`planner of incident ${incidentId} could not be read: ${plannerError.message}`);
    if (!planner) throw new Error(`incident ${incidentId} has nobody to notify: no one on the booking and no planner`);
    userIds = [planner.user_id];
    bookingsUrl = `${appUrl()}/trips/${incident.trip_id}/bookings`;
  }
  return {
    tripId: incident.trip_id as string,
    tripName: trip.name,
    userIds,
    bookingsUrl,
    url: `${appUrl()}/trips/${incident.trip_id}/incidents/${incidentId}`,
    headline: summarizeEvent({
      carrierIata: segment.carrier_iata,
      flightNumber: segment.flight_number,
      originIata: segment.origin_iata,
      departureLocal: segment.departure_local,
      eventType: incident.event_type,
      delayMinutes: incident.delay_minutes,
    }),
  };
}

/**
 * The early heads-up: the fact, and that a plan follows. Sent as soon as the incident run starts, whatever the trip, before
 * any question or playbook. Once only: a retried step or a second run finds the queued notification or the event.
 */
export async function alertAffected(incidentId: string): Promise<void> {
  if (await hasEvent(incidentId, 'alerted')) return;
  const notice = await noticeFor(incidentId);
  if (!(await alreadyQueued(incidentId, 'incident_alert'))) {
    await queueNotifications({
      userIds: notice.userIds,
      tripId: notice.tripId,
      template: 'incident_alert',
      rendered: incidentAlert({ tripName: notice.tripName, headline: notice.headline, url: notice.url, bookingsUrl: notice.bookingsUrl }),
      urgent: true,
      relatedEntityId: incidentId,
    });
  }
  check(await createAdminClient().from('incident_events').insert({ incident_id: incidentId, kind: 'alerted', detail: { users: notice.userIds.length, planner_only: notice.bookingsUrl !== undefined } }));
}

/** The "your plan is ready" notice, once: a restarted run finds the `notified` event and sends nothing. */
export async function notifyAffected(incidentId: string): Promise<void> {
  if (await isNotified(incidentId)) return;
  const notice = await noticeFor(incidentId);
  // A retry after the messages were queued but before the event was written must not send them again.
  if (!(await alreadyQueued(incidentId, 'incident'))) {
    await queueNotifications({
      userIds: notice.userIds,
      tripId: notice.tripId,
      template: 'incident',
      rendered: incidentNotice({ tripName: notice.tripName, headline: notice.headline, url: notice.url, bookingsUrl: notice.bookingsUrl }),
      urgent: true,
      relatedEntityId: incidentId,
    });
  }
  check(await createAdminClient().from('incident_events').insert({ incident_id: incidentId, kind: 'notified', detail: { users: notice.userIds.length, planner_only: notice.bookingsUrl !== undefined } }));
}
