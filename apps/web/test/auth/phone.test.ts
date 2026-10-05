import { describe, expect, it } from 'vitest';
import { parsePhone } from '@/lib/auth/phone';

describe('parsePhone', () => {
  it('normalizes US numbers to E.164', () => {
    expect(parsePhone('(555) 123-4567')).toBe('+15551234567');
    expect(parsePhone('1 555 123 4567')).toBe('+15551234567');
    expect(parsePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('rejects junk', () => {
    expect(parsePhone('12345')).toBeNull();
    expect(parsePhone('+0 123')).toBeNull();
    expect(parsePhone(null)).toBeNull();
  });
});
