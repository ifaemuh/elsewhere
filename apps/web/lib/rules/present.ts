import type { Rule } from '@elsewhere/rules';

export function humanizeKey(key: string): string {
  const words = key.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function entitlementLines(rule: Rule): string[] {
  return Object.entries(rule.entitlement.amount ?? {}).map(
    ([key, value]) => `${humanizeKey(key)}: ${Array.isArray(value) ? value.join(', ') : String(value)}`,
  );
}

export function formatIsoDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${iso.slice(0, 10)}T00:00:00Z`),
  );
}
