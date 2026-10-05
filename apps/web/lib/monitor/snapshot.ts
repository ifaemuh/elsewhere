import type { AeroFlight } from '@/lib/flights/aeroapi';

export const DELAY_BANDS = [120, 180, 360] as const;
/** A move in the scheduled departure smaller than this is schedule-data noise, not a schedule change. */
export const RETIME_MINUTES = 60;

export interface FlightSnapshot {
  faFlightId: string | null;
  cancelled: boolean;
  diverted: boolean;
  scheduledOut: string | null;
  estimatedOut: string | null;
  actualOut: string | null;
  scheduledIn: string | null;
  estimatedIn: string | null;
  actualIn: string | null;
  arrivalDelayMinutes: number | null;
}

export interface FlightEvent {
  type: 'cancellation' | 'delay' | 'schedule_change';
  delayMinutes: number | null;
  dedupeSuffix: string;
}

/** Tolerant of absent fields: alert webhooks carry a flight object that is not guaranteed to be as complete as a poll. */
export function snapshotFromAero(f: AeroFlight): FlightSnapshot {
  return {
    faFlightId: f.fa_flight_id ?? null,
    cancelled: f.cancelled === true,
    diverted: f.diverted === true,
    scheduledOut: f.scheduled_out ?? null,
    estimatedOut: f.estimated_out ?? null,
    actualOut: f.actual_out ?? null,
    scheduledIn: f.scheduled_in ?? null,
    estimatedIn: f.estimated_in ?? null,
    actualIn: f.actual_in ?? null,
    arrivalDelayMinutes: typeof f.arrival_delay === 'number' && Number.isFinite(f.arrival_delay) ? Math.round(f.arrival_delay / 60) : null,
  };
}

function delayOf(s: FlightSnapshot): number {
  if (s.arrivalDelayMinutes !== null) return s.arrivalDelayMinutes;
  const actualOrEstimated = s.actualIn ?? s.estimatedIn;
  if (!actualOrEstimated || !s.scheduledIn) return 0;
  return Math.round((new Date(actualOrEstimated).getTime() - new Date(s.scheduledIn).getTime()) / 60000);
}

function band(minutes: number): number {
  return [...DELAY_BANDS].reverse().find((b) => minutes >= b) ?? 0;
}

/**
 * One event per new fact, typed as the facts contract defines `event.type`:
 * - AeroAPI's `cancelled`: the booked flight is not operated, so a cancellation.
 * - A diversion: the flight operated and its travelers arrive late, so a delay whose length is not known yet.
 *   AeroAPI does not say whether the aircraft came back without continuing, which would be a cancellation.
 * - The same flight now scheduled to leave at least an hour from `bookedOut`: a schedule change, once per new time.
 * - A delay crossing a new band.
 */
export function classify(prev: FlightSnapshot | null, next: FlightSnapshot, bookedOut: string | null = null): FlightEvent | null {
  if (next.cancelled && !prev?.cancelled) return { type: 'cancellation', delayMinutes: null, dedupeSuffix: 'cancellation' };
  if (next.diverted && !prev?.diverted) return { type: 'delay', delayMinutes: null, dedupeSuffix: 'diversion' };
  const booked = bookedOut ? Date.parse(bookedOut) : null;
  const scheduled = next.scheduledOut ? Date.parse(next.scheduledOut) : null;
  const before = prev?.scheduledOut ? Date.parse(prev.scheduledOut) : null;
  if (booked !== null && scheduled !== null && scheduled !== before && Math.abs(scheduled - booked) >= RETIME_MINUTES * 60000) {
    return { type: 'schedule_change', delayMinutes: null, dedupeSuffix: `retime-${new Date(scheduled).toISOString()}` };
  }
  const delay = delayOf(next);
  const newBand = band(delay);
  if (newBand > 0 && newBand > band(prev ? delayOf(prev) : 0)) return { type: 'delay', delayMinutes: delay, dedupeSuffix: `delay-${newBand}` };
  return null;
}

export function flightEnded(s: FlightSnapshot): boolean {
  return s.cancelled || Boolean(s.actualIn);
}
