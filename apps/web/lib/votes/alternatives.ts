import type { AeroApi } from '@/lib/flights/aeroapi';
import { localDateTime } from '@/lib/flights/geo';

export const ALTERNATIVE_NOTE = 'availability not confirmed — ask the airline';
const label = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** True when a schedule row is the disrupted flight itself: its IATA ident (or operating ident, IATA or ICAO form) is carrier + number. */
function isDisrupted(s: { ident_iata: string | null; actual_ident_iata?: string | null; actual_ident?: string | null }, carrier: string, number: string): boolean {
  const ident = `${carrier}${number}`;
  if (s.ident_iata === ident || s.actual_ident_iata === ident) return true;
  // An ICAO operating ident (TAP204) cannot be mapped back to the IATA carrier, so match the number: same route, same day.
  return typeof s.actual_ident === 'string' && new RegExp(`^[A-Z]{3}0*${number.replace(/^0+/, '')}$`).test(s.actual_ident);
}

/** Schedule data only. It says what flies, never whether a seat is free. The cancelled flight itself is never offered back. */
export async function suggestAlternatives(
  segment: { originIata: string; destinationIata: string; carrierIata: string; flightNumber: string; departureLocal: string },
  api: AeroApi,
  now: Date,
): Promise<{ label: string; note: string }[]> {
  const start = now.toISOString().slice(0, 10);
  const end = new Date(now.getTime() + 2 * 24 * 3600_000).toISOString().slice(0, 10);
  const [scheduled, origin] = await Promise.all([api.routeSchedules(start, end, segment.originIata, segment.destinationIata), api.airport(segment.originIata)]);
  const timeZone = origin?.timezone ?? 'UTC';
  return scheduled
    .filter((s) => s.origin_iata === segment.originIata && s.destination_iata === segment.destinationIata && new Date(s.scheduled_out) > now)
    .filter((s) => !(isDisrupted(s, segment.carrierIata, segment.flightNumber) && localDateTime(s.scheduled_out, timeZone).slice(0, 10) === segment.departureLocal.slice(0, 10)))
    .sort((a, b) => a.scheduled_out.localeCompare(b.scheduled_out))
    .slice(0, 4)
    .map((s) => {
      const local = localDateTime(s.scheduled_out, timeZone);
      const ident = (s.ident_iata ?? '').replace(/^([A-Z0-9]{2})(\d+)$/, '$1 $2');
      return { label: `${ident} · leaves ${label.format(new Date(`${local.slice(0, 10)}T00:00:00Z`))}, ${local.slice(11)}`, note: ALTERNATIVE_NOTE };
    });
}
