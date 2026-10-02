import type { AeroAirport, AeroApi } from './aeroapi';
import { haversineKm, localDateTime } from './geo';

export interface SegmentToResolve {
  id: string;
  carrierIata: string;
  flightNumber: string;
  originIata: string;
  destinationIata: string;
  departureLocal: string;
}

export type Resolution =
  | {
      kind: 'resolved';
      scheduledOut: string;
      scheduledIn: string;
      originCountry: string | null;
      destinationCountry: string | null;
      distanceKm: number | null;
    }
  | { kind: 'not_found'; reason: 'invalid_departure' | 'unknown_origin_timezone' | 'no_matching_flight' };

const MATCH_WINDOW_MINUTES = 90;
const LOCAL_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** Airport data is static, so look each airport up once per client. A failed lookup is not cached. */
const airportCache = new WeakMap<AeroApi, Map<string, Promise<AeroAirport | null>>>();
function cachedAirport(api: AeroApi, iata: string): Promise<AeroAirport | null> {
  let cache = airportCache.get(api);
  if (!cache) airportCache.set(api, (cache = new Map()));
  let hit = cache.get(iata);
  if (!hit) {
    const lookup = api.airport(iata);
    cache.set(iata, (hit = lookup));
    lookup.catch(() => cache.delete(iata));
  }
  return hit;
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minutesBetweenLocal(a: string, b: string): number {
  return Math.abs(new Date(`${a}:00Z`).getTime() - new Date(`${b}:00Z`).getTime()) / 60000;
}

/** Turns "TP 204, Nov 3 18:15 local" into scheduled UTC times, countries, and distance. */
export async function resolveSegment(segment: SegmentToResolve, api: AeroApi): Promise<Resolution> {
  if (!LOCAL_DATETIME.test(segment.departureLocal) || Number.isNaN(Date.parse(`${segment.departureLocal}:00Z`))) {
    return { kind: 'not_found', reason: 'invalid_departure' };
  }
  const date = segment.departureLocal.slice(0, 10);
  const settled = await Promise.allSettled([
    api.schedules(shiftDate(date, -1), shiftDate(date, 2), segment.carrierIata, segment.flightNumber),
    cachedAirport(api, segment.originIata),
    cachedAirport(api, segment.destinationIata),
  ]);
  const failed = settled.find((r) => r.status === 'rejected');
  if (failed) throw (failed as PromiseRejectedResult).reason;
  const [scheduled, origin, destination] = settled.map((r) => (r as PromiseFulfilledResult<unknown>).value) as [Awaited<ReturnType<AeroApi['schedules']>>, AeroAirport | null, AeroAirport | null];
  const timeZone = origin?.timezone;
  if (!timeZone) return { kind: 'not_found', reason: 'unknown_origin_timezone' };
  // Ties (the repeated hour when clocks fall back) go to the earlier departure.
  const match = scheduled
    .filter((s) => s.scheduled_out && s.scheduled_in && s.origin_iata === segment.originIata && s.destination_iata === segment.destinationIata)
    .map((s) => ({ s, gap: minutesBetweenLocal(localDateTime(s.scheduled_out, timeZone), segment.departureLocal) }))
    .filter(({ gap }) => gap <= MATCH_WINDOW_MINUTES)
    .sort((a, b) => a.gap - b.gap || a.s.scheduled_out.localeCompare(b.s.scheduled_out))[0]?.s;
  if (!match) return { kind: 'not_found', reason: 'no_matching_flight' };

  const distance =
    origin?.latitude != null && origin.longitude != null && destination?.latitude != null && destination.longitude != null
      ? Math.round(haversineKm({ latitude: origin.latitude, longitude: origin.longitude }, { latitude: destination.latitude, longitude: destination.longitude }) / 10) * 10
      : null;
  return {
    kind: 'resolved',
    scheduledOut: match.scheduled_out,
    scheduledIn: match.scheduled_in,
    originCountry: origin?.country_code ?? null,
    destinationCountry: destination?.country_code ?? null,
    distanceKm: distance,
  };
}
