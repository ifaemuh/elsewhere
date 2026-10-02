import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resend } from 'resend';
import { assertTestSeamAllowed, requireEnv } from '@/lib/env';

export interface InboundEmail {
  id: string;
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
  attachments: { filename: string | null; contentType: string; data: Uint8Array }[];
}

const USEFUL_ATTACHMENTS = /^(application\/pdf|image\/(png|jpeg|webp|gif))$/;
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Resend's webhook carries metadata only; the body and attachments come from its API. */
export async function fetchInboundEmail(emailId: string): Promise<InboundEmail> {
  const fixtureDir = process.env.ELSEWHERE_INBOUND_FIXTURE_DIR;
  if (fixtureDir) {
    assertTestSeamAllowed('ELSEWHERE_INBOUND_FIXTURE_DIR');
    const fixture = JSON.parse(readFileSync(path.join(fixtureDir, `${emailId}.json`), 'utf8')) as Omit<InboundEmail, 'attachments'> & {
      attachments?: { filename: string | null; contentType: string; base64: string }[];
    };
    return {
      ...fixture,
      attachments: (fixture.attachments ?? []).map((a) => ({ filename: a.filename, contentType: a.contentType, data: Buffer.from(a.base64, 'base64') })),
    };
  }

  const resend = new Resend(requireEnv('RESEND_API_KEY'));
  const { data, error } = await resend.emails.receiving.get(emailId);
  if (error || !data) throw new Error(`could not fetch inbound email ${emailId}: ${error?.message ?? 'empty'}`);
  const attachments: InboundEmail['attachments'] = [];
  for (const meta of data.attachments) {
    if (!USEFUL_ATTACHMENTS.test(meta.content_type) || meta.size > MAX_ATTACHMENT_BYTES) continue;
    const { data: attachment } = await resend.emails.receiving.attachments.get({ emailId, id: meta.id });
    if (!attachment) continue;
    const response = await fetch(attachment.download_url);
    if (response.ok) attachments.push({ filename: meta.filename, contentType: meta.content_type, data: new Uint8Array(await response.arrayBuffer()) });
  }
  return { id: data.id, from: data.from, subject: data.subject, text: data.text, html: data.html, attachments };
}
