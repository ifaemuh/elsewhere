import type { RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { configuredOffers, offersForRule } from '@/lib/affiliate/offers';
import { findMoneyRule, findRule, moneyRuleParams } from '@/lib/rules/accessors';

const library = fixture as unknown as RulesLibrary;

describe('configuredOffers', () => {
  it('includes only offers whose program URL is set', () => {
    const offers = configuredOffers({ AFFILIATE_CARD_URL: 'https://aff.example.test/card' });
    expect(offers.map((o) => o.id)).toEqual(['card']);
    expect(offers[0].href).toBe('https://aff.example.test/card');
  });

  it('ignores URLs that are not https', () => {
    expect(configuredOffers({ AFFILIATE_CARD_URL: 'http://aff.example.test/card' })).toEqual([]);
  });
});

describe('offersForRule', () => {
  it('matches offers to a rule by tag', () => {
    const offers = configuredOffers({
      AFFILIATE_CARD_URL: 'https://aff.example.test/card',
      AFFILIATE_SAFETYWING_URL: 'https://aff.example.test/sw',
    });
    expect(offersForRule(findRule(library, 'fixture-card-trip-delay')!, offers).map((o) => o.id)).toEqual(['card']);
    expect(offersForRule(findRule(library, 'fixture-us-real-id')!, offers)).toEqual([]);
  });
});

describe('money slugs', () => {
  it('only resolves verified money rules', () => {
    expect(findMoneyRule(library, 'fixture-card-trip-delay')?.id).toBe('fixture-card-trip-delay');
    expect(findMoneyRule(library, 'fixture-us-real-id')).toBeNull();
    expect(findMoneyRule(library, 'nope')).toBeNull();
  });

  it('keeps slugs inside the /r/ redirect charset', () => {
    for (const { slug } of moneyRuleParams(library)) expect(slug).toMatch(/^[a-z0-9-]{1,120}$/);
    expect(moneyRuleParams(library).map((p) => p.slug)).toContain('fixture-card-trip-delay');
  });

  it('yields a placeholder param when there are no money rules', () => {
    const empty = { ...library, rules: [] } as RulesLibrary;
    expect(moneyRuleParams(empty)).toHaveLength(1);
    expect(findMoneyRule(empty, moneyRuleParams(empty)[0].slug)).toBeNull();
  });
});
