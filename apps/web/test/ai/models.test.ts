import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MODEL_IDS, NO_TRAINING, model } from '@/lib/ai/models';

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe('model', () => {
  it('uses the gateway id when a key is configured', async () => {
    delete process.env.ELSEWHERE_AI_FAKE_DIR;
    process.env.AI_GATEWAY_API_KEY = 'secret-key-value';
    expect(await model('extraction')).toBe(MODEL_IDS.extraction);
  });

  it('names the missing key without printing anything secret', async () => {
    delete process.env.ELSEWHERE_AI_FAKE_DIR;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL;
    await expect(model('extraction')).rejects.toThrow('Missing required environment variable AI_GATEWAY_API_KEY');
  });

  it('replays a canned answer from the fake dir', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ai-fake-'));
    writeFileSync(path.join(dir, 'extraction.json'), '{"bookings":[]}');
    process.env.ELSEWHERE_AI_FAKE_DIR = dir;
    process.env.VERCEL_ENV = 'preview';
    const fake = await model('extraction');
    expect(typeof fake).not.toBe('string');
  });

  it('refuses the fake dir in production', async () => {
    process.env.ELSEWHERE_AI_FAKE_DIR = '/tmp/whatever';
    process.env.VERCEL_ENV = 'production';
    await expect(model('extraction')).rejects.toThrow('ELSEWHERE_AI_FAKE_DIR is a test seam');
  });

  it('opts out of training', () => {
    expect(NO_TRAINING).toEqual({ gateway: { disallowPromptTraining: true } });
  });
});
