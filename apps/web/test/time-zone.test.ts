import { describe, expect, it } from 'vitest';
import { isValidTimeZone } from '@/lib/time-zone';

describe('isValidTimeZone', () => {
  it.each(['UTC', 'Asia/Kolkata', 'Europe/Kyiv', 'America/New_York'])('accepts %s', (zone) => {
    expect(isValidTimeZone(zone)).toBe(true);
  });
  it.each(['', 'Mars/Base', 'not a zone'])('rejects %j', (zone) => {
    expect(isValidTimeZone(zone)).toBe(false);
  });
});
