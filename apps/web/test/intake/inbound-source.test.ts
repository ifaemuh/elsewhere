import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchInboundEmail } from '@/lib/intake/inbound-source';

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
