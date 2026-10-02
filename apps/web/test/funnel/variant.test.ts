import { describe, expect, it } from 'vitest';
import { newAnonymousId } from '@/lib/funnel/anonymous-id';
import { assignVariant, VARIANT_PRICE_CENTS, variantPriceLabel } from '@/lib/funnel/variant';

describe('assignVariant', () => {
  it('is stable for a visitor', () => {
    const id = newAnonymousId();
    expect(assignVariant(id)).toBe(assignVariant(id));
  });

  it('splits visitors roughly in half', () => {
    const counts = { p9: 0, p19: 0 };
    for (let i = 0; i < 2000; i += 1) counts[assignVariant(newAnonymousId())] += 1;
    expect(counts.p9 / 2000).toBeGreaterThan(0.45);
    expect(counts.p9 / 2000).toBeLessThan(0.55);
  });

  it('labels prices in dollars', () => {
    expect(variantPriceLabel('p9')).toBe('$9');
    expect(variantPriceLabel('p19')).toBe('$19');
  });
});

describe('pinned values', () => {
  it('keeps the salt stable: golden vectors', () => {
    expect(assignVariant('0'.repeat(32))).toBe('p9');
    expect(assignVariant('1'.repeat(32))).toBe('p19');
    expect(assignVariant('2'.repeat(32))).toBe('p9');
  });

  it('prices are integer cents', () => {
    expect(VARIANT_PRICE_CENTS).toEqual({ p9: 900, p19: 1900 });
  });
});
