import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
const set = vi.fn((k: string, v: string) => void store.set(k, v));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (store.has(k) ? { value: store.get(k) } : undefined), set }),
}));

const insert = vi.fn();
const upsert = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: (t: string) => (t === 'funnel_telemetry_events' ? { insert } : { upsert }) }),
}));

import { recordFunnelEvent } from '@/app/actions/funnel';
import { assignVariant } from '@/lib/funnel/variant';

const AID = 'a'.repeat(32);
const error = vi.spyOn(console, 'error').mockImplementation(() => {});

beforeEach(() => {
  store.clear();
  set.mockClear();
  insert.mockReset().mockResolvedValue({ error: null });
  upsert.mockReset().mockResolvedValue({ error: null });
  error.mockClear();
});

describe('recordFunnelEvent', () => {
  it('inserts the event with the assigned variant', async () => {
    store.set('elsewhere_aid', AID);
    await recordFunnelEvent({ event: 'offer_click', ruleId: 'r1' });
    expect(insert).toHaveBeenCalledWith({
      anonymous_id: AID,
      event_name: 'offer_click',
      rule_id: 'r1',
      variant: assignVariant(AID),
      user_id: null,
      trip_id: null,
      metadata: {},
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it('upserts the experiment assignment on a page view', async () => {
    store.set('elsewhere_aid', AID);
    await recordFunnelEvent({ event: 'rule_page_view', ruleId: 'r1' });
    expect(upsert).toHaveBeenCalledWith(
      { anonymous_id: AID, flag_key: 'pass_price_v1', variant: assignVariant(AID), user_id: null },
      { onConflict: 'anonymous_id,flag_key', ignoreDuplicates: true },
    );
  });

  it('logs an upsert error and an insert error', async () => {
    store.set('elsewhere_aid', AID);
    upsert.mockResolvedValue({ error: { message: 'boom' } });
    await recordFunnelEvent({ event: 'rule_page_view', ruleId: 'r1' });
    expect(error).toHaveBeenCalledWith('experiment assignment failed', 'boom');
    insert.mockResolvedValue({ error: { message: 'bad', code: '42000' } });
    await recordFunnelEvent({ event: 'offer_click', ruleId: 'r1' });
    expect(error).toHaveBeenCalledWith('funnel event failed', 'bad');
  });

  it('treats a duplicate page view (23505) as a quiet no-op', async () => {
    store.set('elsewhere_aid', AID);
    insert.mockResolvedValue({ error: { message: 'dup', code: '23505' } });
    await recordFunnelEvent({ event: 'rule_page_view', ruleId: 'r1' });
    expect(error).not.toHaveBeenCalled();
  });

  it('records and logs nothing without a valid anonymous id', async () => {
    await recordFunnelEvent({ event: 'rule_page_view', ruleId: 'r1' });
    store.set('elsewhere_aid', 'not-valid');
    await recordFunnelEvent({ event: 'rule_page_view', ruleId: 'r1' });
    expect(insert).not.toHaveBeenCalled();
    expect(upsert).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('stores fresh UTM in metadata and the cookie; reuses the cookie otherwise; drops unsafe values', async () => {
    store.set('elsewhere_aid', AID);
    await recordFunnelEvent({ event: 'offer_click', ruleId: 'r1', utm: { utm_source: 'tiktok', utm_medium: '<x>', ref: 'z' } });
    expect(insert.mock.calls[0][0].metadata).toEqual({ utm_source: 'tiktok' });
    expect(set).toHaveBeenCalledWith('elsewhere_utm', JSON.stringify({ utm_source: 'tiktok' }), expect.any(Object));

    set.mockClear();
    store.set('elsewhere_utm', JSON.stringify({ utm_campaign: 'c1' }));
    await recordFunnelEvent({ event: 'offer_click', ruleId: 'r1', utm: {} });
    expect(insert.mock.calls[1][0].metadata).toEqual({ utm_campaign: 'c1' });
    expect(set).not.toHaveBeenCalled();
  });

  it('rejects an offer_click without a rule id', async () => {
    store.set('elsewhere_aid', AID);
    await recordFunnelEvent({ event: 'offer_click', ruleId: null } as never);
    expect(insert).not.toHaveBeenCalled();
  });
});
