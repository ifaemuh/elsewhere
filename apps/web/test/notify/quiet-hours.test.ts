import { describe, expect, it } from 'vitest';
import { isQuietHours, nextSendTime } from '@/lib/notify/quiet-hours';

describe('quiet hours', () => {
  it('treats 9pm to 8am local as quiet', () => {
    expect(isQuietHours(new Date('2026-11-04T03:00:00Z'), 'America/New_York')).toBe(true); // 10pm EST
    expect(isQuietHours(new Date('2026-11-04T15:00:00Z'), 'America/New_York')).toBe(false); // 10am EST
  });

  it('defers a quiet-hours send to 8am local', () => {
    const next = nextSendTime(new Date('2026-11-04T03:00:00Z'), 'America/New_York');
    expect(next.toISOString()).toBe('2026-11-04T13:00:00.000Z'); // 8am EST
  });

  it('leaves daytime sends alone', () => {
    const now = new Date('2026-11-04T15:00:00Z');
    expect(nextSendTime(now, 'America/New_York')).toEqual(now);
  });

  it('falls back to New York for a missing or invalid zone', () => {
    const night = new Date('2026-11-04T03:00:00Z');
    expect(isQuietHours(night, '')).toBe(true);
    expect(isQuietHours(night, 'Not/AZone')).toBe(true);
    expect(nextSendTime(night, 'Not/AZone').toISOString()).toBe('2026-11-04T13:00:00.000Z');
  });
});

describe('quiet hours across DST and odd offsets', () => {
  it('spring forward (2026-03-08, New York): 10pm EST Mar 7 waits for 8am, which is already EDT', () => {
    expect(nextSendTime(new Date('2026-03-08T03:00:00Z'), 'America/New_York').toISOString()).toBe('2026-03-08T12:00:00.000Z'); // 8am EDT
  });

  it('fall back (2026-11-01, New York): 11pm EDT Oct 31 waits for 8am EST', () => {
    expect(nextSendTime(new Date('2026-11-01T03:00:00Z'), 'America/New_York').toISOString()).toBe('2026-11-01T13:00:00.000Z'); // 8am EST
  });

  it('handles a half-hour zone (Asia/Kolkata, UTC+5:30)', () => {
    // 22:00 IST on Nov 4 = 16:30Z; next 8am IST = 02:30Z on Nov 5.
    expect(nextSendTime(new Date('2026-11-04T16:30:00Z'), 'Asia/Kolkata').toISOString()).toBe('2026-11-05T02:30:00.000Z');
    expect(isQuietHours(new Date('2026-11-04T06:00:00Z'), 'Asia/Kolkata')).toBe(false); // 11:30am
  });
});
