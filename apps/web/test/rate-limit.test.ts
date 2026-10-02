import { afterEach, describe, expect, it, vi } from 'vitest';

const { checkRateLimit } = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
vi.mock('@vercel/firewall', () => ({ checkRateLimit }));
vi.mock('next/headers', () => ({ headers: async () => new Headers({ 'x-forwarded-for': '203.0.113.9' }) }));

import { rateLimited } from '@/lib/rate-limit';

afterEach(() => {
  delete process.env.VERCEL;
  checkRateLimit.mockReset();
  vi.restoreAllMocks();
});

describe('rateLimited', () => {
  it('limits nothing off Vercel, where there is no firewall', async () => {
    expect(await rateLimited('auth-code-send')).toBe(false);
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('asks the named firewall rule on Vercel, with the request headers', async () => {
    process.env.VERCEL = '1';
    checkRateLimit.mockResolvedValueOnce({ rateLimited: true });
    expect(await rateLimited('auth-code-send')).toBe(true);
    const [rule, options] = checkRateLimit.mock.calls[0];
    expect(rule).toBe('auth-code-send');
    expect(new Headers(options.headers).get('x-forwarded-for')).toBe('203.0.113.9');
  });

  it('treats a firewall block as limited', async () => {
    process.env.VERCEL = '1';
    checkRateLimit.mockResolvedValueOnce({ rateLimited: false, error: 'blocked' });
    expect(await rateLimited('trips-create')).toBe(true);
  });

  it('fails open, with a log, when the rule is missing or the firewall errors', async () => {
    process.env.VERCEL = '1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    checkRateLimit.mockResolvedValueOnce({ rateLimited: false, error: 'not-found' });
    expect(await rateLimited('trips-create')).toBe(false);
    checkRateLimit.mockRejectedValueOnce(new Error('network down'));
    expect(await rateLimited('trips-create')).toBe(false);
    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });
});
