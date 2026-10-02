import { beforeEach, describe, expect, it, vi } from 'vitest';

const { inserted, consentRows, notificationUpdates, dueRows, deliverMock, state } = vi.hoisted(() => ({
  deliverMock: vi.fn(),
  state: { updateError: null as { message: string } | null },
  inserted: [] as { channel: string; user_id: string }[],
  consentRows: [] as { user_id: string; revoked_at: string | null }[],
  notificationUpdates: [] as { id: string; values: unknown }[],
  dueRows: [] as unknown[],
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    rpc: async () => ({ data: [...dueRows], error: null }),
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
        update: (values: unknown) => ({ eq: async (_c: string, id: string) => (notificationUpdates.push({ id, values }), { error: state.updateError }) }),
      };
    },
  }),
}));
vi.mock('@/lib/notify/deliver', () => ({ deliver: deliverMock }));

import { flushDue, queueNotifications } from '@/lib/notify/queue';

const input = { userIds: ['u1', 'u2', 'u3'], tripId: null, template: 'incident', rendered: { subject: 'S', text: 'T', sms: 'M' }, urgent: true };

beforeEach(() => {
  inserted.length = 0;
  consentRows.length = 0;
  notificationUpdates.length = 0;
  dueRows.length = 0;
  state.updateError = null;
  deliverMock.mockReset().mockResolvedValue({ providerMessageId: 'pm-1' });
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

const NOW = new Date('2026-11-04T15:00:00Z');
const row = (over: Record<string, unknown> = {}) => ({ id: 'n1', channel: 'email', subject: 'S', body: 'B', attempts: 0, email: 'a@x.test', phone: null, sms_opt_in: false, ...over });

describe('flushDue', () => {
  it('skips a claimed SMS whose member has since opted out', async () => {
    dueRows.push(row({ channel: 'sms', phone: '+15550000001', sms_opt_in: false }));
    expect(await flushDue(NOW)).toBe(0);
    expect(notificationUpdates).toEqual([{ id: 'n1', values: { status: 'skipped' } }]);
    expect(deliverMock).not.toHaveBeenCalled();
  });

  it('marks a delivered row sent with its provider id', async () => {
    dueRows.push(row());
    expect(await flushDue(NOW)).toBe(1);
    expect(notificationUpdates).toEqual([{ id: 'n1', values: { status: 'sent', provider_message_id: 'pm-1', attempts: 1 } }]);
  });

  it('requeues a transient failure with 5 min, 30 min, then 2 h backoff', async () => {
    for (const [attempts, delayMin] of [[0, 5], [1, 30], [2, 120]] as const) {
      notificationUpdates.length = 0;
      dueRows.length = 0;
      dueRows.push(row({ attempts }));
      deliverMock.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
      await flushDue(NOW);
      expect(notificationUpdates[0].values).toEqual({
        status: 'queued',
        attempts: attempts + 1,
        claimed_at: null,
        send_after: new Date(NOW.getTime() + delayMin * 60_000).toISOString(),
      });
    }
  });

  it('treats rate limits and network errors as transient', async () => {
    for (const err of [Object.assign(new Error('x'), { status: 429 }), Object.assign(new Error('x'), { statusCode: 500 }), new Error('fetch failed')]) {
      notificationUpdates.length = 0;
      dueRows.length = 0;
      dueRows.push(row());
      deliverMock.mockRejectedValueOnce(err);
      await flushDue(NOW);
      expect((notificationUpdates[0].values as { status: string }).status).toBe('queued');
    }
  });

  it('fails a row after the retries are used up', async () => {
    dueRows.push(row({ attempts: 3 }));
    deliverMock.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { status: 503 }));
    await flushDue(NOW);
    expect(notificationUpdates[0].values).toEqual({ status: 'failed', attempts: 4 });
  });

  it('fails a permanent 4xx immediately', async () => {
    dueRows.push(row());
    deliverMock.mockRejectedValueOnce(Object.assign(new Error('bad number'), { status: 400 }));
    await flushDue(NOW);
    expect(notificationUpdates[0].values).toEqual({ status: 'failed', attempts: 1 });
  });

  it('surfaces a failed status update instead of swallowing it', async () => {
    dueRows.push(row());
    state.updateError = { message: 'db down' };
    await expect(flushDue(NOW)).rejects.toThrow(/db down/);
  });
});
