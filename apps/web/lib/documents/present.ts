import type { Rule } from '@elsewhere/rules/core';
import { PASSPORT_GAP_DETAIL, requiredMonths } from './check';
import { passportSentence, renewalAdvice, type RenewalRoute } from './deadlines';

const regionName = new Intl.DisplayNames(['en'], { type: 'region' });

interface StatusRow {
  result: 'ok' | 'action_needed' | 'unknown';
  rule_id: string | null;
  detail: string;
}

/** What the planner sees for one member. A member with no rows has not been checked, which is never "All clear". */
export function groupStatus(theirs: StatusRow[]): string {
  if (theirs.length === 0) return 'Not checked yet';
  if (theirs.some((c) => c.result === 'action_needed')) return 'Needs attention';
  if (theirs.some((c) => c.result === 'unknown' && c.rule_id === null && c.detail === PASSPORT_GAP_DETAIL)) return 'Passport not covered yet';
  if (theirs.some((c) => c.result === 'unknown' && c.rule_id === null)) return 'No verified rules for this trip yet';
  if (theirs.some((c) => c.result === 'unknown')) return 'Hasn’t confirmed yet';
  return 'All clear';
}

/** The "what to do by when" sentence belongs to a failing passport check only. */
export function renewalSentenceFor({
  check,
  rule,
  passport,
  trip,
  route,
  today,
}: {
  check: { result: StatusRow['result']; detail: string };
  rule: Rule | null;
  passport: { expires_on: string | null } | null;
  trip: { start_date: string | null; end_date: string | null; destination_country: string | null };
  route: RenewalRoute | undefined;
  today: Date;
}): string | null {
  if (check.result !== 'action_needed' || !rule?.tags.includes('passport') || !route) return null;
  const months = requiredMonths(rule);
  if (!months || !passport?.expires_on || !trip.start_date || !trip.end_date || !trip.destination_country) return null;
  return passportSentence({
    expiresOn: passport.expires_on,
    tripEnd: trip.end_date,
    requiredMonths: months,
    countryName: regionName.of(trip.destination_country) ?? trip.destination_country,
    advice: renewalAdvice(trip.start_date, route, today),
  });
}

/** An affiliate link is shown only with its label and FTC disclosure. */
export function affiliateOffer(route: RenewalRoute): { url: string; label: string; disclosure: string } | null {
  if (!route.affiliate_url || !route.affiliate_label || !route.affiliate_disclosure) return null;
  return { url: route.affiliate_url, label: route.affiliate_label, disclosure: route.affiliate_disclosure };
}
