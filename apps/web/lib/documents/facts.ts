import type { Situation } from '@elsewhere/rules/core';

export function monthsBetween(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso.slice(0, 10)}T00:00:00Z`);
  const to = new Date(`${toIso.slice(0, 10)}T00:00:00Z`);
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (months > 0 && to.getUTCDate() < from.getUTCDate()) months -= 1;
  if (months < 0 && to.getUTCDate() > from.getUTCDate()) months += 1;
  return months;
}

export interface DocumentInput {
  destinationCountry: string | null;
  tripEnd: string | null;
  passport: { issuingCountry: string | null; expiresOn: string | null } | null;
  realIdCompliant: boolean | null;
  domesticFlight: boolean | null;
}

/** Leaves a fact out when we don't know it, so matching reports "may apply" instead of guessing. */
export function documentSituation(input: DocumentInput): Situation {
  const situation: Situation = {};
  if (input.destinationCountry) situation['trip.destination_country'] = input.destinationCountry;
  if (input.passport?.issuingCountry) situation['passenger.nationality'] = input.passport.issuingCountry;
  if (input.passport?.expiresOn && input.tripEnd) {
    situation['passenger.passport_months_valid_after_return'] = monthsBetween(input.tripEnd, input.passport.expiresOn);
  }
  if (input.realIdCompliant !== null) situation['passenger.has_real_id'] = input.realIdCompliant;
  if (input.domesticFlight !== null) situation['flight.is_domestic_us'] = input.domesticFlight;
  return situation;
}
