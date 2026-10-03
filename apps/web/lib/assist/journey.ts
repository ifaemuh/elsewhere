import type { ItinerarySegment } from './situation';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;
/** A longer gap between two flights is a stopover, not a connection: it ends the journey, as between outbound and return. */
const STOPOVER = 24 * HOUR;
/**
 * The shortest gap between landing and the next departure that counts as a connection that holds. Deliberately
 * conservative toward unset: a tighter gap leaves the arrival delay unknown instead of claiming it.
 */
export const MIN_CONNECTION_MINUTES = 30;

export const time = (iso: string | null): number | null => (iso ? Date.parse(iso) : null);
export const sameFlight = (a: ItinerarySegment, b: ItinerarySegment): boolean =>
  a.carrierIata === b.carrierIata && a.originIata === b.originIata && a.destinationIata === b.destinationIata && time(a.scheduledOut) === time(b.scheduledOut);

/**
 * Where the disrupted flight sits on the booking: its index, or null when it is absent or ambiguous (two flights
 * that look identical, as when their times are unknown).
 */
export function positionOf(segments: ItinerarySegment[], flight: ItinerarySegment): number | null {
  const matches = segments.flatMap((s, i) => (sameFlight(s, flight) ? [i] : []));
  return matches.length === 1 ? matches[0] : null;
}

/**
 * The disrupted flight's journey: the flights on the booking that take the passenger, in its direction, to the
 * final destination. A flight joins the one before it when it leaves from the airport that one reached, within
 * 24 hours, and does not return to an airport the journey already visited, so outbound and return are separate
 * journeys even when they are under a day apart. Null when a connection's times are unknown, or the flight is
 * not (unambiguously) on the booking.
 */
export function journeyOf(segments: ItinerarySegment[], flight: ItinerarySegment): ItinerarySegment[] | null {
  const at = positionOf(segments, flight);
  if (at === null) return null;
  const visited = new Set([segments[at].originIata, segments[at].destinationIata]);
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
    if (!joined || visited.has(segments[first - 1].originIata)) break;
    first -= 1;
    visited.add(segments[first].originIata);
  }
  let last = at;
  while (last < segments.length - 1) {
    const joined = connects(segments[last], segments[last + 1]);
    if (joined === null) return null;
    if (!joined || visited.has(segments[last + 1].destinationIata)) break;
    last += 1;
    visited.add(segments[last].destinationIata);
  }
  return segments.slice(first, last + 1);
}

export interface OfferTimes {
  /** When the re-routing's new flight from the disrupted flight's origin airport leaves; null while not certain. */
  leaves: number | null;
  /** When the re-routing reaches the journey's final destination; null while not certain. */
  arrives: number | null;
}

const UNKNOWN: OfferTimes = { leaves: null, arrives: null };

/** `event.reroute_departs_early_minutes` for a re-routing leaving at `leaves`: 0 if at or after the booked departure. */
export const departsEarlyMinutes = (bookedOut: number, leaves: number): number => Math.max(0, Math.floor((bookedOut - leaves) / MINUTE));

/**
 * What a re-routing offer means for the passenger: the itinerary they would actually fly, and from it when the
 * re-routing leaves the disrupted flight's origin and when it reaches the journey's final destination.
 *
 * 1. A cancelled flight won't operate, so a listed copy of it is dropped from the offer.
 * 2. The offer's new flights are those not on the booking. A rebooking often repeats booked flights, of this
 *    journey or of another (a re-issued ticket lists the return too); without a new flight, nothing is known.
 * 3. The offer takes over at the journey airport its first new flight leaves from. The itinerary is the journey's
 *    flights before that airport, then the offer's flights from its first new one on, ending at the first arrival
 *    at the final destination when only booked flights of other journeys follow it. If the offer stops short of
 *    the final destination, the booked flights onward from where it stops complete it; the disrupted flight never
 *    does. A takeover airport that isn't on the journey makes the offer unknown.
 * 4. The itinerary must hold end to end: each flight leaves the airport the one before reached, with both times
 *    known, at least MIN_CONNECTION_MINUTES after it lands, and the last, and only the last, reaches the final
 *    destination, at a known time. Otherwise its arrival is null. A flight that leaves before the one before it
 *    lands, or flying the disrupted flight as booked, is contradictory, and makes the departure unknown too; so does
 *    a connection whose times are unknown, since it could hide a contradiction.
 * 5. The departure is that of the itinerary's one new flight from the disrupted flight's origin airport. A listed
 *    copy of the disrupted flight never counts; with no such flight, or several, the departure is unknown.
 */
