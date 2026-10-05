import { afterEach, describe, expect, it, vi } from 'vitest';

const withAirportCache = vi.hoisted(() => vi.fn((api: object) => ({ ...api, cached: true })));
vi.mock('@/lib/flights/airport-cache', () => ({ withAirportCache }));

import { aeroApi } from '@/lib/flights/aeroapi';

afterEach(() => {
  delete process.env.AEROAPI_KEY;
  delete process.env.ELSEWHERE_AEROAPI_FIXTURE_DIR;
});

describe('aeroApi()', () => {
  it('wraps the live client in the airports cache, so every caller reads airports through it', async () => {
    process.env.AEROAPI_KEY = 'key-test';
    expect(await aeroApi()).toMatchObject({ cached: true });
    expect(withAirportCache).toHaveBeenCalledTimes(1);
  });
});
