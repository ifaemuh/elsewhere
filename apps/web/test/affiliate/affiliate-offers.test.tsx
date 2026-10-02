import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AffiliateOffers } from '@/components/money/affiliate-offers';
import { FTC_DISCLOSURE } from '@/lib/affiliate/offers';

describe('AffiliateOffers', () => {
  it('discloses the relationship and marks links as sponsored', () => {
    const html = renderToStaticMarkup(
      <AffiliateOffers offers={[{ id: 'card', label: 'Compare travel cards', href: 'https://aff.example.test/card', tags: ['card-benefit'], note: 'See rates and fees.' }]} />,
    );
    expect(html).toContain(FTC_DISCLOSURE.slice(0, 40));
    expect(html).toContain('rel="sponsored noopener"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('See rates and fees.');
  });

  it('renders nothing without offers', () => {
    expect(renderToStaticMarkup(<AffiliateOffers offers={[]} />)).toBe('');
  });
});
