import { describe, expect, it } from 'vitest';
import { balances, minimalTransfers, parseDollars, shareOf, type Split } from '@/lib/expenses/settle';

describe('shareOf', () => {
  it('splits equally and hands leftover cents to the first people listed', () => {
    expect(shareOf(1000, { kind: 'equal', user_ids: ['a', 'b', 'c'] })).toEqual({ a: 334, b: 333, c: 333 });
  });

  it('uses explicit shares', () => {
    expect(shareOf(1000, { kind: 'shares', shares: { a: 700, b: 300 } })).toEqual({ a: 700, b: 300 });
  });

  it('rejects shares that do not add up, are negative, fractional or empty', () => {
    for (const shares of [{ a: 700, b: 299 } as Record<string, number>, { a: 700, b: 301 }, { a: 1100, b: -100 }, { a: 500.5, b: 499.5 }, {} as Record<string, number>]) {
      expect(() => shareOf(1000, { kind: 'shares', shares })).toThrow(RangeError);
    }
  });

  it('rejects an empty or repeated equal split', () => {
    expect(() => shareOf(1000, { kind: 'equal', user_ids: [] })).toThrow(RangeError);
    expect(() => shareOf(1000, { kind: 'equal', user_ids: ['a', 'a'] })).toThrow(RangeError);
  });

  it.each([0, -1, 1.5, NaN, 10_000_001])('rejects the amount %s', (amount) => {
    expect(() => shareOf(amount, { kind: 'equal', user_ids: ['a'] })).toThrow(RangeError);
  });
});

describe('parseDollars', () => {
  it.each([
    ['$186.40', 18640],
    ['12', 1200],
    ['0.5', 50],
    ['1,234.50', 123450],
    [' $0.01 ', 1],
    ['100000', 10_000_000],
  ])('reads %j as %d cents', (text, cents) => expect(parseDollars(text)).toBe(cents));

  it.each(['', '0', '0.00', '-5', '1e3', '1.234', 'abc', '1,23', '$$5', '100000.01', '9999999999999999999', 'NaN', 'Infinity', '5.'])('rejects %j', (text) => {
    expect(parseDollars(text)).toBeNull();
  });
});

describe('balances and minimalTransfers', () => {
  it('nets expenses and settlements into the fewest transfers', () => {
    const net = balances(
      [
        { payer_user_id: 'pat', amount_cents: 30000, split: { kind: 'equal', user_ids: ['pat', 'sam', 'jo'] } },
        { payer_user_id: 'sam', amount_cents: 6000, split: { kind: 'equal', user_ids: ['pat', 'sam', 'jo'] } },
      ],
      [{ from_user_id: 'jo', to_user_id: 'pat', amount_cents: 2000 }],
    );
    expect(net).toEqual({ pat: 16000, sam: -6000, jo: -10000 });
    expect(minimalTransfers(net)).toEqual([
      { from: 'jo', to: 'pat', amountCents: 10000 },
      { from: 'sam', to: 'pat', amountCents: 6000 },
    ]);
  });

  it('is square when nothing is owed', () => {
    expect(minimalTransfers({})).toEqual([]);
    expect(minimalTransfers({ a: 0, b: 0 })).toEqual([]);
  });

  it('refuses balances that do not sum to zero or are not whole cents', () => {
    expect(() => minimalTransfers({ a: 100, b: -99 })).toThrow(RangeError);
    expect(() => minimalTransfers({ a: 100.5, b: -100.5 })).toThrow(RangeError);
  });
});

// mulberry32: a small seeded generator, so a failure is reproducible.
function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('property: random ledgers', () => {
  for (let seed = 1; seed <= 200; seed++) {
    it(`seed ${seed} settles to zero with no excess transfers`, () => {
      const rand = rng(seed);
      const pick = (n: number) => Math.floor(rand() * n);
      const people = Array.from({ length: 2 + pick(7) }, (_, i) => `u${i}`);
      const expenses = Array.from({ length: pick(12) }, () => {
        const amount = 1 + pick(500_000);
        const group = people.filter(() => rand() < 0.6);
        const members = group.length > 0 ? group : [people[0]];
        let split: Split = { kind: 'equal', user_ids: members };
        if (rand() < 0.3) {
          const shares: Record<string, number> = {};
          let left = amount;
          members.forEach((id, i) => {
            const part = i === members.length - 1 ? left : pick(left + 1);
            shares[id] = part;
            left -= part;
          });
          split = { kind: 'shares', shares };
        }
        return { payer_user_id: people[pick(people.length)], amount_cents: amount, split };
      });
      const settlements = Array.from({ length: pick(4) }, () => {
        const from = people[pick(people.length)];
        const to = people.filter((p) => p !== from)[pick(people.length - 1)];
        return { from_user_id: from, to_user_id: to, amount_cents: 1 + pick(10_000) };
      });

      const net = balances(expenses, settlements);
      expect(Object.values(net).reduce((a, b) => a + b, 0)).toBe(0);

      const transfers = minimalTransfers(net);
      const after = { ...net };
      for (const t of transfers) {
        expect(t.amountCents).toBeGreaterThan(0);
        expect(Number.isInteger(t.amountCents)).toBe(true);
        expect(net[t.from]).toBeLessThan(0);
        expect(net[t.to]).toBeGreaterThan(0);
        after[t.from] += t.amountCents;
        after[t.to] -= t.amountCents;
      }
      for (const id of Object.keys(after)) expect(after[id]).toBe(0);

      // No more transfers than needed: at most (people with a balance) - 1, and nobody pays and receives.
      const open = Object.values(net).filter((v) => v !== 0).length;
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, open - 1));
      expect(transfers.some((t) => transfers.some((u) => u.from === t.to))).toBe(false);
      // Total moved is exactly what is owed: never more than needed.
      const owed = Object.values(net).filter((v) => v < 0).reduce((a, b) => a - b, 0);
      expect(transfers.reduce((a, t) => a + t.amountCents, 0)).toBe(owed);

      // Deterministic: the same balances in a different key order give the same transfers.
      const reversed = Object.fromEntries(Object.entries(net).reverse());
      expect(minimalTransfers(reversed)).toEqual(transfers);
      expect(minimalTransfers(net)).toEqual(transfers);
    });
  }
});
