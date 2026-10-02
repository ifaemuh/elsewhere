export function safeNext(value: string | null | undefined, fallback = '/trips'): string {
  if (!value || /[\x00-\x1f\x7f]/.test(value)) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  try {
    if (new URL(value, 'http://x').origin !== 'http://x') return fallback;
  } catch {
    return fallback;
  }
  return value;
}
