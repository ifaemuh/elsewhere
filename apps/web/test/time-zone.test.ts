import { describe, expect, it } from 'vitest';
import { normalizeTimeZone } from '@/lib/time-zone';

describe('normalizeTimeZone', () => {
  it.each(['UTC', 'Asia/Kolkata', 'Europe/Kyiv', 'America/New_York'])('accepts %s', (zone) => {
    expect(normalizeTimeZone(zone)).toBe(zone);
  });
  it('returns the canonical casing', () => {
    expect(normalizeTimeZone('asia/kolkata')).toBe('Asia/Kolkata');
  });
  it.each(['', 'Mars/Base', 'not a zone', '+05:30', '-0800', '-08:00'])('rejects %j', (zone) => {
    expect(normalizeTimeZone(zone)).toBeNull();
  });
});
