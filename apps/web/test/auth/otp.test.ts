import { describe, expect, it } from 'vitest';
import { parseEmail, parseOtpCode } from '@/lib/auth/otp';

describe('parseEmail', () => {
  it('lowercases and trims valid emails', () => {
    expect(parseEmail('  Pat@Example.TEST ')).toBe('pat@example.test');
  });

  it('rejects invalid input', () => {
    expect(parseEmail('pat@')).toBeNull();
    expect(parseEmail(null)).toBeNull();
  });
});

describe('parseOtpCode', () => {
  it('accepts 6 to 10 digits and ignores spaces', () => {
    expect(parseOtpCode('123 456')).toBe('123456');
    expect(parseOtpCode('12345')).toBeNull();
    expect(parseOtpCode('abcdef')).toBeNull();
  });
});
