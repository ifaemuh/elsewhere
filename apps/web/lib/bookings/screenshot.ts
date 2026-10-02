const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const;
// Vercel caps a function request body at 4.5 MB; 4 MB leaves room for the rest of the form.
const MAX_BYTES = 4 * 1024 * 1024;

export function validateScreenshot(file: File): { ok: true; ext: 'png' | 'jpg' | 'webp' } | { ok: false; error: string } {
  const ext = TYPES[file.type as keyof typeof TYPES];
  if (!ext) return { ok: false, error: 'Upload a PNG, JPEG, or WebP screenshot.' };
  if (file.size > MAX_BYTES) return { ok: false, error: 'That screenshot is over 4 MB. Crop it, or save it as a JPEG.' };
  return { ok: true, ext };
}
