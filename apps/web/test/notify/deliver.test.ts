import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { deliver } from '@/lib/notify/deliver';

afterEach(() => {
  delete process.env.ELSEWHERE_OUTBOX_DIR;
  delete process.env.VERCEL_ENV;
  delete process.env.RESEND_API_KEY;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
});

describe('deliver', () => {
  it('writes to the outbox seam instead of calling providers', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'outbox-'));
    process.env.ELSEWHERE_OUTBOX_DIR = dir;
    const result = await deliver({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'Body' });
    expect(result.providerMessageId).toMatch(/^outbox-/);
    const line = JSON.parse(readFileSync(path.join(dir, 'outbox.jsonl'), 'utf8').trim());
    expect(line).toMatchObject({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'Body' });
  });

  it('refuses the outbox seam in production', async () => {
    process.env.ELSEWHERE_OUTBOX_DIR = tmpdir();
    process.env.VERCEL_ENV = 'production';
    await expect(deliver({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'Body' })).rejects.toThrow(/test seam/);
  });

  it('names the missing env var for email and never needs a network call', async () => {
    await expect(deliver({ channel: 'email', to: 'a@x.test', subject: 'Hi', body: 'Body' })).rejects.toThrow(/RESEND_API_KEY/);
  });

  it('names the missing env var for SMS', async () => {
    await expect(deliver({ channel: 'sms', to: '+15550000001', subject: null, body: 'Body' })).rejects.toThrow(/TWILIO_ACCOUNT_SID/);
  });
});
