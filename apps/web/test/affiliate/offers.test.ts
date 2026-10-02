import type { RulesLibrary } from '@elsewhere/rules/core';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { configuredOffers, offersForRule } from '@/lib/affiliate/offers';
import { findMoneyRule, findRule, moneyRuleParams, retiredRedirects } from '@/lib/rules/accessors';

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

  it.each(['javascript:alert(1)', 'https://', '', 'not a url'])('rejects %j', (value) => {
    expect(configuredOffers({ AFFILIATE_CARD_URL: value })).toEqual([]);
  });

  it('trims and accepts a padded https URL', () => {
    const offers = configuredOffers({ AFFILIATE_CARD_URL: '  https://x.test/a  ' });
    expect(offers.map((o) => o.href)).toEqual(['https://x.test/a']);
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

  it('maps travel-insurance to both SafetyWing and World Nomads', () => {
    const offers = configuredOffers({
      AFFILIATE_SAFETYWING_URL: 'https://aff.example.test/sw',
      AFFILIATE_WORLDNOMADS_URL: 'https://aff.example.test/wn',
    });
    const rule = { ...findRule(library, 'fixture-card-trip-delay')!, tags: ['travel-insurance'] };
    expect(offersForRule(rule, offers).map((o) => o.id)).toEqual(['safetywing', 'world-nomads']);
  });
});

describe('money slugs', () => {
  it('resolves verified and needs_review money rules, not drafts or retired', () => {
    const base = findRule(library, 'fixture-card-trip-delay')!;
    const lib = (status: string) => ({ ...library, rules: [{ ...base, status }] }) as unknown as RulesLibrary;
    expect(findMoneyRule(lib('needs_review'), base.id)).not.toBeNull();
    expect(moneyRuleParams(lib('needs_review'))[0].slug).toBe(base.id);
    expect(findMoneyRule(lib('draft'), base.id)).toBeNull();
    expect(findMoneyRule(lib('retired'), base.id)).toBeNull();
  });

  it('resolves verified money rules only within the money domain', () => {
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
    expect(moneyRuleParams(empty)[0].slug).toBe('no-money-rules');
    expect(findMoneyRule(library, 'no-money-rules')).toBeNull();
    expect(findMoneyRule(empty, 'no-money-rules')).toBeNull();
  });
});

describe('money redirects', () => {
  const base = findRule(library, 'fixture-card-trip-delay')!;
  const make = (rules: object[]) => ({ ...library, rules }) as unknown as RulesLibrary;
  const retired = { ...base, id: 'old-card', status: 'retired', replaced_by: 'new-card' };

  it('sends a retired money rule to its published money replacement', () => {
    const lib = make([retired, { ...base, id: 'new-card' }]);
    expect(retiredRedirects(lib)).toContainEqual({ source: '/money/old-card', destination: '/money/new-card', permanent: true });
  });

  it('falls back to /rules/<id> without a published money replacement', () => {
    expect(retiredRedirects(make([{ ...retired, replaced_by: undefined }]))).toContainEqual({
      source: '/money/old-card',
      destination: '/rules/old-card',
      permanent: true,
    });
    const lib = make([retired, { ...base, id: 'new-card', status: 'draft' }]);
    expect(retiredRedirects(lib)).toContainEqual({ source: '/money/old-card', destination: '/rules/old-card', permanent: true });
  });

  it('emits no money entries for non-money rules', () => {
    expect(retiredRedirects(library).some((r) => r.source.startsWith('/money/'))).toBe(false);
  });
});
