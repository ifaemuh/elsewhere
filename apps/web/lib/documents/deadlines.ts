import { formatIsoDate } from '@/lib/rules/present';
import { monthsBetween } from './facts';

export interface RenewalRoute {
  official_label: string;
  official_url: string;
  official_note: string | null;
  routine_processing_days: number | null;
  expedited_processing_days: number | null;
  affiliate_label: string | null;
  affiliate_url: string | null;
  affiliate_disclosure: string | null;
}

export type RenewalAdvice = { kind: 'routine'; renewBy: string } | { kind: 'expedited'; renewBy: string } | { kind: 'urgent' };

function minusDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function renewalAdvice(departureDate: string, route: RenewalRoute, today: Date): RenewalAdvice {
  const now = today.toISOString().slice(0, 10);
  if (route.routine_processing_days) {
    const routineBy = minusDays(departureDate, route.routine_processing_days);
    if (now <= routineBy) return { kind: 'routine', renewBy: routineBy };
  }
  if (route.expedited_processing_days) {
    const expeditedBy = minusDays(departureDate, route.expedited_processing_days);
    if (now <= expeditedBy) return { kind: 'expedited', renewBy: expeditedBy };
  }
  return { kind: 'urgent' };
}

export function passportSentence({
  expiresOn,
  tripEnd,
  requiredMonths,
  countryName,
  advice,
}: {
  expiresOn: string;
  tripEnd: string;
  requiredMonths: number;
  countryName: string;
  advice: RenewalAdvice;
}): string {
  const months = monthsBetween(tripEnd, expiresOn);
  const problem =
    months < 0
      ? `Your passport expires before the trip ends; ${countryName} needs ${requiredMonths} months after you leave.`
      : `Your passport expires ${months} month${months === 1 ? '' : 's'} after the trip; ${countryName} needs ${requiredMonths}.`;
  const action =
    advice.kind === 'routine'
      ? `Renew online by ${formatIsoDate(advice.renewBy)} to make routine processing.`
      : advice.kind === 'expedited'
        ? `Routine processing won’t make it. Ask for expedited service by ${formatIsoDate(advice.renewBy)}.`
        : 'Standard processing is too slow now. You need an urgent option.';
  return `${problem} ${action}`;
}

