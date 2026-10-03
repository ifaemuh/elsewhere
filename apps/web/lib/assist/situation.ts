import type { Primitive, Situation } from '@elsewhere/rules/core';
import { haversineKm } from '@/lib/flights/geo';
import { EU_MEMBER_STATES, ICELAND_NORWAY_SWITZERLAND, UK, US_JURISDICTION } from '@/lib/flights/regions';
import { isEuCarrier, isUsCarrier } from './carriers';
import { chooseOffer, DAY, HOUR, journeyOf, MINUTE, offerTimes, positionOf, sameFlight, time, type OfferTimes } from './journey';
import { ASK_ORDER, storedAnswerFits } from './questions';

/** One flight on the booking. The itinerary and journey facts are computed over all of them. */
export interface ItinerarySegment {
  /** The marketing carrier the confirmation prints. */
  carrierIata: string;
  /** The airline that operates the flight (Task 4 saves it from AeroAPI), or null while unknown. Every carrier fact comes from it. */
  operatorIata: string | null;
  originIata: string;
  destinationIata: string;
  originCountry: string | null;
  destinationCountry: string | null;
  scheduledOut: string | null;
  scheduledIn: string | null;
}

/** What AeroAPI reported about the disrupted flight: the fields of Task 9's `FlightSnapshot` read here. */
export interface ObservedFlight {
  /**
   * When this snapshot was taken. Task 9's `FlightSnapshot` lacks it, and no timestamped history of snapshots is
   * persisted today, so in production `event.notice_days` stays unset until Task 12 supplies real values here.
   */
  observedAt: string;
  /** Task 9's `cancelled`: a cancelled snapshot does not count as still showing the original schedule. */
  cancelled: boolean;
  diverted: boolean;
  scheduledOut: string | null;
  estimatedOut: string | null;
  actualOut: string | null;
  scheduledIn: string | null;
}

export interface SituationInput {
  event: {
    type: 'cancellation' | 'delay' | 'schedule_change';
    delayMinutes: number | null;
    detectedAt: string;
    /** AeroAPI's snapshots of the disrupted flight, oldest first: the one that raised the incident, then the latest. */
    observed: ObservedFlight[];
    /**
     * Re-routings the airline offered, each a forwarded rebooking's flights in the order flown. Empty while none
     * is known. A schedule change's changed flight comes from `observed`, so it is not listed here.
     */
    offers: ItinerarySegment[][];
  };
  /** The disrupted flight, as booked. `distanceKm` is Task 4's great-circle distance of this flight alone. */
  segment: ItinerarySegment & { distanceKm: number | null };
  /**
   * The booking (one ticket) the flight is on. `bookedAt` is when it was made, as the confirmation printed
   * it ("YYYY-MM-DD" or "YYYY-MM-DDTHH:mm"), or null. `segments` holds every flight on the booking, the
   * disrupted one included, in the order flown.
   */
  booking: { bookedVia: string | null; bookedAt: string | null; segments: ItinerarySegment[] };
  /** Airport coordinates by IATA code, for the journey's distance. A missing airport leaves `flight.distance_km` unset. */
  airports: Record<string, { latitude: number; longitude: number }>;
  answers: Record<string, Primitive>;
}

const isUs = (country: string | null): boolean | null => (country ? US_JURISDICTION.has(country) : null);
/** Three-valued: true if any is true, false if every one is false, otherwise unknown. */
const anyTrue = (values: (boolean | null)[]): boolean | null => (values.some((v) => v === true) ? true : values.every((v) => v === false) ? false : null);
/** Three-valued: false if any is false, true if every one is true, otherwise unknown. */
const allTrue = (values: (boolean | null)[]): boolean | null => (values.some((v) => v === false) ? false : values.every((v) => v === true) ? true : null);

/**
 * The distance bands of Regulation 261/2004: Art. 6(1) (delay) and Art. 7(1) (compensation) split flights at
 * 1,500 km and 3,500 km.
 */
export const EU261_DISTANCE_THRESHOLDS_KM = [1500, 3500] as const;
/** The gap between the spherical haversine and the ellipsoidal great-circle measure the rule means. */
const DISTANCE_MARGIN = 0.005;
/** The distance in whole km, or null when it is within the margin of a threshold, where the band is uncertain. */
function certainDistance(km: number): number | null {
  return EU261_DISTANCE_THRESHOLDS_KM.some((t) => Math.abs(km - t) <= t * DISTANCE_MARGIN) ? null : Math.round(km);
}

/**
 * The latest moment a printed booking date or local time can mean: the end of that day or minute, in the
 * furthest-west time zone (UTC−12). Hours measured from it are a lower bound, so a rule that needs the
 * booking made at least N hours ahead applies only when it certainly does.
 */
function latestBookingMoment(bookedAt: string): number {
  const dateOnly = bookedAt.length === 10;
  const start = Date.parse(dateOnly ? `${bookedAt}T00:00:00Z` : `${bookedAt}:00Z`);
  return start + (dateOnly ? DAY : MINUTE) + 12 * HOUR;
}

