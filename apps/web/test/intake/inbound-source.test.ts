import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { attachmentBudget, fetchInboundEmail } from '@/lib/intake/inbound-source';

afterEach(() => vi.unstubAllEnvs());

describe('fetchInboundEmail fixture seam', () => {
  it('reads a fixture and decodes its attachments', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'inbound-'));
    writeFileSync(
      path.join(dir, 'em_1.json'),
      JSON.stringify({ id: 'em_1', from: 'pat@example.test', subject: 'Trip', text: 'hi', html: null, attachments: [{ filename: 'a.pdf', contentType: 'application/pdf', base64: Buffer.from('pdf').toString('base64') }] }),
    );
    vi.stubEnv('ELSEWHERE_INBOUND_FIXTURE_DIR', dir);
    const email = await fetchInboundEmail('em_1');
    expect(email.subject).toBe('Trip');
    expect(Buffer.from(email.attachments[0].data).toString()).toBe('pdf');
  });

  it('refuses the fixture seam in production', async () => {
    vi.stubEnv('ELSEWHERE_INBOUND_FIXTURE_DIR', '/tmp');
    vi.stubEnv('VERCEL_ENV', 'production');
    await expect(fetchInboundEmail('em_1')).rejects.toThrow(/test seam/);
  });
});

describe('fetchInboundEmail attachment bounds', () => {
  const fixture = (attachments: { contentType: string; bytes: number }[]) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'inbound-'));
    writeFileSync(
      path.join(dir, 'em_2.json'),
      JSON.stringify({
        id: 'em_2', from: 'a@example.test', subject: 'S', text: 't', html: null,
        attachments: attachments.map((a, n) => ({ filename: `f${n}`, contentType: a.contentType, base64: Buffer.alloc(a.bytes, 1).toString('base64') })),
      }),
    );
    vi.stubEnv('ELSEWHERE_INBOUND_FIXTURE_DIR', dir);
  };

  it('keeps at most 5 images and 3 PDFs, drops oversize and unsupported files, and says why', async () => {
    fixture([
      ...Array.from({ length: 6 }, () => ({ contentType: 'image/png', bytes: 10 })),
      ...Array.from({ length: 4 }, () => ({ contentType: 'application/pdf', bytes: 10 })),
      { contentType: 'application/pdf', bytes: 4 * 1024 * 1024 + 1 },
      { contentType: 'application/zip', bytes: 10 },
    ]);
    const email = await fetchInboundEmail('em_2');
    expect(email.attachments.filter((a) => a.contentType === 'image/png')).toHaveLength(5);
    expect(email.attachments.filter((a) => a.contentType === 'application/pdf')).toHaveLength(3);
    expect(email.problems).toEqual([
      'an image was skipped: more than 5 attached',
      'a PDF was skipped: more than 3 attached',
      'a PDF was skipped: larger than 4 MB',
      'an attachment was skipped: unsupported type',
    ]);
  });

  it('rejects an id that could escape the fixture directory', async () => {
    fixture([]);
    await expect(fetchInboundEmail('../secret')).rejects.toThrow('invalid inbound email id');
  });
});

describe('attachmentBudget', () => {
  it('re-checks the real size after download, whatever the declared size said', () => {
    const budget = attachmentBudget();
    expect(budget.reject('application/pdf', 100)).toBeNull();
    expect(budget.accept('application/pdf', new Uint8Array(4 * 1024 * 1024 + 1))).toBe('a PDF was skipped: larger than 4 MB');
    expect(budget.accept('application/pdf', new Uint8Array(10))).toBeNull();
  });
});