export function offerTimes(offer: ItinerarySegment[], journey: ItinerarySegment[], booked: ItinerarySegment[], disrupted: ItinerarySegment, cancelled: boolean): OfferTimes {
  const at = journey.findIndex((f) => sameFlight(f, disrupted));
  const flights = cancelled ? offer.filter((f) => !sameFlight(f, disrupted)) : offer;
  const isNew = (f: ItinerarySegment) => !booked.some((b) => sameFlight(b, f));
  const first = flights.findIndex(isNew);
  if (first < 0) return UNKNOWN;
  const takeover = journey.findIndex((f) => f.originIata === flights[first].originIata);
  if (takeover < 0) return UNKNOWN;
  const finalDestination = journey[journey.length - 1].destinationIata;
  const rest = flights.slice(first);
  // A re-issued ticket also lists the booking's other journeys, such as the unchanged return. When only those follow
  // the first arrival at the final destination, the re-routing ends there.
  const reaches = rest.findIndex((f) => f.destinationIata === finalDestination);
  const elsewhereOnBooking = (f: ItinerarySegment) => !isNew(f) && !journey.some((b) => sameFlight(b, f));
  if (reaches >= 0 && rest.slice(reaches + 1).every(elsewhereOnBooking)) rest.length = reaches + 1;
  const flown = [...journey.slice(0, takeover), ...rest];
  const stop = flown[flown.length - 1].destinationIata;
  if (stop !== finalDestination) {
    const onward = journey.findIndex((f) => f.originIata === stop);
    if (onward > at) flown.push(...journey.slice(onward));
  }
  if (flown.some((f) => sameFlight(f, disrupted))) return UNKNOWN;

  // Only the last flight reaches the final destination: an itinerary that gets there and comes back has no one arrival.
  const reachedAt = flown.findIndex((f) => f.destinationIata === finalDestination);
  let holds = reachedAt === flown.length - 1 && flown.filter(isNew).every((f) => time(f.scheduledOut) !== null && time(f.scheduledIn) !== null);
  let ordered = true;
  for (let i = 1; i < flown.length; i += 1) {
    const landed = time(flown[i - 1].scheduledIn);
    const leaves = time(flown[i].scheduledOut);
    if (landed === null || leaves === null) {
      ordered = false;
      holds = false;
    } else if (leaves < landed) {
      return UNKNOWN;
    } else if (flown[i].originIata !== flown[i - 1].destinationIata || leaves - landed < MIN_CONNECTION_MINUTES * MINUTE) {
      holds = false;
    }
  }
  const departing = flown.filter((f) => isNew(f) && f.originIata === disrupted.originIata);
  return {
    leaves: ordered && departing.length === 1 ? time(departing[0].scheduledOut) : null,
    arrives: holds ? time(flown[flown.length - 1].scheduledIn) : null,
  };
}

/**
 * The offer the contract says to report: of those leaving no more than 1 hour (notice under 7 days, or unknown) or
 * 2 hours (notice under 14 days) early, the one that arrives soonest; if none does, any of them. A lone offer is
 * reported as it is. With several, which one is meant turns on when each leaves, so an unknown departure leaves
 * nothing reported. An unknown arrival among those in the running does too, since that one might arrive sooner,
 * unless every one in the running gives the same early departure: then that is reported, without an arrival.
 * Arrivals that tie report the smaller early departure, the one less favourable to a claim, so the result never
 * depends on the order the offers came in.
 */
export function chooseOffer(offers: OfferTimes[], bookedOut: number, noticeDays: number | null): OfferTimes | null {
  if (offers.length <= 1) return offers[0] ?? null;
  if (offers.some((o) => o.leaves === null)) return null;
  const early = (o: OfferTimes) => departsEarlyMinutes(bookedOut, o.leaves!);
  const limit = noticeDays === null || noticeDays < 7 ? HOUR : noticeDays < 14 ? 2 * HOUR : Infinity;
  const inLimit = offers.filter((o) => bookedOut - o.leaves! <= limit);
  const running = inLimit.length > 0 ? inLimit : offers;
  if (running.some((o) => o.arrives === null)) {
    return running.every((o) => early(o) === early(running[0])) ? { leaves: running[0].leaves, arrives: null } : null;
  }
  return running.reduce((best, o) => (o.arrives! < best.arrives! || (o.arrives === best.arrives && early(o) < early(best)) ? o : best));
}
