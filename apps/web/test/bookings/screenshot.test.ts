import { describe, expect, it } from 'vitest';
import { validateScreenshot } from '@/lib/bookings/screenshot';

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const JPG = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];
const file = (bytes: number[], type: string, extra = 0) => new File([new Uint8Array([...bytes, ...new Array(extra).fill(0)])], 'a', { type });

describe('validateScreenshot', () => {
  it('accepts common image types under 4 MB', async () => {
    expect(await validateScreenshot(file(PNG, 'image/png'))).toEqual({ ok: true, ext: 'png' });
    expect(await validateScreenshot(file(JPG, 'image/jpeg'))).toEqual({ ok: true, ext: 'jpg' });
    expect(await validateScreenshot(file(WEBP, 'image/webp'))).toEqual({ ok: true, ext: 'webp' });
  });

  it('rejects other files and big uploads', async () => {
    expect((await validateScreenshot(new File(['x'], 'a.pdf', { type: 'application/pdf' }))).ok).toBe(false);
    expect((await validateScreenshot(file(PNG, 'image/png', 5 * 1024 * 1024))).ok).toBe(false);
  });

  it('rejects a type that disagrees with the bytes, and a renamed text file', async () => {
    expect((await validateScreenshot(file(JPG, 'image/png'))).ok).toBe(false);
    expect((await validateScreenshot(file(PNG, 'image/webp'))).ok).toBe(false);
    expect((await validateScreenshot(new File(['hello, not an image'], 'a.png', { type: 'image/png' }))).ok).toBe(false);
  });
});
