/** One line is capped at $100,000.00, matching the expenses and settlements check constraints. */
export const MAX_CENTS = 10_000_000;

export type Split = { kind: 'equal'; user_ids: string[] } | { kind: 'shares'; shares: Record<string, number> };

const isCents = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0;

/** Whole dollars and cents only ("$1,234.50", "12", "0.5"); no exponents, no signs, no float rounding. */
export function parseDollars(input: string): number | null {
  const text = input.trim().replace(/^\$/, '');
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ''] = text.replace(/,/g, '').split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_CENTS ? cents : null;
}

/** Throws RangeError when the amount or split cannot be settled to the cent. */
export function shareOf(amountCents: number, split: Split): Record<string, number> {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) throw new RangeError('amount must be whole cents between 1 and 10,000,000');
  if (split.kind === 'shares') {
    const entries = Object.entries(split.shares);
    if (entries.length === 0 || !entries.every(([, cents]) => isCents(cents))) throw new RangeError('shares must be whole, non-negative cents');
    if (entries.reduce((sum, [, cents]) => sum + cents, 0) !== amountCents) throw new RangeError('shares must add up to the amount');
    return { ...split.shares };
  }
  const n = split.user_ids.length;
  if (n === 0 || new Set(split.user_ids).size !== n) throw new RangeError('an equal split needs each person once');
  const base = Math.floor(amountCents / n);
  let remainder = amountCents - base * n;
  const shares: Record<string, number> = {};
  for (const id of split.user_ids) {
    shares[id] = base + (remainder > 0 ? 1 : 0);
    remainder -= 1;
  }
  return shares;
}

/** Positive = the group owes this person; negative = this person owes the group. Sums to zero. */
export function balances(
  expenses: { payer_user_id: string; amount_cents: number; split: Split }[],
  settlements: { from_user_id: string; to_user_id: string; amount_cents: number }[],
): Record<string, number> {
  const net: Record<string, number> = {};
  const add = (id: string, cents: number) => (net[id] = (net[id] ?? 0) + cents);
  for (const expense of expenses) {
    add(expense.payer_user_id, expense.amount_cents);
    for (const [id, share] of Object.entries(shareOf(expense.amount_cents, expense.split))) add(id, -share);
  }
  for (const s of settlements) {
    add(s.from_user_id, s.amount_cents);
    add(s.to_user_id, -s.amount_cents);
  }
  return net;
}

/**
 * Greedy largest-debtor to largest-creditor: at most n-1 transfers. Ties break on id, so the same balances give
 * the same transfers whatever order the keys were added in. Throws if the balances are not whole cents summing to zero.
 */
export function minimalTransfers(net: Record<string, number>): { from: string; to: string; amountCents: number }[] {
  const values = Object.values(net);
  if (!values.every(Number.isSafeInteger) || values.reduce((a, b) => a + b, 0) !== 0) throw new RangeError('balances must be whole cents that sum to zero');
  const debtors = Object.entries(net).filter(([, v]) => v < 0).map(([id, v]) => ({ id, amount: -v }));
  const creditors = Object.entries(net).filter(([, v]) => v > 0).map(([id, v]) => ({ id, amount: v }));
  const transfers: { from: string; to: string; amountCents: number }[] = [];
  const order = (a: { id: string; amount: number }, b: { id: string; amount: number }) => b.amount - a.amount || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  debtors.sort(order);
  creditors.sort(order);
  while (debtors.length > 0 && creditors.length > 0) {
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ from: debtor.id, to: creditor.id, amountCents: amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtors.shift();
    if (creditor.amount === 0) creditors.shift();
    // The leader's amount shrank, so it may no longer be the largest.
    debtors.sort(order);
    creditors.sort(order);
  }
  return transfers;
}
