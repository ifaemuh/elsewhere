/** True for any IANA zone the runtime knows, including canonical-only names like Asia/Kolkata and Europe/Kyiv. */
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
