import { describe, expect, it } from 'vitest';
import { cashAppLink, isCashtag, isVenmoUsername, venmoLink } from '@/lib/expenses/pay-links';

describe('pay links', () => {
  it('prefills Venmo with the amount and note', () => {
    expect(venmoLink('pat-travels', 10000, 'Lisbon hotel')).toBe('https://venmo.com/pat-travels?txn=pay&amount=100.00&note=Lisbon%20hotel');
  });

  it('writes cents without floating-point drift', () => {
    expect(venmoLink('pat-travels', 5, 'x')).toContain('amount=0.05&');
    expect(venmoLink('pat-travels', 123456, 'x')).toContain('amount=1234.56&');
    expect(venmoLink('pat-travels', 1999, 'x')).toContain('amount=19.99&');
  });

  it('links a Cash App cashtag', () => {
    expect(cashAppLink('PatT')).toBe('https://cash.app/$PatT');
  });

  it('encodes a hostile note so it cannot add parameters or break out', () => {
    const link = venmoLink('pat-travels', 100, 'a&amount=1&txn=charge#frag?x=y\n"<b>');
    const url = new URL(link);
    expect(url.host).toBe('venmo.com');
    expect([...url.searchParams.keys()]).toEqual(['txn', 'amount', 'note']);
    expect(url.searchParams.get('txn')).toBe('pay');
    expect(url.searchParams.get('amount')).toBe('1.00');
    expect(url.searchParams.get('note')).toBe('a&amount=1&txn=charge#frag?x=y\n"<b>');
    expect(url.hash).toBe('');
  });

  it('survives a lone surrogate and caps the note', () => {
    expect(() => venmoLink('pat-travels', 100, 'ok \ud800 end')).not.toThrow();
    const long = new URL(venmoLink('pat-travels', 100, 'x'.repeat(500))).searchParams.get('note');
    expect(long).toHaveLength(140);
  });

  it.each(['evil.com/x', 'a b c d e', 'pat?x=1', 'pat@evil.com', '../x', 'abc', 'x'.repeat(31), '', 'pat/travels'])('rejects the Venmo username %j', (name) => {
    expect(isVenmoUsername(name)).toBe(false);
    expect(() => venmoLink(name, 100, 'n')).toThrow(RangeError);
  });

  it.each(['$Pat', 'Pat/../x', 'Pat?x=1', '1Pat', '', 'a'.repeat(21), 'Pat T', 'Pat@evil.com'])('rejects the cashtag %j', (tag) => {
    expect(isCashtag(tag)).toBe(false);
    expect(() => cashAppLink(tag)).toThrow(RangeError);
  });

  it.each([0, -5, 1.5, NaN, Infinity, 10_000_001])('rejects the amount %s', (amount) => {
    expect(() => venmoLink('pat-travels', amount, 'n')).toThrow(RangeError);
  });
});
