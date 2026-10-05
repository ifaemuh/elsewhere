import { matchRules, type Primitive, type Rule, type Situation } from '@elsewhere/rules/core';
import { nextQuestion, type PlannerQuestion } from './questions';
import { buildSituation, type ItinerarySegment, type ObservedFlight } from './situation';

const day = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "3 h 20 min", "2 h" or "45 min": forms the citation check accepts for a delay of that many minutes. */
function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function summarizeEvent(e: { carrierIata: string; flightNumber: string; originIata: string; departureLocal: string; eventType: string; delayMinutes: number | null }): string {
  const flight = `${e.carrierIata} ${e.flightNumber} from ${e.originIata} on ${day.format(new Date(`${e.departureLocal.slice(0, 10)}T00:00:00Z`))}`;
  if (e.eventType === 'cancellation') return `${flight} was cancelled.`;
  if (e.eventType === 'schedule_change') return `${flight} was moved to a new time.`;
  // Task 9 records a diversion as a delay whose length isn't known yet.
  if (e.delayMinutes === null) return `${flight} was diverted.`;
  return `${flight} is running ${duration(e.delayMinutes)} late.`;
}

/** The incident's durations in MINUTES, for the citation check, which derives the compound and whole-hour forms itself. */
export function incidentNumbers(delayMinutes: number | null): string[] {
  return delayMinutes === null ? [] : [String(delayMinutes)];
}

/** One flight, as `booking_segments` stores it. */
export interface LegRow {
  carrier_iata: string;
  operator_iata: string | null;
  origin_iata: string;
  destination_iata: string;
  origin_country: string | null;
  destination_country: string | null;
  scheduled_out: string | null;
  scheduled_in: string | null;
}

export interface AssessmentInput {
  /** `raw_payload` is the FlightSnapshot that raised the incident (Task 9), or `{}`. It was taken at `detected_at`. */
  incident: { id: string; event_type: 'cancellation' | 'delay' | 'schedule_change'; delay_minutes: number | null; detected_at: string; facts: Record<string, Primitive>; raw_payload: unknown; previous_status?: unknown; previous_status_at?: string | null };
  /** The disrupted flight. `last_status` is the latest FlightSnapshot of it (Task 9), taken at `last_status_at`; both null before the first poll. */
  segment: LegRow & { flight_number: string; departure_local: string; distance_km: number | null; last_status: unknown; last_status_at: string | null };
  /** The booking the segment is on: when it was made (as printed), and every one of its flights, in order. */
  booking: { booked_via: string | null; booked_at: string | null; segments: LegRow[] };
  /** Forwarded rebookings of this booking, each its flights in order. Empty while none is known. */
  offers: LegRow[][];
  /** Airport coordinates by IATA code (AeroAPI), for the journey's distance. */
  airports: Record<string, { latitude: number; longitude: number }>;
  asked: string[];
  rules: Rule[];
}

export interface Assessment {
  situation: Situation;
  applying: Rule[];
  reviewing: Rule[];
  question: PlannerQuestion | null;
  eventSummary: string;
  extraNumbers: string[];
}

const leg = (row: LegRow): ItinerarySegment => ({
  carrierIata: row.carrier_iata,
  operatorIata: row.operator_iata,
  originIata: row.origin_iata,
  destinationIata: row.destination_iata,
  originCountry: row.origin_country,
  destinationCountry: row.destination_country,
  scheduledOut: row.scheduled_out,
  scheduledIn: row.scheduled_in,
});

/** A stored FlightSnapshot, as opposed to `{}` or null, stamped with when it was taken. */
function observe(value: unknown, observedAt: string): ObservedFlight | null {
  if (typeof value !== 'object' || value === null || !('scheduledOut' in value)) return null;
  const snapshot = value as Record<string, unknown>;
  const text = (field: string) => (typeof snapshot[field] === 'string' ? (snapshot[field] as string) : null);
  return {
    observedAt,
    cancelled: snapshot.cancelled === true,
    diverted: snapshot.diverted === true,
    scheduledOut: text('scheduledOut'),
    estimatedOut: text('estimatedOut'),
    actualOut: text('actualOut'),
    scheduledIn: text('scheduledIn'),
  };
}

/**
 * The snapshots we keep, oldest first. The status before the one that raised the incident carries its own time (it is
 * the only sighting that can prove the original schedule stood before the change); with no time it is left out. The one
 * that raised the incident was taken when it was detected. The latest has its own time; a row saved before that was
 * recorded falls back to the detection time, which can never make it count as a sighting of the original schedule
 * before the change (event.notice_days then stays unset rather than wrong).
 */
function observedFlights(incident: AssessmentInput['incident'], segment: AssessmentInput['segment']): ObservedFlight[] {
  const before = incident.previous_status_at ? observe(incident.previous_status, incident.previous_status_at) : null;
  const atDetection = observe(incident.raw_payload, incident.detected_at);
  const latest = segment.last_status === null ? null : observe(segment.last_status, segment.last_status_at ?? incident.detected_at);
  return [before, atDetection, latest].filter((o): o is ObservedFlight => o !== null);
}

/** Pure: everything an incident needs, from loaded rows. */
export function assess(input: AssessmentInput): Assessment {
  const situation = buildSituation({
    event: {
      type: input.incident.event_type,
      delayMinutes: input.incident.delay_minutes,
      detectedAt: input.incident.detected_at,
      observed: observedFlights(input.incident, input.segment),
      offers: input.offers.map((offer) => offer.map(leg)),
    },
    segment: { ...leg(input.segment), distanceKm: input.segment.distance_km },
    booking: { bookedVia: input.booking.booked_via, bookedAt: input.booking.booked_at, segments: input.booking.segments.map(leg) },
    airports: input.airports,
    answers: input.incident.facts,
  });
  const relevant = input.rules.filter((rule) => rule.domain === 'flights' || rule.domain === 'money');
  const verifiedResults = matchRules(relevant, situation, { statuses: ['verified'] });
  const reviewResults = matchRules(relevant, situation, { statuses: ['needs_review'] });
  const byId = new Map(relevant.map((rule) => [rule.id, rule]));
  return {
    situation,
    applying: verifiedResults.filter((r) => r.outcome === 'applies').map((r) => byId.get(r.rule_id)!).filter((rule) => rule.status === 'verified'),
    reviewing: reviewResults.map((r) => byId.get(r.rule_id)!),
    question: nextQuestion(verifiedResults, input.asked),
    eventSummary: summarizeEvent({
      carrierIata: input.segment.carrier_iata,
      flightNumber: input.segment.flight_number,
      originIata: input.segment.origin_iata,
      departureLocal: input.segment.departure_local,
      eventType: input.incident.event_type,
      delayMinutes: input.incident.delay_minutes,
    }),
    extraNumbers: incidentNumbers(input.incident.delay_minutes),
  };
}
