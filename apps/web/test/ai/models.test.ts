import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MODEL_IDS, NO_TRAINING, model } from '@/lib/ai/models';
import { extractBookings } from '@/lib/intake/extract';

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

  it('names the missing key and prints no value', async () => {
    delete process.env.ELSEWHERE_AI_FAKE_DIR;
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_OIDC_TOKEN;
    delete process.env.VERCEL;
    process.env.SOME_OTHER_SECRET = 'secret-key-value';
    const error = await model('extraction').catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('Missing required environment variable AI_GATEWAY_API_KEY');
    expect((error as Error).message).not.toContain('secret-key-value');
  });

  it('skips the key check on Vercel, which uses OIDC', async () => {
    delete process.env.ELSEWHERE_AI_FAKE_DIR;
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.VERCEL = '1';
    expect(await model('playbook')).toBe(MODEL_IDS.playbook);
  });

  it('replays a canned answer end to end through generateText', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'ai-fake-'));
    const booking = {
      kind: 'flight', provider: 'TAP', confirmation_code: 'ABC123', booked_via: null, booked_at: null,
      passenger_names: ['DOE/PAT MR'],
      segments: [{ carrier_iata: 'TP', flight_number: '204', origin_iata: 'EWR', destination_iata: 'LIS', departure_local: '2026-11-03T18:15', arrival_local: null }],
      confidence: { confirmation_code: 0.99, passengers: 0.99, segments: 0.99 },
    };
    writeFileSync(path.join(dir, 'extraction.json'), JSON.stringify({ bookings: [booking] }));
    process.env.ELSEWHERE_AI_FAKE_DIR = dir;
    process.env.VERCEL_ENV = 'preview';
    const { bookings } = await extractBookings({ text: 'ABC123 DOE/PAT TP 204', html: null, images: [], pdfs: [] });
    expect(bookings).toHaveLength(1);
    expect(bookings[0].dedupeKey).toBe('flight|ABC123|TP204@2026-11-03');
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
