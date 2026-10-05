import 'server-only';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { Resend } from 'resend';
import twilio from 'twilio';
import { appUrl, assertTestSeamAllowed, requireEnv } from '@/lib/env';

export interface Delivery {
  channel: 'email' | 'sms';
  to: string;
  subject: string | null;
  body: string;
}

/** Provider clients are built per call, so a missing key fails here by name and never at import time. */
export async function deliver(delivery: Delivery): Promise<{ providerMessageId: string }> {
  const outbox = process.env.ELSEWHERE_OUTBOX_DIR;
  if (outbox) {
    assertTestSeamAllowed('ELSEWHERE_OUTBOX_DIR');
    mkdirSync(outbox, { recursive: true });
    const providerMessageId = `outbox-${crypto.randomUUID()}`;
    appendFileSync(path.join(outbox, 'outbox.jsonl'), `${JSON.stringify({ ...delivery, providerMessageId })}\n`);
    return { providerMessageId };
  }
  if (delivery.channel === 'email') {
    const { data, error } = await new Resend(requireEnv('RESEND_API_KEY')).emails.send({
      from: requireEnv('EMAIL_FROM'),
      to: delivery.to,
      subject: delivery.subject ?? 'Elsewhere',
      text: delivery.body,
    });
    if (error || !data) {
      throw Object.assign(new Error(`email failed: ${error?.message ?? 'no id'}`), { statusCode: error?.statusCode ?? undefined });
    }
    return { providerMessageId: data.id };
  }
  const client = twilio(requireEnv('TWILIO_ACCOUNT_SID'), requireEnv('TWILIO_AUTH_TOKEN'));
  const message = await client.messages.create({
    messagingServiceSid: requireEnv('TWILIO_MESSAGING_SERVICE_SID'),
    to: delivery.to,
    body: delivery.body,
    statusCallback: `${appUrl()}/api/webhooks/twilio`,
  });
  return { providerMessageId: message.sid };
}