/**
 * Scheduled minutes of the journey's nonstop flight between the U.S. and a foreign point. Unknown while any
 * flight on the journey has an unknown country, when the journey has no such flight or more than one, or when
 * its times are unknown.
 */
function usForeignNonstopMinutes(journey: ItinerarySegment[]): number | null {
  if (journey.some((s) => !s.originCountry || !s.destinationCountry)) return null;
  const crossings = journey.filter((s) => US_JURISDICTION.has(s.originCountry!) !== US_JURISDICTION.has(s.destinationCountry!));
  const crossing = crossings.length === 1 ? crossings[0] : null;
  return crossing?.scheduledOut && crossing.scheduledIn ? Math.round((Date.parse(crossing.scheduledIn) - Date.parse(crossing.scheduledOut)) / MINUTE) : null;
}

/**
 * How long after its scheduled departure the disrupted flight left, or AeroAPI expected it to leave: the
 * longest of every estimate and the actual time kept, so an announced delay that later shrank still counts.
 * Unknown for a diverted flight, and for one that any snapshot shows re-timed by an hour or more, where a delay
 * against the booked time is ambiguous.
 */
function departureDelayMinutes(bookedOut: number | null, observed: ObservedFlight[]): number | null {
  if (bookedOut === null || observed.some((o) => o.diverted)) return null;
  const retimed = observed.some((o) => {
    const out = time(o.scheduledOut);
    return out !== null && Math.abs(out - bookedOut) >= HOUR;
  });
  if (retimed) return null;
  const seen = observed.flatMap((o) => [time(o.estimatedOut), time(o.actualOut)]).filter((t): t is number => t !== null);
  return seen.length === 0 ? null : Math.max(0, Math.floor((Math.max(...seen) - bookedOut) / MINUTE));
}

/**
 * Whole days of notice the airline gave, known only when we watched the change happen: a snapshot that showed the
 * original schedule, uncancelled, strictly before detection, and before any snapshot that departed from it (so a
 * cancellation or re-time that was later undone proves nothing). The last such sighting and the moment of
 * detection bound when the airline can have told the passenger; both must give the same day count.
 */
function noticeDaysOf(bookedOut: number | null, detectedAt: string, observed: ObservedFlight[]): number | null {
  if (bookedOut === null) return null;
  const detected = Date.parse(detectedAt);
  const at = (o: ObservedFlight) => Date.parse(o.observedAt);
  const departed = observed.filter((o) => o.cancelled || o.diverted || (time(o.scheduledOut) !== null && time(o.scheduledOut) !== bookedOut)).map(at);
  const firstDeparture = departed.length > 0 ? Math.min(...departed) : Infinity;
  const sightings = observed
    .filter((o) => !o.cancelled && !o.diverted && time(o.scheduledOut) === bookedOut && at(o) < detected && at(o) < firstDeparture)
    .map(at);
  if (sightings.length === 0) return null;
  const days = (toldAt: number) => Math.max(0, Math.floor((bookedOut - toldAt) / DAY));
  const early = days(Math.max(...sightings));
  return early === days(detected) ? early : null;
}

