const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mstr', 'dr', 'prof', 'mx']);

/** Short forms members join with, mapped to the legal first names they stand for. */
const SHORT_FORMS: Record<string, string[]> = {
  sam: ['samuel', 'samantha'],
  dan: ['daniel'],
  pat: ['patricia', 'patrick'],
  alex: ['alexander', 'alexandra'],
  ann: ['anne'],
};

export function splitName(name: string): { first: string; last: string } {
  const cleaned = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z/ '-]/g, ' ')
    .trim();
  if (cleaned.includes('/')) {
    const [last, rest] = cleaned.split('/', 2);
    const firstWords = rest.split(/\s+/).filter((word) => word && !TITLES.has(word));
    return { first: firstWords[0] ?? '', last: last.trim().split(/\s+/).pop() ?? '' };
  }
  const words = cleaned.split(/\s+/).filter((word) => word && !TITLES.has(word));
  return { first: words[0] ?? '', last: words.length > 1 ? words[words.length - 1] : '' };
}

function firstNamesAgree(passengerFirst: string, memberFirst: string): boolean {
  if (!passengerFirst || !memberFirst) return false;
  if (passengerFirst === memberFirst) return true;
  if (SHORT_FORMS[memberFirst]?.includes(passengerFirst)) return true;
  // A longer legal name that merely extends a 4+ letter member name ("Joan" / "Joanne"), by a few letters at most.
  return memberFirst.length >= 4 && passengerFirst.startsWith(memberFirst) && passengerFirst.length - memberFirst.length <= 4;
}

/**
 * Members join with informal names ("Sam"); tickets carry legal names ("JONES/SAMANTHA MS").
 * A match needs one unambiguous member and each member is assigned at most once; anything else is left for the planner.
 * A member without a last name, or a passenger without one, matches only on an exact first name.
 */
export function matchPassengers(
  passengers: string[],
  members: { id: string; display_name: string }[],
): { matched: Record<string, string>; unmatched: string[] } {
  const claims = new Map<string, string[]>();
  const unmatched = new Set<string>();
  for (const passenger of passengers) {
    const p = splitName(passenger);
    const candidates = members.filter((member) => {
      const m = splitName(member.display_name);
      if (m.last && p.last) return m.last === p.last && firstNamesAgree(p.first, m.first);
      return Boolean(m.first) && p.first === m.first;
    });
    if (candidates.length === 1) claims.set(candidates[0].id, [...(claims.get(candidates[0].id) ?? []), passenger]);
    else unmatched.add(passenger);
  }
  const matched: Record<string, string> = {};
  for (const [memberId, claimants] of claims) {
    if (claimants.length === 1) matched[claimants[0]] = memberId;
    else claimants.forEach((claimant) => unmatched.add(claimant));
  }
  return { matched, unmatched: passengers.filter((passenger) => unmatched.has(passenger)) };
}
