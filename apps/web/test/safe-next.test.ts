import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/auth/safe-next';

describe('safeNext', () => {
  it('keeps same-site relative paths', () => {
    expect(safeNext('/trips/new')).toBe('/trips/new');
  });

  it('falls back for absolute, protocol-relative, and backslash paths', () => {
    expect(safeNext('https://evil.test')).toBe('/trips');
    expect(safeNext('//evil.test')).toBe('/trips');
    expect(safeNext('/\\evil.test')).toBe('/trips');
    expect(safeNext(null)).toBe('/trips');
    expect(safeNext('', '/start')).toBe('/start');
  });
});
