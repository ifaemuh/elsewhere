import { describe, expect, it } from 'vitest';
import { validateScreenshot } from '@/lib/bookings/screenshot';

describe('validateScreenshot', () => {
  it('accepts common image types under 4 MB', () => {
    expect(validateScreenshot(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))).toEqual({ ok: true, ext: 'png' });
    expect(validateScreenshot(new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }))).toEqual({ ok: true, ext: 'jpg' });
  });

  it('rejects other files and big uploads', () => {
    expect(validateScreenshot(new File(['x'], 'a.pdf', { type: 'application/pdf' })).ok).toBe(false);
    expect(validateScreenshot(new File([new Uint8Array(5 * 1024 * 1024)], 'a.png', { type: 'image/png' })).ok).toBe(false);
  });
});
