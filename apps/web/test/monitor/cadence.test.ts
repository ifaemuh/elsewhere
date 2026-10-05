import { describe, expect, it } from 'vitest';
import { HOUR, MINUTE, nextStopAt, pollWait } from '@/lib/monitor/cadence';

describe('pollWait', () => {
  it('polls an alerted flight every 6h before T-6h, then hourly', () => {
    expect(pollWait('monitoring', 24 * HOUR, 0)).toBe(6 * HOUR);
    expect(pollWait('monitoring', 6 * HOUR + 1, 0)).toBe(6 * HOUR);
    expect(pollWait('monitoring', 6 * HOUR, 0)).toBe(HOUR);
    expect(pollWait('monitoring', -2 * HOUR, 0)).toBe(HOUR);
  });

  it('polls a flight without an alert every 2h, then every 30 minutes', () => {
    expect(pollWait('polling_only', 24 * HOUR, 0)).toBe(2 * HOUR);
    expect(pollWait('polling_only', 6 * HOUR, 0)).toBe(30 * MINUTE);
  });

  it('backs off 5, 10, 20 minutes after failures, never past the normal interval', () => {
    expect(pollWait('monitoring', 24 * HOUR, 1)).toBe(5 * MINUTE);
    expect(pollWait('monitoring', 24 * HOUR, 2)).toBe(10 * MINUTE);
    expect(pollWait('monitoring', 24 * HOUR, 3)).toBe(20 * MINUTE);
    expect(pollWait('polling_only', 2 * HOUR, 6)).toBe(30 * MINUTE);
  });
});

describe('nextStopAt', () => {
  const scheduledEnd = Date.parse('2026-11-04T06:35:00Z');
  const original = scheduledEnd + 6 * HOUR;

  it('keeps the original stop when the flight is on time or the arrival is unknown', () => {
    expect(nextStopAt(original, scheduledEnd, null)).toBe(original);
    expect(nextStopAt(original, scheduledEnd, new Date(scheduledEnd).toISOString())).toBe(original);
  });

  it('extends to the latest arrival plus 6h', () => {
    const arrival = scheduledEnd + 9 * HOUR;
    expect(nextStopAt(original, scheduledEnd, new Date(arrival).toISOString())).toBe(arrival + 6 * HOUR);
  });

  it('never shortens an extension, and caps at 48h past the scheduled arrival', () => {
    const extended = scheduledEnd + 20 * HOUR;
    expect(nextStopAt(extended, scheduledEnd, new Date(scheduledEnd + 2 * HOUR).toISOString())).toBe(extended);
    expect(nextStopAt(original, scheduledEnd, new Date(scheduledEnd + 100 * HOUR).toISOString())).toBe(scheduledEnd + 48 * HOUR);
  });

  it('ignores an unreadable arrival', () => {
    expect(nextStopAt(original, scheduledEnd, 'not a date')).toBe(original);
  });
});
