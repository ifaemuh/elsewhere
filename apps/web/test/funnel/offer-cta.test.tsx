import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const recordFunnelEvent = vi.fn();
vi.mock('@/app/actions/funnel', () => ({ recordFunnelEvent: (...a: unknown[]) => recordFunnelEvent(...a) }));

import { OfferCta } from '@/components/offer/offer-cta';

beforeEach(() => {
  recordFunnelEvent.mockReset();
  vi.stubGlobal('window', { location: { search: '?utm_source=tiktok&x=1' } });
});

// No DOM library is installed: OfferCta is hook-free, so call it and read the Link's onClick.
function linkProps() {
  const button = OfferCta({ ruleId: 'r1' }) as ReactElement<{ children: ReactElement<{ onClick: () => void; href: string }> }>;
  expect(isValidElement(button)).toBe(true);
  return button.props.children.props;
}

describe('OfferCta', () => {
  it('records offer_click exactly once per click and does not block navigation', () => {
    const props = linkProps();
    expect(props.href).toBe('/start?rule=r1');
    const result = (props.onClick as () => unknown)();
    expect(result).toBeUndefined();
    expect(recordFunnelEvent).toHaveBeenCalledTimes(1);
    expect(recordFunnelEvent).toHaveBeenCalledWith({
      event: 'offer_click',
      ruleId: 'r1',
      utm: { utm_source: 'tiktok', x: '1' },
    });
  });

  it('fires nothing until clicked', () => {
    linkProps();
    expect(recordFunnelEvent).not.toHaveBeenCalled();
  });
});
