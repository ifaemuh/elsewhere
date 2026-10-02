import type { AeroApi } from './aeroapi';
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
  | { kind: 'not_found' };

const MATCH_WINDOW_MINUTES = 90;

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
  const date = segment.departureLocal.slice(0, 10);
  const [scheduled, origin, destination] = await Promise.all([
    api.schedules(shiftDate(date, -1), shiftDate(date, 2), segment.carrierIata, segment.flightNumber),
    api.airport(segment.originIata),
    api.airport(segment.destinationIata),
  ]);
  const timeZone = origin?.timezone ?? 'UTC';
  const match = scheduled
    .filter((s) => s.scheduled_out && s.scheduled_in && s.origin_iata === segment.originIata && s.destination_iata === segment.destinationIata)
    .map((s) => ({ s, gap: minutesBetweenLocal(localDateTime(s.scheduled_out, timeZone), segment.departureLocal) }))
    .filter(({ gap }) => gap <= MATCH_WINDOW_MINUTES)
    .sort((a, b) => a.gap - b.gap)[0]?.s;
  if (!match) return { kind: 'not_found' };

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
