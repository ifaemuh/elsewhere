import 'server-only';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Resend } from 'resend';
import { assertTestSeamAllowed, requireEnv } from '@/lib/env';
import { IMAGE_TYPES, MAX_FILE_BYTES, MAX_IMAGES, MAX_PDFS, PDF_TYPES } from './extract';

export interface InboundEmail {
  id: string;
  from: string;
  subject: string;
  text: string | null;
  html: string | null;
  /** Only the attachments within Task 3's limits; nothing else is downloaded or stored. */
  attachments: { filename: string | null; contentType: string; data: Uint8Array }[];
  /** Why attachments were dropped. Generic text only, never email content. */
  problems: string[];
}

/** A malformed or unknown message id, a missing fixture, or an email Resend says does not exist. Retrying cannot fix it. */
export class InboundSourceError extends Error {}

const EMAIL_ID = /^[A-Za-z0-9_-]{1,100}$/;

/** Counts kept files per kind so the caps hold whatever order the attachments arrive in. */
export function attachmentBudget() {
  const kept = { image: 0, PDF: 0 };
  return {
    /** Why this file cannot be kept (before download, from declared metadata), or null if it can. */
    reject(contentType: string, declaredSize: number | null): string | null {
      const type = contentType.toLowerCase();
      const label = IMAGE_TYPES.has(type) ? 'image' : PDF_TYPES.has(type) ? 'PDF' : null;
      if (!label) return 'an attachment was skipped: unsupported type';
      if (declaredSize !== null && declaredSize > MAX_FILE_BYTES) return `${label === 'image' ? 'an image' : 'a PDF'} was skipped: larger than 4 MB`;
      if (kept[label] >= (label === 'image' ? MAX_IMAGES : MAX_PDFS)) return `${label === 'image' ? 'an image' : 'a PDF'} was skipped: more than ${label === 'image' ? MAX_IMAGES : MAX_PDFS} attached`;
      return null;
    },
    /** Re-checks the real size after download: the declared one is not trusted. Counts the file if it is kept. */
    accept(contentType: string, data: Uint8Array): string | null {
      const label = IMAGE_TYPES.has(contentType.toLowerCase()) ? 'image' : 'PDF';
      if (data.byteLength > MAX_FILE_BYTES) return `${label === 'image' ? 'an image' : 'a PDF'} was skipped: larger than 4 MB`;
      kept[label] += 1;
      return null;
    },
  };
}

/** Resend's webhook carries metadata only; the body and attachments come from its API. */
export async function fetchInboundEmail(emailId: string): Promise<InboundEmail> {
  if (!EMAIL_ID.test(emailId)) throw new InboundSourceError('invalid inbound email id');
  const budget = attachmentBudget();
  const attachments: InboundEmail['attachments'] = [];
  const problems: string[] = [];

  const fixtureDir = process.env.ELSEWHERE_INBOUND_FIXTURE_DIR;
  if (fixtureDir) {
    assertTestSeamAllowed('ELSEWHERE_INBOUND_FIXTURE_DIR');
    let fixture: Omit<InboundEmail, 'attachments' | 'problems'> & { attachments?: { filename: string | null; contentType: string; base64: string }[] };
    try {
      fixture = JSON.parse(readFileSync(path.join(fixtureDir, `${emailId}.json`), 'utf8'));
    } catch {
      throw new InboundSourceError(`no fixture for ${emailId}`);
    }
    for (const a of fixture.attachments ?? []) {
      const data = new Uint8Array(Buffer.from(a.base64, 'base64'));
      const reason = budget.reject(a.contentType, data.byteLength) ?? budget.accept(a.contentType, data);
      if (reason) problems.push(reason);
      else attachments.push({ filename: a.filename, contentType: a.contentType, data });
    }
    return { id: fixture.id, from: fixture.from, subject: fixture.subject, text: fixture.text, html: fixture.html, attachments, problems };
  }

  const resend = new Resend(requireEnv('RESEND_API_KEY'));
  const { data, error } = await resend.emails.receiving.get(emailId);
  if (error || !data) {
    // A 4xx other than rate limiting or a timeout will not change on retry; a 5xx or a network failure will.
    const status = error?.statusCode ?? 0;
    const permanent = status >= 400 && status < 500 && status !== 408 && status !== 429;
    throw new (permanent ? InboundSourceError : Error)(`could not fetch inbound email: ${error?.message ?? 'empty'}`);
  }
  for (const meta of data.attachments) {
    const early = budget.reject(meta.content_type, meta.size);
    if (early) {
      problems.push(early);
      continue;
    }
    const { data: attachment } = await resend.emails.receiving.attachments.get({ emailId, id: meta.id });
    if (!attachment) {
      problems.push('an attachment was skipped: could not be downloaded');
      continue;
    }
    const response = await fetch(attachment.download_url);
    if (!response.ok) {
      problems.push('an attachment was skipped: could not be downloaded');
      continue;
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const late = budget.accept(meta.content_type, bytes);
    if (late) problems.push(late);
    else attachments.push({ filename: meta.filename, contentType: meta.content_type, data: bytes });
  }
  return { id: data.id, from: data.from, subject: data.subject, text: data.text, html: data.html, attachments, problems };
}
