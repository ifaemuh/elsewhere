import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inserted, consentRows, notificationUpdates, dueRows } = vi.hoisted(() => ({
  inserted: [] as { channel: string; user_id: string }[],
  consentRows: [] as { user_id: string; revoked_at: string | null }[],
  notificationUpdates: [] as { id: string; values: unknown }[],
  dueRows: [] as unknown[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            in: async () => ({
              data: ['u1', 'u2', 'u3'].map((id) => ({ id, email: `${id}@x.test`, phone: '+15550000001', sms_opt_in: true, timezone: 'America/New_York' })),
              error: null,
            }),
          }),
        };
      }
      if (table === 'consents') {
        const filters: Record<string, unknown> = {};
        const builder: Record<string, unknown> = {
          in: () => builder,
          eq: (k: string, v: unknown) => ((filters[k] = v), builder),
          is: (k: string, v: unknown) => ((filters[k] = v), builder),
          then: (resolve: (v: unknown) => unknown) =>
            resolve({ data: consentRows.filter((c) => filters.revoked_at !== null || c.revoked_at === null), error: null }),
        };
        return { select: () => builder };
      }
      return {
        insert: async (rows: typeof inserted) => (inserted.push(...rows), { error: null }),
        select: () => {
          const b: Record<string, unknown> = {};
          b.eq = () => b;
          b.lte = () => b;
          b.order = () => b;
          b.limit = async () => ({ data: dueRows, error: null });
          return b;
        },
        update: (values: unknown) => ({ eq: async (_c: string, id: string) => (notificationUpdates.push({ id, values }), { error: null }) }),
      };
    },
  }),
}));
vi.mock('@/lib/notify/deliver', () => ({ deliver: vi.fn(async () => ({ providerMessageId: 'pm-1' })) }));

import { flushDue, queueNotifications } from '@/lib/notify/queue';

const input = { userIds: ['u1', 'u2', 'u3'], tripId: null, template: 'incident', rendered: { subject: 'S', text: 'T', sms: 'M' }, urgent: true };

beforeEach(() => {
  inserted.length = 0;
  consentRows.length = 0;
  notificationUpdates.length = 0;
  dueRows.length = 0;
  process.env.SMS_ENABLED = 'true';
});

describe('queueNotifications SMS consent', () => {
  it('texts only members with an unrevoked SMS consent row', async () => {
    consentRows.push({ user_id: 'u1', revoked_at: null }, { user_id: 'u2', revoked_at: '2026-01-01T00:00:00Z' });
    await queueNotifications(input, new Date('2026-11-04T15:00:00Z'));
    const sms = inserted.filter((r) => r.channel === 'sms').map((r) => r.user_id);
    expect(sms).toEqual(['u1']);
    expect(inserted.filter((r) => r.channel === 'email')).toHaveLength(3);
  });
});

describe('flushDue', () => {
  it('skips a queued SMS whose member has since opted out', async () => {
    dueRows.push({ id: 'n1', channel: 'sms', subject: null, body: 'M', profiles: { email: null, phone: '+15550000001', sms_opt_in: false } });
    expect(await flushDue()).toBe(0);
    expect(notificationUpdates).toEqual([{ id: 'n1', values: { status: 'skipped' } }]);
  });
});
