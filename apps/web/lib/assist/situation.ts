import type { FactName, Primitive, Situation } from '@elsewhere/rules/core';
import { haversineKm } from '@/lib/flights/geo';
import { EU_MEMBER_STATES, ICELAND_NORWAY_SWITZERLAND, UK, US_JURISDICTION } from '@/lib/flights/regions';
import { EU_CARRIERS, US_CARRIERS } from './carriers';

/** One flight on the booking. The itinerary and journey facts are computed over all of them. */
export interface ItinerarySegment {
  carrierIata: string;
  originIata: string;
  destinationIata: string;
  originCountry: string | null;
  destinationCountry: string | null;
  scheduledOut: string | null;
  scheduledIn: string | null;
}

/** What AeroAPI reported about the disrupted flight: the fields of Task 9's `FlightSnapshot` read here. */
export interface ObservedFlight {
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

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
/** A longer gap between two flights is a stopover, not a connection: it ends the journey, as between outbound and return. */
const STOPOVER = 24 * HOUR;

const isUs = (country: string | null): boolean | null => (country ? US_JURISDICTION.has(country) : null);
/** Three-valued: true if any is true, false if every one is false, otherwise unknown. */
const anyTrue = (values: (boolean | null)[]): boolean | null => (values.some((v) => v === true) ? true : values.every((v) => v === false) ? false : null);
/** Three-valued: false if any is false, true if every one is true, otherwise unknown. */
const allTrue = (values: (boolean | null)[]): boolean | null => (values.some((v) => v === false) ? false : values.every((v) => v === true) ? true : null);
const time = (iso: string | null): number | null => (iso ? Date.parse(iso) : null);
const sameFlight = (a: ItinerarySegment, b: ItinerarySegment): boolean =>
  a.carrierIata === b.carrierIata && a.originIata === b.originIata && a.destinationIata === b.destinationIata && time(a.scheduledOut) === time(b.scheduledOut);

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
 * The disrupted flight's journey: the flights on the booking that take the passenger, in its direction, to the
 * final destination. A flight joins the one before it when it leaves from the airport that one reached, within
 * 24 hours, so outbound and return are separate journeys. Null when a connection's times are unknown, or the
 * flight is not on the booking.
 */
function journeyOf(segments: ItinerarySegment[], flight: ItinerarySegment): ItinerarySegment[] | null {
  const at = segments.findIndex((s) => sameFlight(s, flight));
  if (at < 0) return null;
  const connects = (a: ItinerarySegment, b: ItinerarySegment): boolean | null => {
    if (a.destinationIata !== b.originIata) return false;
    const landed = time(a.scheduledIn);
    const leaves = time(b.scheduledOut);
    return landed === null || leaves === null ? null : leaves - landed <= STOPOVER;
  };
  let first = at;
  while (first > 0) {
    const joined = connects(segments[first - 1], segments[first]);
    if (joined === null) return null;
    if (!joined) break;
    first -= 1;
  }
  let last = at;
  while (last < segments.length - 1) {
    const joined = connects(segments[last], segments[last + 1]);
    if (joined === null) return null;
    if (!joined) break;
    last += 1;
  }
  return segments.slice(first, last + 1);
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
 */
function departureDelayMinutes(scheduledOut: string | null, observed: ObservedFlight[]): number | null {
  const scheduled = time(scheduledOut);
  const seen = observed.flatMap((o) => [time(o.estimatedOut), time(o.actualOut)]).filter((t): t is number => t !== null);
  return scheduled === null || seen.length === 0 ? null : Math.max(0, Math.floor((Math.max(...seen) - scheduled) / MINUTE));
}

interface OfferTimes {
  leaves: number;
  arrives: number | null;
}

/**
 * When a re-routing leaves, and when it reaches the journey's final destination. A rebooking often repeats the
 * flights that did not change, so the re-routing starts at its first flight that is not on the booking. Its
 * arrival counts only if every flight from there connects (lands before the next one leaves) up to one that
 * reaches the final destination.
 */
function offerTimes(offer: ItinerarySegment[], booked: ItinerarySegment[], finalDestination: string | null): OfferTimes | null {
  const start = offer.findIndex((f) => !booked.some((b) => sameFlight(b, f)));
  const leaves = start < 0 ? null : time(offer[start].scheduledOut);
  if (leaves === null) return null;
  for (let i = start; i < offer.length; i += 1) {
    const landed = time(offer[i].scheduledIn);
    if (landed === null) break;
    if (offer[i].destinationIata === finalDestination) return { leaves, arrives: landed };
    const next = time(offer[i + 1]?.scheduledOut ?? null);
    if (next === null || next < landed) break;
  }
  return { leaves, arrives: null };
}

/**
 * The offer the contract says to report: of those leaving no more than 1 hour (notice under 7 days) or 2 hours
 * (notice under 14 days) early, the one that arrives soonest; if none does, any of them. Its arrival is unknown
 * while any offer in the running hides its own, since that one might arrive sooner.
 */
function chooseOffer(offers: OfferTimes[], bookedOut: number, noticeDays: number): OfferTimes | null {
  const limit = noticeDays < 7 ? HOUR : noticeDays < 14 ? 2 * HOUR : Infinity;
  const inLimit = offers.filter((o) => bookedOut - o.leaves <= limit);
  const running = inLimit.length > 0 ? inLimit : offers;
  const soonest = [...running].sort((a, b) => (a.arrives ?? Infinity) - (b.arrives ?? Infinity))[0];
  if (!soonest) return null;
  return running.some((o) => o.arrives === null) ? { leaves: soonest.leaves, arrives: null } : soonest;
}

/** A fact is set only when we know it, so matchRules reports "may apply, needs X" rather than a wrong answer. */
export function buildSituation(input: SituationInput): Situation {
  const { type, observed } = input.event;
  const s: Situation = {
    'event.type': type,
    'flight.carrier_iata': input.segment.carrierIata,
    'flight.carrier_is_us': US_CARRIERS.has(input.segment.carrierIata),
    'flight.carrier_is_eu': EU_CARRIERS.has(input.segment.carrierIata),
    'trip.booked_via': input.booking.bookedVia ? 'ota' : 'direct',
  };
  if (input.event.delayMinutes !== null) s['event.delay_minutes'] = input.event.delayMinutes;
  const bookedOut = time(input.segment.scheduledOut);
  const noticeDays = bookedOut === null ? null : Math.max(0, Math.floor((bookedOut - Date.parse(input.event.detectedAt)) / DAY));
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
  if (input.segment.distanceKm !== null) s['flight.leg_distance_km'] = input.segment.distanceKm;

  if (type === 'delay') {
    const departureDelay = departureDelayMinutes(input.segment.scheduledOut, observed);
    if (departureDelay !== null) s['event.departure_delay_minutes'] = departureDelay;
  }
  // A schedule change is the same flight at a new time: AeroAPI's latest scheduled departure.
  const latest = observed.at(-1);
  const newOut = time(latest?.scheduledOut ?? null);
  if (type === 'schedule_change' && bookedOut !== null && newOut !== null) {
    s['event.departure_moved_earlier_minutes'] = Math.max(0, Math.floor((bookedOut - newOut) / MINUTE));
  }

  const segments = input.booking.segments;
  if (segments.length > 1) s['flight.single_ticket'] = true;
  if (segments.length > 0) {
    const touches = anyTrue(segments.map((seg) => anyTrue([isUs(seg.originCountry), isUs(seg.destinationCountry)])));
    if (touches !== null) s['trip.touches_us'] = touches;
    const domestic = allTrue(segments.map((seg) => allTrue([isUs(seg.originCountry), isUs(seg.destinationCountry)])));
    if (domestic !== null) s['trip.itinerary_domestic_us'] = domestic;
    // The airline the booking was made with: known when every flight on it is a U.S. airline's, or none is.
    const usCarrier = segments.map((seg) => US_CARRIERS.has(seg.carrierIata));
    if (usCarrier.every(Boolean)) s['trip.booked_with_us_carrier'] = true;
    else if (usCarrier.every((v) => !v)) s['trip.booked_with_us_carrier'] = false;
    if (input.booking.bookedAt && segments.every((seg) => seg.scheduledOut)) {
      const firstDeparture = Math.min(...segments.map((seg) => Date.parse(seg.scheduledOut!)));
      s['trip.hours_booked_before_departure'] = Math.max(0, Math.floor((firstDeparture - latestBookingMoment(input.booking.bookedAt)) / HOUR));
    }
  }

  // The journey: this flight and those it connects with, in its direction, on this booking.
  const journey = journeyOf(segments, input.segment);
  if (journey) {
    const start = journey[0];
    const end = journey[journey.length - 1];
    if (start.originCountry) s['trip.journey_departs_eu'] = EU_MEMBER_STATES.has(start.originCountry);
    if (end.destinationCountry) s['trip.journey_arrives_eu'] = EU_MEMBER_STATES.has(end.destinationCountry);
    const from = input.airports[start.originIata];
    const to = input.airports[end.destinationIata];
    // To the nearest 10 km, as Task 4 rounds a single flight's distance.
    if (from && to) s['flight.distance_km'] = Math.round(haversineKm(from, to) / 10) * 10;
    const nonstop = usForeignNonstopMinutes(journey);
    if (nonstop !== null) s['trip.us_foreign_nonstop_minutes'] = nonstop;
  }

  // The re-routing offered after a cancellation or a schedule change: set only when an offer is known.
  if ((type === 'cancellation' || type === 'schedule_change') && bookedOut !== null && noticeDays !== null) {
    const offers = [...input.event.offers];
    if (type === 'schedule_change' && latest?.scheduledOut) {
      // The changed flight itself counts as an offer, with the rest of the journey as booked.
      const changed = { ...input.segment, scheduledOut: latest.scheduledOut, scheduledIn: latest.scheduledIn };
      offers.push(journey ? journey.map((f) => (sameFlight(f, input.segment) ? changed : f)) : [changed]);
    }
    const end = journey?.[journey.length - 1] ?? null;
    const timed = offers.map((o) => offerTimes(o, segments, end?.destinationIata ?? null)).filter((o): o is OfferTimes => o !== null);
    const offer = chooseOffer(timed, bookedOut, noticeDays);
    if (offer) {
      s['event.reroute_departs_early_minutes'] = Math.max(0, Math.floor((bookedOut - offer.leaves) / MINUTE));
      const plannedArrival = time(end?.scheduledIn ?? null);
      if (offer.arrives !== null && plannedArrival !== null) {
        s['event.reroute_arrival_delay_minutes'] = Math.max(0, Math.floor((offer.arrives - plannedArrival) / MINUTE));
      }
    }
  }

  // passenger.volunteered, passenger.accepted_alternative, and event.cause come only from the planner's answers,
  // and so do the re-routing facts while no offer is known.
  for (const [fact, value] of Object.entries(input.answers)) s[fact as FactName] = value;
  return s;
}
