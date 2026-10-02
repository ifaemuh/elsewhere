import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { signStandardWebhook, TEST_WEBHOOK_SECRET } from '../helpers/webhooks';

const started: unknown[] = [];
const inserted: { table: string; row: Record<string, unknown> }[] = [];
const state: { insertError: { code: string; message: string } | null; existing: { id: string; status: string } | null; startFails: boolean } = {
  insertError: null,
  existing: null,
  startFails: false,
};

vi.mock('workflow/api', () => ({
  start: async (_workflow: unknown, args: unknown[]) => {
    if (state.startFails) throw new Error('queue unavailable');
    started.push(args);
    return { runId: 'wrun_test' };
  },
}));
vi.mock('@/workflows/intake', () => ({ intakeWorkflow: async () => undefined }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'trip_members'
            ? Promise.resolve({ data: [{ user_id: 'planner-1', role: 'planner', profiles: { email: 'pat@example.test' } }], error: null })
            : {
                maybeSingle: async () => ({
                  data: table === 'trips' ? { id: 'trip-1', name: 'Lisbon 2026' } : table === 'inbound_messages' ? state.existing : null,
                  error: null,
                }),
              },
      }),
      insert: (row: Record<string, unknown>) => {
        inserted.push({ table, row });
        const result = table === 'inbound_messages' && state.insertError ? { data: null, error: state.insertError } : { data: { id: 'msg-1' }, error: null };
        return { select: () => ({ single: async () => result }), then: (resolve: (v: unknown) => unknown) => resolve({ error: null }) };
      },
    }),
  }),
}));

beforeAll(() => {
  process.env.RESEND_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;
  process.env.RESEND_API_KEY = 're_test';
  process.env.INBOUND_DOMAIN = 'in.example.test';
});
beforeEach(() => {
  started.length = 0;
  inserted.length = 0;
  state.insertError = null;
  state.existing = null;
  state.startFails = false;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function event(from: string) {
  return JSON.stringify({
    type: 'email.received',
    created_at: '2026-10-05T12:00:00Z',
    data: {
      email_id: 'em_1',
      created_at: '2026-10-05T12:00:00Z',
      from,
      to: ['trip-abcdefghjkmn@in.example.test'],
      bcc: [],
      cc: [],
      received_for: ['trip-abcdefghjkmn@in.example.test'],
      message_id: '<m@x>',
      subject: 'Your TAP booking',
      attachments: [],
    },
  });
}

async function post(payload: string, headers: Record<string, string>) {
  const { POST } = await import('@/app/api/webhooks/inbound-email/route');
  return POST(new Request('https://app.example.test/api/webhooks/inbound-email', { method: 'POST', body: payload, headers }));
}

describe('POST /api/webhooks/inbound-email', () => {
  it('rejects unsigned payloads', async () => {
    expect((await post(event('Pat <pat@example.test>'), {})).status).toBe(401);
  });

  it('starts intake for mail from a trip member', async () => {
    const payload = event('Pat <pat@example.test>');
    const res = await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    expect(started).toEqual([['msg-1']]);
    expect(inserted.find((i) => i.table === 'inbound_messages')?.row).toMatchObject({ trip_id: 'trip-1', status: 'received', source: 'email' });
  });

  it('quarantines mail from anyone else and asks the planner', async () => {
    const payload = event('Mallory <mallory@example.test>');
    const res = await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    expect(started).toEqual([]);
    expect(inserted.find((i) => i.table === 'inbound_messages')?.row).toMatchObject({ status: 'quarantined' });
    expect(inserted.find((i) => i.table === 'action_items')?.row).toMatchObject({ source_kind: 'inbound_quarantine', assigned_user_ids: ['planner-1'] });
  });

  it('answers 500 when intake cannot start, so Resend retries', async () => {
    state.startFails = true;
    const payload = event('Pat <pat@example.test>');
    expect((await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET))).status).toBe(500);
  });

  it('starts intake on a retry whose message never left received', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value' };
    state.existing = { id: 'msg-1', status: 'received' };
    const payload = event('Pat <pat@example.test>');
    const res = await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET));
    expect(res.status).toBe(200);
    expect(started).toEqual([['msg-1']]);
  });

  it('ignores a retry that intake already handled', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value' };
    state.existing = { id: 'msg-1', status: 'parsed' };
    const payload = event('Pat <pat@example.test>');
    const res = await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET));
    expect(await res.json()).toEqual({ duplicate: 'em_1' });
    expect(started).toEqual([]);
  });

  it('answers 500, never accepting unsigned mail, when the webhook secret is not configured', async () => {
    const saved = process.env.RESEND_WEBHOOK_SECRET;
    delete process.env.RESEND_WEBHOOK_SECRET;
    try {
      const payload = event('Pat <pat@example.test>');
      expect((await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET))).status).toBe(500);
      expect((await post(payload, {})).status).toBe(500);
      expect(inserted).toEqual([]);
      expect(started).toEqual([]);
    } finally {
      process.env.RESEND_WEBHOOK_SECRET = saved;
    }
  });

  it('writes nothing for a bad signature or a tampered body', async () => {
    const payload = event('Pat <pat@example.test>');
    const headers = signStandardWebhook(payload, TEST_WEBHOOK_SECRET);
    expect((await post(payload.replace('TAP', 'XXX'), headers)).status).toBe(401);
    expect((await post(payload, { ...headers, 'svix-signature': 'v1,AAAA' })).status).toBe(401);
    expect(inserted).toEqual([]);
    expect(started).toEqual([]);
  });

  it('accepts webhook-* headers as well as svix-*', async () => {
    const payload = event('Pat <pat@example.test>');
    const signed = signStandardWebhook(payload, TEST_WEBHOOK_SECRET);
    const headers = Object.fromEntries(Object.entries(signed).map(([k, v]) => [k.replace('svix-', 'webhook-'), v]));
    expect((await post(payload, headers)).status).toBe(200);
  });

  it('starts intake once for a redelivery after a failed start', async () => {
    const payload = event('Pat <pat@example.test>');
    state.startFails = true;
    expect((await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET))).status).toBe(500);
    state.startFails = false;
    state.insertError = { code: '23505', message: 'duplicate key value' };
    state.existing = { id: 'msg-1', status: 'received' };
    expect((await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET))).status).toBe(200);
    expect(started).toEqual([['msg-1']]);
  });

  it('does not restart a message intake has claimed', async () => {
    state.insertError = { code: '23505', message: 'duplicate key value' };
    state.existing = { id: 'msg-1', status: 'processing' };
    const payload = event('Pat <pat@example.test>');
    const res = await post(payload, signStandardWebhook(payload, TEST_WEBHOOK_SECRET));
    expect(await res.json()).toEqual({ duplicate: 'em_1' });
    expect(started).toEqual([]);
  });
});
