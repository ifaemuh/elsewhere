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
  /** When the offer's flight from the disrupted flight's origin airport leaves. */
  leaves: number;
  /** When the offer reaches the journey's final destination; null when its connections do not hold up to it. */
  arrives: number | null;
}

/**
 * When a re-routing leaves the origin airport, and when it reaches the journey's final destination. Returns
 * 'unknown' while a time it needs is missing, or the offer has no flight from the origin or nothing new on it.
 * A rebooking often repeats the flights that did not change, so the arrival is read from its first flight that is
 * not on the booking: every flight from there must land at least MIN_CONNECTION_MINUTES before the next one
 * leaves from the same airport, up to one that reaches the final destination. Otherwise the arrival is null.
 *
 * The booked feeder (the journey flight into the disrupted flight's origin) is checked against the first new
 * flight too, whether or not the offer repeats it: a new flight that leaves before the feeder lands is
 * contradictory (unknown), and a gap under the minimum leaves the arrival unset. The disrupted flight itself,
 * when an offer lists it, is not a feeder.
 */
export function offerTimes(
  offer: ItinerarySegment[],
  booked: ItinerarySegment[],
  disrupted: ItinerarySegment,
  journey: ItinerarySegment[] | null,
  finalDestination: string | null,
): OfferTimes | 'unknown' {
  const origin = disrupted.originIata;
  const leaves = time(offer.find((f) => f.originIata === origin)?.scheduledOut ?? null);
  const start = offer.findIndex((f) => !booked.some((b) => sameFlight(b, f)));
  if (leaves === null || start < 0) return 'unknown';

  const at = journey?.findIndex((f) => sameFlight(f, disrupted)) ?? -1;
  const feeder = at > 0 ? journey![at - 1] : null;
  const first = offer[start];
  const prev = start > 0 ? offer[start - 1] : null;
  const feederInto = feeder && ((prev && sameFlight(prev, feeder)) || first.originIata === origin) ? feeder : null;
  if (feederInto) {
    const landed = time(feederInto.scheduledIn);
    const out = time(first.scheduledOut);
    if (landed === null || out === null) return 'unknown';
    if (out < landed) return 'unknown';
    if (first.originIata !== feederInto.destinationIata || out - landed < MIN_CONNECTION_MINUTES * MINUTE) return { leaves, arrives: null };
  }
  for (let i = start; i < offer.length; i += 1) {
    const landed = time(offer[i].scheduledIn);
    if (landed === null) return 'unknown';
    if (offer[i].destinationIata === finalDestination) return { leaves, arrives: landed };
    const next = offer[i + 1];
    if (!next) break;
    const nextOut = time(next.scheduledOut);
    if (nextOut === null) return 'unknown';
    // A new flight that leaves before the flight into its airport lands is contradictory data: unknown.
    // (A booked flight left behind by a late new one is a known missed connection: the arrival is unset.)
    if (nextOut < landed && !booked.some((b) => sameFlight(b, next))) return 'unknown';
    if (next.originIata !== offer[i].destinationIata || nextOut - landed < MIN_CONNECTION_MINUTES * MINUTE) break;
  }
  return { leaves, arrives: null };
}

/**
 * The offer the contract says to report: of those leaving no more than 1 hour (notice under 7 days, or unknown) or
 * 2 hours (notice under 14 days) early, the one that arrives soonest; if none does, any of them. Its arrival is
 * unknown while any offer in the running hides its own, since that one might arrive sooner: then nothing is
 * reported, unless every offer in the running leaves at the same time, so the departure is certain.
 */
export function chooseOffer(offers: OfferTimes[], bookedOut: number, noticeDays: number | null): OfferTimes | null {
  const limit = noticeDays === null || noticeDays < 7 ? HOUR : noticeDays < 14 ? 2 * HOUR : Infinity;
  const inLimit = offers.filter((o) => bookedOut - o.leaves <= limit);
  const running = inLimit.length > 0 ? inLimit : offers;
  const soonest = [...running].sort((a, b) => (a.arrives ?? Infinity) - (b.arrives ?? Infinity))[0];
  if (!soonest) return null;
  if (!running.some((o) => o.arrives === null)) return soonest;
  return running.every((o) => o.leaves === soonest.leaves) ? { leaves: soonest.leaves, arrives: null } : null;
}
