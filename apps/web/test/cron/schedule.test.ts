import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const config = JSON.parse(readFileSync(fileURLToPath(new URL('../../vercel.json', import.meta.url)), 'utf8')) as { crons: { path: string; schedule: string }[] };

describe('vercel.json crons', () => {
  const schedule = (path: string) => config.crons.find((c) => c.path === path)?.schedule;

  it('runs the T-30 document check at 18:00 UTC, outside US quiet hours', () => {
    expect(schedule('/api/cron/document-checks')).toBe('0 18 * * *');
  });

  it('runs retention and the sweep daily', () => {
    expect(schedule('/api/cron/retention')).toBe('0 7 * * *');
    expect(schedule('/api/cron/sweep')).toBe('0 14 * * *');
  });
});
