export function safeNext(value: string | null | undefined, fallback = '/trips'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
