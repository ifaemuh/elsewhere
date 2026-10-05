export function safeNext(value: string | null | undefined, fallback = '/trips'): string {
  if (!value || /[\x00-\x1f\x7f]/.test(value)) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  try {
    // Resolve first: dot segments and backslashes can turn "/./\evil.com" into the path "//evil.com".
    const resolved = new URL(value, 'http://x');
    if (resolved.origin !== 'http://x' || resolved.pathname.startsWith('//') || resolved.pathname.includes('\\')) return fallback;
    return resolved.pathname + resolved.search + resolved.hash;
  } catch {
    return fallback;
  }
}
