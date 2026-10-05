import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { OfferCard } from '@/components/offer/offer-card';

describe('OfferCard', () => {
  it('shows the price and links to the start flow for the rule', () => {
    const html = renderToStaticMarkup(<OfferCard ruleId="fixture-us-refund-cancelled-flight" priceLabel="$9" />);
    expect(html).toContain('Forward your group’s bookings and we’ll watch the trip.');
    expect(html).toContain('$9');
    expect(html).toContain('href="/start?rule=fixture-us-refund-cancelled-flight"');
    expect(html).toContain('We draft the messages; you send them.');
  });
});
