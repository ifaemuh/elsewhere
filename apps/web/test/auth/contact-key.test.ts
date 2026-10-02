import { createHash, createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { contactRateLimitKey, resetContactKeyWarning } from '@/lib/auth/contact-key';

afterEach(() => {
  delete process.env.RATE_LIMIT_KEY_SECRET;
  resetContactKeyWarning();
  vi.restoreAllMocks();
});

describe('contactRateLimitKey', () => {
  it('is an HMAC under the server secret', () => {
    process.env.RATE_LIMIT_KEY_SECRET = 'k';
    expect(contactRateLimitKey('pat@example.test')).toBe(createHmac('sha256', 'k').update('pat@example.test').digest('hex'));
    process.env.RATE_LIMIT_KEY_SECRET = 'other';
    expect(contactRateLimitKey('pat@example.test')).not.toBe(createHmac('sha256', 'k').update('pat@example.test').digest('hex'));
  });

  it('falls back to sha256 with a one-time warning when the secret is unset', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const expected = createHash('sha256').update('pat@example.test').digest('hex');
    expect(contactRateLimitKey('pat@example.test')).toBe(expected);
    expect(contactRateLimitKey('pat@example.test')).toBe(expected);
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
