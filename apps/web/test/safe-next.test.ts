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

  it('falls back for control-character and backslash bypasses', () => {
    for (const v of ['/\t/evil.test', '/\n/evil.test', '/\r/evil.test', '/\t\\evil.test', '/\\evil.test', '/ok\n', '\t//evil.test']) {
      expect(safeNext(v)).toBe('/trips');
    }
  });

  it('falls back for dot-segment and backslash traversal that resolves to a protocol-relative path', () => {
    for (const v of ['/trips/../../\\evil.com', '/./\\evil.com', '/trips/..\\..\\evil.com', '/%2e%2e/%5cevil.com']) {
      const out = safeNext(v);
      expect(out.startsWith('//')).toBe(false);
      expect(out.includes('\\')).toBe(false);
    }
    expect(safeNext('/./\\evil.com')).toBe('/trips');
    // This one resolves to the path "//evil.com", so it falls back.
    expect(safeNext('/trips/../../\\evil.com')).toBe('/trips');
    // Others resolve to a plain same-origin path; the normalized path is returned, never the raw input.
    expect(safeNext('/trips/..\\..\\evil.com')).toBe('/evil.com');
  });

  it('returns the normalized path, search, and hash rather than the raw input', () => {
    expect(safeNext('/trips/a/../b?x=1#top')).toBe('/trips/b?x=1#top');
  });
});
