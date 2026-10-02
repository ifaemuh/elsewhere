const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mstr', 'dr', 'prof', 'mx']);

export function splitName(name: string): { first: string; last: string } {
  const cleaned = name.toLowerCase().replace(/[^a-z/ '-]/g, ' ').trim();
  if (cleaned.includes('/')) {
    const [last, rest] = cleaned.split('/', 2);
    const firstWords = rest.split(/\s+/).filter((word) => word && !TITLES.has(word));
    return { first: firstWords[0] ?? '', last: last.trim().split(/\s+/).pop() ?? '' };
  }
  const words = cleaned.split(/\s+/).filter((word) => word && !TITLES.has(word));
  return { first: words[0] ?? '', last: words.length > 1 ? words[words.length - 1] : '' };
}

/**
 * Members join with informal names ("Sam"); tickets carry legal names ("JONES/SAMANTHA MS").
 * A match needs one unambiguous member: an exact first-plus-last match, or a first-name prefix of 3+ letters.
 */
export function matchPassengers(
  passengers: string[],
  members: { id: string; display_name: string }[],
): { matched: Record<string, string>; unmatched: string[] } {
  const matched: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const passenger of passengers) {
    const p = splitName(passenger);
    const candidates = members.filter((member) => {
      const m = splitName(member.display_name);
      if (m.last && p.last) return m.last === p.last && (p.first.startsWith(m.first) || m.first.startsWith(p.first));
      return m.first.length >= 3 && (p.first === m.first || p.first.startsWith(m.first));
    });
    if (candidates.length === 1) matched[passenger] = candidates[0].id;
    else unmatched.push(passenger);
  }
  return { matched, unmatched };
}
