import type { LinkAttribution } from './types';

export function appOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export function sanitizeMedium(raw: string | null | undefined): string {
  const cleaned = (raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  return cleaned || 'unknown';
}

export function rulePageUrl(ruleId: string, attribution: LinkAttribution): string {
  const url = new URL(`/rules/${encodeURIComponent(ruleId)}`, `${appOrigin()}/`);
  url.searchParams.set('utm_source', attribution.source);
  url.searchParams.set('utm_medium', sanitizeMedium(attribution.medium));
  url.searchParams.set('utm_campaign', 'rules');
  return url.toString();
}
