import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { send, create } = vi.hoisted(() => ({ send: vi.fn(), create: vi.fn() }));
const clients: unknown[][] = [];
vi.mock('resend', () => ({
  Resend: class {
    constructor(key: string) {
      clients.push(['resend', key]);
    }
    emails = { send };
  },
}));
vi.mock('twilio', () => ({
  default: (sid: string, token: string) => {
    clients.push(['twilio', sid, token]);
    return { messages: { create } };
  },
}));

import { deliver } from '@/lib/notify/deliver';

beforeEach(() => {
  clients.length = 0;
  send.mockReset().mockResolvedValue({ data: { id: 'em_1' }, error: null });
  create.mockReset().mockResolvedValue({ sid: 'SM_1' });
  Object.assign(process.env, {
    RESEND_API_KEY: 're_key',
    EMAIL_FROM: 'Elsewhere <trips@x.test>',
    TWILIO_ACCOUNT_SID: 'AC1',
    TWILIO_AUTH_TOKEN: 'tok',
    TWILIO_MESSAGING_SERVICE_SID: 'MG1',
    NEXT_PUBLIC_APP_URL: 'https://app.x.test/',
  });
});

afterEach(() => {
  for (const k of ['RESEND_API_KEY', 'EMAIL_FROM', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_MESSAGING_SERVICE_SID']) delete process.env[k];
});

describe('deliver SDK path', () => {
  it('sends email through Resend with the configured from address', async () => {
    expect(await deliver({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'Body' })).toEqual({ providerMessageId: 'em_1' });
    expect(send).toHaveBeenCalledWith({ from: 'Elsewhere <trips@x.test>', to: 'a@x.test', subject: 'Hi', text: 'Body' });
  });

  it('sends SMS through the messaging service with the status callback', async () => {
    expect(await deliver({ channel: 'sms', to: '+15550000001', subject: null, body: 'Body' })).toEqual({ providerMessageId: 'SM_1' });
    expect(clients).toContainEqual(['twilio', 'AC1', 'tok']);
    expect(create).toHaveBeenCalledWith({
      messagingServiceSid: 'MG1',
      to: '+15550000001',
      body: 'Body',
      statusCallback: 'https://app.x.test/api/webhooks/twilio',
    });
  });

  it('carries the provider status code on an email error and never prints the key', async () => {
    send.mockResolvedValue({ data: null, error: { message: 'rate limited', statusCode: 429 } });
    const err = await deliver({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'B' }).catch((e) => e);
    expect(err.statusCode).toBe(429);
    expect(err.message).not.toContain('re_key');
  });

  it('names the missing variable without printing any key', async () => {
    delete process.env.EMAIL_FROM;
    const err = await deliver({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'B' }).catch((e) => e);
    expect(err.message).toMatch(/EMAIL_FROM/);
    expect(err.message).not.toContain('re_key');
  });
});
