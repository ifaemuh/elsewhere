import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (store.has(k) ? { value: store.get(k) } : undefined) }),
}));

const insert = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => ({ insert }) }),
}));

import { recordOfferClickBackstop } from '@/lib/funnel/offer-click';
import { recordEvent } from '@/lib/funnel/events';
import { assignVariant } from '@/lib/funnel/variant';

const AID = 'b'.repeat(32);
const error = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  store.clear();
  insert.mockReset().mockResolvedValue({ error: null });
  error.mockClear();
});

describe('recordOfferClickBackstop', () => {
  it('records an offer_click with the variant and the stored UTM', async () => {
    store.set('elsewhere_aid', AID);
    store.set('elsewhere_utm', JSON.stringify({ utm_source: 'tiktok' }));
    await recordOfferClickBackstop('rule-1');
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ anonymous_id: AID, event_name: 'offer_click', rule_id: 'rule-1', variant: assignVariant(AID), metadata: { utm_source: 'tiktok' } }),
    );
  });

  it('does nothing without a rule, with an unsafe rule, or without a valid visitor id', async () => {
    store.set('elsewhere_aid', AID);
    await recordOfferClickBackstop(undefined);
    await recordOfferClickBackstop('<script>');
    store.set('elsewhere_aid', 'nope');
    await recordOfferClickBackstop('rule-1');
    expect(insert).not.toHaveBeenCalled();
  });

  it('treats the daily duplicate (23505) as a quiet no-op, so the client click and the backstop count once', async () => {
    store.set('elsewhere_aid', AID);
    insert.mockResolvedValue({ error: { message: 'dup', code: '23505' } });
    await recordOfferClickBackstop('rule-1');
    await recordEvent({ anonymousId: AID, event: 'offer_click', ruleId: 'rule-1' });
    expect(error).not.toHaveBeenCalled();
  });
});
