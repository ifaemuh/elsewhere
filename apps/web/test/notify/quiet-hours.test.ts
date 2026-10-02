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
