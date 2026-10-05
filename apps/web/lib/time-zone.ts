/**
 * The canonical IANA name for a zone the runtime knows ("asia/kolkata" becomes "Asia/Kolkata"), or null. Names that ICU maps to a legacy alias keep the name given.
 * Offset forms such as "+05:30" or "-0800" are valid to Intl but are not zones, so they are refused.
 */
export function normalizeTimeZone(zone: string): string | null {
  try {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions().timeZone;
    if (resolved !== 'UTC' && !resolved.includes('/')) return null;
    // ICU resolves some names to legacy aliases (Asia/Calcutta, Europe/Kiev). When that happens the zone the
    // browser reported is the better name to keep; only a wrongly-cased one is fixed up.
    if (resolved.toLowerCase() === zone.toLowerCase()) return resolved;
    return zone === zone.toLowerCase() ? zone.replace(/(^|[/_])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase()) : zone;
  } catch {
    return null;
  }
}
