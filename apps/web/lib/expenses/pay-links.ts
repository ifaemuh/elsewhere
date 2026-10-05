import { MAX_CENTS } from './settle';

// The same shapes the profiles check constraints enforce.
const VENMO = /^[A-Za-z0-9_-]{5,30}$/;
const CASHTAG = /^[A-Za-z][A-Za-z0-9]{0,19}$/;

export const isVenmoUsername = (value: unknown): value is string => typeof value === 'string' && VENMO.test(value);
export const isCashtag = (value: unknown): value is string => typeof value === 'string' && CASHTAG.test(value);

/** Throws when the username or amount is not the expected shape, so a stored value can never change the host or add parameters. */
export function venmoLink(username: string, amountCents: number, note: string): string {
  if (!isVenmoUsername(username)) throw new RangeError('not a Venmo username');
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CENTS) throw new RangeError('not a payable amount');
  const amount = `${Math.floor(amountCents / 100)}.${String(amountCents % 100).padStart(2, '0')}`;
  const text = Array.from(note.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '\ufffd')).slice(0, 140).join('');
  return `https://venmo.com/${username}?txn=pay&amount=${amount}&note=${encodeURIComponent(text)}`;
}

/** Cash App links cannot carry an amount, so the page shows it beside the link. */
export function cashAppLink(cashtag: string): string {
  if (!isCashtag(cashtag)) throw new RangeError('not a cashtag');
  return `https://cash.app/$${cashtag}`;
}
