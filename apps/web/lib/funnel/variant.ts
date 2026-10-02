import { createHash } from 'node:crypto';

export const PRICE_EXPERIMENT_KEY = 'pass_price_v1';
export type PriceVariant = 'p9' | 'p19';
export const VARIANT_PRICE_CENTS: Record<PriceVariant, number> = { p9: 900, p19: 1900 };

/** Deterministic 50/50 split: the same visitor always sees the same price, with no lookup. */
export function assignVariant(anonymousId: string): PriceVariant {
  const digest = createHash('sha256').update(`${PRICE_EXPERIMENT_KEY}:${anonymousId}`).digest();
  return digest[0] % 2 === 0 ? 'p9' : 'p19';
}

export function variantPriceLabel(variant: PriceVariant): string {
  return `$${VARIANT_PRICE_CENTS[variant] / 100}`;
}
