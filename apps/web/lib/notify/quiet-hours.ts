import { normalizeTimeZone } from '@/lib/time-zone';

const QUIET_START = 21;
const QUIET_END = 8;
const DEFAULT_ZONE = 'America/New_York';

/** The member's stored zone, or New York when it is empty or not a real zone. */
function zoneOrDefault(timeZone: string | null | undefined): string {
  return (timeZone && normalizeTimeZone(timeZone)) || DEFAULT_ZONE;
}

export function localHour(date: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: zoneOrDefault(timeZone), hour: 'numeric', hourCycle: 'h23' }).format(date));
}

export function isQuietHours(date: Date, timeZone: string): boolean {
  const hour = localHour(date, timeZone);
  return hour >= QUIET_START || hour < QUIET_END;
}

/** Non-urgent messages wait for 8am local. Steps on the quarter hour, at most 12 hours ahead. */
export function nextSendTime(date: Date, timeZone: string): Date {
  if (!isQuietHours(date, timeZone)) return date;
  const quarter = 15 * 60 * 1000;
  let t = new Date(Math.ceil(date.getTime() / quarter) * quarter);
  for (let i = 0; i < 48 && isQuietHours(t, timeZone); i += 1) t = new Date(t.getTime() + quarter);
  return t;
}
