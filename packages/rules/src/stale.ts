import type { Rule } from './schema';

export function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Verified or needs_review rules whose review_by falls on or before now + withinDays. */
export function rulesDueForReview(rules: Rule[], now: Date, withinDays: number): Rule[] {
  const cutoff = addDays(now.toISOString().slice(0, 10), withinDays);
  return rules
    .filter((r) => (r.status === 'verified' || r.status === 'needs_review') && r.review_by !== null && r.review_by <= cutoff)
    .sort((a, b) => (a.review_by ?? '').localeCompare(b.review_by ?? '') || a.id.localeCompare(b.id));
}

export function staleReport(rules: Rule[]): string {
  return rules.map((r) => `- [ ] \`${r.id}\` — ${r.title} (review by ${r.review_by})`).join('\n');
}
