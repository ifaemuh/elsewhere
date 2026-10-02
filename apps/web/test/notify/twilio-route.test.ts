import twilio from 'twilio';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const updates: { table: string; values: unknown }[] = [];

/** A PostgREST-style builder: every filter returns itself, and awaiting it resolves { error: null }. */
function chain() {
  const builder: Record<string, unknown> = {};
  builder.eq = () => builder;
  builder.is = () => builder;
  builder.then = (resolve: (value: unknown) => unknown) => resolve({ error: null });
  return builder;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      update: (values: unknown) => {
        updates.push({ table, values });
        return chain();
      },
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: 'user-1' }, error: null }) }) }),
    }),
  }),
}));

beforeAll(() => {
  process.env.TWILIO_AUTH_TOKEN = 'tw-token';
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
});

beforeEach(() => {
  updates.length = 0;
});

function signedRequest(params: Record<string, string>, signature?: string) {
  const url = 'https://app.example.test/api/webhooks/twilio';
  const sig = signature ?? twilio.getExpectedTwilioSignature('tw-token', url, params);
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig },
    body: new URLSearchParams(params).toString(),
  });
}

describe('POST /api/webhooks/twilio', () => {
  it('rejects bad signatures with no side effects, even for STOP', async () => {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    expect((await POST(signedRequest({ MessageSid: 'SM1', MessageStatus: 'delivered' }, 'bad'))).status).toBe(403);
    expect((await POST(signedRequest({ From: '+15550000001', Body: 'STOP' }, 'bad'))).status).toBe(403);
    expect(updates).toEqual([]);
  });

  it('records delivery status', async () => {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    const res = await POST(signedRequest({ MessageSid: 'SM1', MessageStatus: 'delivered' }));
    expect(res.status).toBe(200);
    expect(updates).toContainEqual({ table: 'notifications', values: { status: 'delivered' } });
  });

  it('mirrors STOP to the profile and the consent record', async () => {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    await POST(signedRequest({ From: '+15550000001', OptOutType: 'STOP', Body: 'STOP' }));
    expect(updates).toContainEqual({ table: 'profiles', values: { sms_opt_in: false } });
    expect(updates.some((u) => u.table === 'consents')).toBe(true);
  });

  it('treats a plain STOP-keyword body as an opt-out even without OptOutType', async () => {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    await POST(signedRequest({ From: '+15550000001', Body: ' unsubscribe ' }));
    expect(updates).toContainEqual({ table: 'profiles', values: { sms_opt_in: false } });
  });

  it('does not opt out on an ordinary message', async () => {
    const { POST } = await import('@/app/api/webhooks/twilio/route');
    await POST(signedRequest({ From: '+15550000001', Body: 'please stop by the hotel' }));
    expect(updates).toEqual([]);
  });
});
