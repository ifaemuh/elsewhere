export const MINUTE = 60_000;
export const HOUR = 3600_000;

/** Polling never runs more than this long past the originally scheduled arrival, however late the flight is. */
const MAX_PAST_ARRIVAL = 48 * HOUR;
/** Polling continues this long after the latest known arrival, to see a late cancellation or the landing. */
const AFTER_ARRIVAL = 6 * HOUR;

/**
 * How long to wait before the next poll. With an alert, polling is a safety net: every 6h until T-6h, hourly after.
 * Without one it is the only source: every 2h, then every 30 minutes. After failed polls it backs off 5, 10, 20
 * minutes and so on, never beyond the normal interval.
 */
export function pollWait(state: 'monitoring' | 'polling_only', msBeforeDeparture: number, failures: number): number {
  const early = msBeforeDeparture > 6 * HOUR;
  const interval = state === 'monitoring' ? (early ? 6 * HOUR : HOUR) : early ? 2 * HOUR : 30 * MINUTE;
  return failures === 0 ? interval : Math.min(5 * MINUTE * 2 ** (failures - 1), interval);
}

/** The original stop is 6h after the scheduled arrival. A flight known to land later moves it to 6h after that, up to 48h past the schedule. */
export function nextStopAt(stopAt: number, scheduledEnd: number, latestArrival: string | null | undefined): number {
  const arrival = latestArrival ? Date.parse(latestArrival) : Number.NaN;
  if (Number.isNaN(arrival)) return stopAt;
  return Math.min(Math.max(stopAt, arrival + AFTER_ARRIVAL), scheduledEnd + MAX_PAST_ARRIVAL);
}