/** A fact is set only when we know it, so matchRules reports "may apply, needs X" rather than a wrong answer. */
export function buildSituation(input: SituationInput): Situation {
  const { type, observed } = input.event;
  const operator = input.segment.operatorIata;
  const s: Situation = {
    'event.type': type,
    'trip.booked_via': input.booking.bookedVia ? 'ota' : 'direct',
  };
  // The carrier facts are about the operating airline, not the marketing code on the confirmation.
  if (operator) s['flight.carrier_iata'] = operator;
  const carrierIsUs = isUsCarrier(operator);
  const carrierIsEu = isEuCarrier(operator);
  if (carrierIsUs !== null) s['flight.carrier_is_us'] = carrierIsUs;
  if (carrierIsEu !== null) s['flight.carrier_is_eu'] = carrierIsEu;
  if (input.event.delayMinutes !== null) s['event.delay_minutes'] = input.event.delayMinutes;
  const bookedOut = time(input.segment.scheduledOut);
  const noticeDays = noticeDaysOf(bookedOut, input.event.detectedAt, observed);
  if (noticeDays !== null) s['event.notice_days'] = noticeDays;

  const { originCountry: origin, destinationCountry: destination } = input.segment;
  // Task 9 records a diversion as a delay. Where its travelers are stranded is not known.
  const diverted = observed.some((o) => o.diverted);
  if (origin) {
    s['flight.departs_us'] = US_JURISDICTION.has(origin);
    s['flight.departs_eu'] = EU_MEMBER_STATES.has(origin);
    s['flight.departs_iceland_norway_switzerland'] = ICELAND_NORWAY_SWITZERLAND.has(origin);
    s['flight.departs_uk'] = UK.has(origin);
    if (!diverted) s['event.at_us_airport'] = US_JURISDICTION.has(origin);
  }
  if (destination) s['flight.arrives_eu'] = EU_MEMBER_STATES.has(destination);
  if (origin && destination) {
    s['flight.touches_us'] = US_JURISDICTION.has(origin) || US_JURISDICTION.has(destination);
    s['flight.is_domestic_us'] = US_JURISDICTION.has(origin) && US_JURISDICTION.has(destination);
  }
  const legDistance = input.segment.distanceKm === null ? null : certainDistance(input.segment.distanceKm);
  if (legDistance !== null) s['flight.leg_distance_km'] = legDistance;

  if (type === 'delay') {
    const departureDelay = departureDelayMinutes(bookedOut, observed);
    if (departureDelay !== null) s['event.departure_delay_minutes'] = departureDelay;
  }
  // A schedule change is the same flight at a new time: AeroAPI's latest scheduled departure.
  const latest = observed.at(-1);
  const newOut = time(latest?.scheduledOut ?? null);
  if (type === 'schedule_change' && bookedOut !== null && newOut !== null) {
    s['event.departure_moved_earlier_minutes'] = Math.max(0, Math.floor((bookedOut - newOut) / MINUTE));
  }

  // Booking-level and journey facts need the disrupted flight to be found on the booking.
  const segments = input.booking.segments;
  const journey = positionOf(segments, input.segment) === null ? null : journeyOf(segments, input.segment);
  if (positionOf(segments, input.segment) !== null) {
    const touches = anyTrue(segments.map((seg) => anyTrue([isUs(seg.originCountry), isUs(seg.destinationCountry)])));
    if (touches !== null) s['trip.touches_us'] = touches;
    const domestic = allTrue(segments.map((seg) => allTrue([isUs(seg.originCountry), isUs(seg.destinationCountry)])));
    if (domestic !== null) s['trip.itinerary_domestic_us'] = domestic;
    // The airline the booking was made with: known when every flight on it is sold by a U.S. airline, or none is.
    // The selling (marketing) carrier, not the operator.
    const usCarrier = segments.map((seg) => isUsCarrier(seg.carrierIata));
    if (usCarrier.every((v) => v === true)) s['trip.booked_with_us_carrier'] = true;
    else if (usCarrier.every((v) => v === false)) s['trip.booked_with_us_carrier'] = false;
    if (input.booking.bookedAt && segments.every((seg) => seg.scheduledOut)) {
      const firstDeparture = Math.min(...segments.map((seg) => Date.parse(seg.scheduledOut!)));
      s['trip.hours_booked_before_departure'] = Math.max(0, Math.floor((firstDeparture - latestBookingMoment(input.booking.bookedAt)) / HOUR));
    }
  }

  // The journey: this flight and those it connects with, in its direction, on this booking.
  if (journey) {
    if (journey.length > 1) s['flight.single_ticket'] = true;
    const start = journey[0];
    const end = journey[journey.length - 1];
    if (start.originCountry) s['trip.journey_departs_eu'] = EU_MEMBER_STATES.has(start.originCountry);
    if (end.destinationCountry) s['trip.journey_arrives_eu'] = EU_MEMBER_STATES.has(end.destinationCountry);
    const from = input.airports[start.originIata];
    const to = input.airports[end.destinationIata];
    const journeyDistance = from && to ? certainDistance(haversineKm(from, to)) : null;
    if (journeyDistance !== null) s['flight.distance_km'] = journeyDistance;
    const nonstop = usForeignNonstopMinutes(journey);
    if (nonstop !== null) s['trip.us_foreign_nonstop_minutes'] = nonstop;
  }

  // The re-routing offered after a cancellation or a schedule change: set only when an offer is known and
  // every time it needs is known.
  if ((type === 'cancellation' || type === 'schedule_change') && bookedOut !== null) {
    const offers = [...input.event.offers];
    if (type === 'schedule_change' && latest?.scheduledOut) {
      // The changed flight itself counts as an offer, with the rest of the journey as booked.
      const changed = { ...input.segment, scheduledOut: latest.scheduledOut, scheduledIn: latest.scheduledIn };
      offers.push(journey ? journey.map((f) => (sameFlight(f, input.segment) ? changed : f)) : [changed]);
    }
    const end = journey?.[journey.length - 1] ?? null;
    const timed = offers.map((o) => offerTimes(o, segments, input.segment, journey, end?.destinationIata ?? null));
    if (timed.length > 0 && !timed.includes('unknown')) {
      const offer = chooseOffer(timed as OfferTimes[], bookedOut, noticeDays);
      if (offer) {
        s['event.reroute_departs_early_minutes'] = Math.max(0, Math.floor((bookedOut - offer.leaves) / MINUTE));
        const plannedArrival = time(end?.scheduledIn ?? null);
        if (offer.arrives !== null && plannedArrival !== null) {
          s['event.reroute_arrival_delay_minutes'] = Math.max(0, Math.floor((offer.arrives - plannedArrival) / MINUTE));
        }
      }
    }
  }

  // The planner's answers fill only the facts a traveler can answer, and only while nothing derived is known.
  for (const fact of ASK_ORDER) {
    const answer = input.answers[fact];
    if (answer !== undefined && !(fact in s) && storedAnswerFits(fact, answer)) s[fact] = answer;
  }
  return s;
}
