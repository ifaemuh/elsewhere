const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
// Vercel caps a function request body at 4.5 MB; 4 MB leaves room for the rest of the form.
const MAX_BYTES = 4 * 1024 * 1024;

type Ext = 'png' | 'jpg' | 'webp';

function sniff(bytes: Uint8Array): Ext | null {
  const at = (offset: number, expected: number[]) => expected.every((b, i) => bytes[offset + i] === b);
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (at(0, [0xff, 0xd8, 0xff])) return 'jpg';
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'webp';
  return null;
}

/** The declared type is client-controlled, so the first bytes must agree with it. */
export async function validateScreenshot(file: File): Promise<{ ok: true; ext: Ext } | { ok: false; error: string }> {
  const ext = TYPES[file.type as keyof typeof TYPES];
  if (!ext) return { ok: false, error: 'Upload a PNG, JPEG, or WebP screenshot.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'That screenshot is over 4 MB. Crop it, or save it as a JPEG.' };
  if (sniff(new Uint8Array(await file.slice(0, 12).arrayBuffer())) !== ext) return { ok: false, error: 'That file is not a real PNG, JPEG, or WebP image.' };
  return { ok: true, ext };
}
