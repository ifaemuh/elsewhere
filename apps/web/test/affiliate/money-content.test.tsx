import type { RulesLibrary } from '@elsewhere/rules/core';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/rules-library.json';
import { MoneyContent } from '@/components/money/money-content';
import { configuredOffers, FTC_DISCLOSURE } from '@/lib/affiliate/offers';
import { findRule } from '@/lib/rules/accessors';

const library = fixture as unknown as RulesLibrary;
const offers = configuredOffers({ AFFILIATE_CARD_URL: 'https://aff.example.test/card' });
const verified = findRule(library, 'fixture-card-trip-delay')!;
const reviewing = {
  ...verified,
  status: 'needs_review',
  history: [...verified.history, { version: 1, status: 'needs_review', date: '2026-10-20' }],
} as typeof verified;

describe('MoneyContent', () => {
  it('shows the disclosure before the first offer link on a verified rule', () => {
    const html = renderToStaticMarkup(<MoneyContent library={library} rule={verified} offers={offers} />);
    const disclosure = html.indexOf(FTC_DISCLOSURE.slice(0, 40));
    expect(disclosure).toBeGreaterThanOrEqual(0);
    expect(html.indexOf('rel="sponsored noopener"')).toBeGreaterThan(-1);
    expect(disclosure).toBeLessThan(html.indexOf('<a '));
  });

  it('pauses offers and the disclosure while a rule is being re-checked', () => {
    const html = renderToStaticMarkup(<MoneyContent library={library} rule={reviewing} offers={offers} />);
    expect(html).toContain('Being re-checked since');
    expect(html).toContain('Offers are paused while we re-check this rule.');
    expect(html).not.toContain('sponsored');
    expect(html).not.toContain(FTC_DISCLOSURE.slice(0, 40));
  });
});
