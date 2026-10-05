import { Webhook } from 'standardwebhooks';

export const TEST_WEBHOOK_SECRET = `whsec_${Buffer.from('elsewhere-test-secret-32-bytes!!').toString('base64')}`;

/** Signs a payload the way Resend does (Standard Webhooks, sent as svix-* headers). */
export function signStandardWebhook(payload: string, secret: string, id = `msg_${crypto.randomUUID()}`): Record<string, string> {
  const timestamp = new Date();
  return {
    'svix-id': id,
    'svix-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
    'svix-signature': new Webhook(secret).sign(id, timestamp, payload),
  };
}
