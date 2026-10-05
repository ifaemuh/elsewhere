import { beforeEach, describe, expect, it, vi } from 'vitest';

const insert = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (t: string) => ({ insert: (row: unknown) => insert(t, row) }) }) }));

beforeEach(() => {
  insert.mockReset();
  delete process.env.ELSEWHERE_ENABLE_FUNNEL_TELEMETRY;
});

const input = { anonymousId: 'a'.repeat(32), tripId: 'trip-1', variant: 'p9', amountCents: 900, utm: { utm_source: 'tiktok' } };

describe('supabasePassStore.recordPaid', () => {
  it('writes the paid funnel row with the amount and utm', async () => {
    insert.mockResolvedValue({ error: null });
    const { supabasePassStore } = await import('@/lib/payments/pass-store');
    await supabasePassStore().recordPaid(input);
    expect(insert).toHaveBeenCalledWith('funnel_telemetry_events', {
      anonymous_id: input.anonymousId,
      event_name: 'paid',
      rule_id: null,
      variant: 'p9',
      user_id: null,
      trip_id: 'trip-1',
      metadata: { amount_cents: 900, utm_source: 'tiktok' },
    });
  });

  it('treats a unique violation as already recorded', async () => {
    insert.mockResolvedValue({ error: { code: '23505', message: 'duplicate' } });
    const { supabasePassStore } = await import('@/lib/payments/pass-store');
    await expect(supabasePassStore().recordPaid(input)).resolves.toBeUndefined();
  });

  it('throws on any other error so Stripe retries', async () => {
    insert.mockResolvedValue({ error: { code: '08006', message: 'connection lost' } });
    const { supabasePassStore } = await import('@/lib/payments/pass-store');
    await expect(supabasePassStore().recordPaid(input)).rejects.toThrow('connection lost');
  });
});
