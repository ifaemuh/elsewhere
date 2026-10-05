import { afterEach, describe, expect, it } from 'vitest';
import { appUrl, assertTestSeamAllowed, requireEnv } from '@/lib/env';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('requireEnv', () => {
  it('returns the value when set', () => {
    process.env.SOME_KEY = 'abc';
    expect(requireEnv('SOME_KEY')).toBe('abc');
  });

  it('throws a named error when missing', () => {
    delete process.env.SOME_KEY;
    expect(() => requireEnv('SOME_KEY')).toThrow('Missing required environment variable SOME_KEY');
  });
});

describe('appUrl', () => {
  it('strips trailing slashes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.test//';
    expect(appUrl()).toBe('https://example.test');
  });
});

describe('assertTestSeamAllowed', () => {
  it('allows seams outside production', () => {
    process.env.VERCEL_ENV = 'preview';
    expect(() => assertTestSeamAllowed('ELSEWHERE_OUTBOX_DIR')).not.toThrow();
  });

  it('refuses seams in production', () => {
    process.env.VERCEL_ENV = 'production';
    expect(() => assertTestSeamAllowed('ELSEWHERE_OUTBOX_DIR')).toThrow(/test seam/);
  });
});
