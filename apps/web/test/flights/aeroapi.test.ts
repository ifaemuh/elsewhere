import { afterEach, describe, expect, it, vi } from 'vitest';
import { AeroApiError, aeroApi, httpAeroApi } from '@/lib/flights/aeroapi';

function fakeFetch(responses: Record<string, { status: number; body?: unknown; headers?: Record<string, string> }>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetchImpl = (async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    const key = Object.keys(responses).find((k) => url.includes(k));
    const r = key ? responses[key] : { status: 404 };
    return new Response(r.body === undefined ? null : JSON.stringify(r.body), { status: r.status, headers: r.headers });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

describe('httpAeroApi', () => {
  it('sends the API key and reads schedules', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/schedules/2026-11-02/2026-11-05': { status: 200, body: { scheduled: [{ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' }] } },
    });
    const api = httpAeroApi('k3y', fetchImpl);
    const scheduled = await api.schedules('2026-11-02', '2026-11-05', 'TP', '204');
    expect(scheduled).toHaveLength(1);
    expect(new Headers(calls[0].init?.headers).get('x-apikey')).toBe('k3y');
    expect(calls[0].url).toContain('airline=TP');
    expect(calls[0].url).toContain('flight_number=204');
    expect(calls[0].url).not.toContain('k3y');
  });

  it('returns null for an unknown airport', async () => {
    const { fetchImpl } = fakeFetch({});
    expect(await httpAeroApi('k', fetchImpl).airport('ZZZ')).toBeNull();
  });

  it('creates an alert and reads its id from Location', async () => {
    const { fetchImpl, calls } = fakeFetch({ '/alerts': { status: 201, headers: { location: '/alerts/987' } } });
    const id = await httpAeroApi('k', fetchImpl, { appOrigin: 'https://x.test' }).createAlert({ ident: 'TP204', origin: 'EWR', destination: 'LIS', date: '2026-11-03', targetUrl: 'https://x.test/api/webhooks/aeroapi/s' });
    expect(id).toBe('987');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body).toMatchObject({ ident: 'TP204', start: '2026-11-03', end: '2026-11-03', target_url: 'https://x.test/api/webhooks/aeroapi/s' });
    expect(body.events).toMatchObject({ cancelled: true, departure: true, arrival: true, diverted: true });
  });

  it('surfaces 429 and 5xx as retryable typed errors without echoing the key or body', async () => {
    const { fetchImpl } = fakeFetch({ '/airports/': { status: 429, body: { passenger: 'Ada Lovelace' } }, '/flights/': { status: 503 } });
    const api = httpAeroApi('sekret', fetchImpl);
    const err = await api.airport('EWR').catch((e) => e);
    expect(err).toBeInstanceOf(AeroApiError);
    expect(err.retryable).toBe(true);
    expect(err.status).toBe(429);
    expect(String(err.message)).not.toContain('sekret');
    expect(String(err.message)).not.toContain('Ada');
    const err2 = await api.flights('TP204', 'a', 'b').catch((e) => e);
    expect(err2).toBeInstanceOf(AeroApiError);
    expect(err2.retryable).toBe(true);
  });

  it('treats other 4xx as not retryable', async () => {
    const { fetchImpl } = fakeFetch({ '/airports/': { status: 401 } });
    const err = await httpAeroApi('k', fetchImpl).airport('EWR').catch((e) => e);
    expect(err).toBeInstanceOf(AeroApiError);
    expect(err.retryable).toBe(false);
  });

  it('times out as a retryable error', async () => {
    vi.useFakeTimers();
    const hang = ((_u: string | URL, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))) as typeof fetch;
    const pending = httpAeroApi('k', hang).airport('EWR').catch((e) => e);
    await vi.advanceTimersByTimeAsync(10_001);
    const err = await pending;
    vi.useRealTimers();
    expect(err).toBeInstanceOf(AeroApiError);
    expect(err.retryable).toBe(true);
  });

  it('drops malformed schedule and flight rows instead of trusting them', async () => {
    const { fetchImpl } = fakeFetch({
      '/schedules/': { status: 200, body: { scheduled: [{ ident_iata: 'TP204', origin_iata: 'EWR', destination_iata: 'LIS', scheduled_out: null, scheduled_in: '2026-11-04T06:35:00Z' }, 'junk', { scheduled_out: '2026-11-03T23:15:00Z', scheduled_in: '2026-11-04T06:35:00Z' }] } },
      '/flights/': { status: 200, body: { flights: [{ cancelled: true }, { fa_flight_id: 'f1', cancelled: true, scheduled_out: null }] } },
    });
    const api = httpAeroApi('k', fetchImpl);
    expect(await api.schedules('a', 'b', 'TP', '204')).toHaveLength(1);
    const flights = await api.flights('TP204', 'a', 'b');
    expect(flights).toHaveLength(1);
    expect(flights[0]).toMatchObject({ fa_flight_id: 'f1', cancelled: true, scheduled_out: null, estimated_in: null, origin: null, arrival_delay: null });
  });

  it('refuses alert targets outside our own https origin, without calling AeroAPI', async () => {
    const { fetchImpl, calls } = fakeFetch({ '/alerts': { status: 201, headers: { location: '/alerts/1' } } });
    const input = { ident: 'TP204', origin: 'EWR', destination: 'LIS', date: '2026-11-03' };
    const api = httpAeroApi('k', fetchImpl, { appOrigin: 'https://x.test' });
    for (const targetUrl of ['https://evil.test/h', 'https://x.test.evil.test/h', 'http://x.test/h', 'not a url']) {
      const err = await api.createAlert({ ...input, targetUrl }).catch((e) => e);
      expect(err).toBeInstanceOf(AeroApiError);
      expect(err.retryable).toBe(false);
    }
    expect(calls).toHaveLength(0);
  });

  it('allows an http localhost target when it is our origin', async () => {
    const { fetchImpl } = fakeFetch({ '/alerts': { status: 201, headers: { location: '/alerts/5' } } });
    const api = httpAeroApi('k', fetchImpl, { appOrigin: 'http://localhost:3000' });
    expect(await api.createAlert({ ident: 'TP204', origin: 'EWR', destination: 'LIS', date: '2026-11-03', targetUrl: 'http://localhost:3000/api/webhooks/aeroapi/s' })).toBe('5');
  });

  it('defaults the allowed origin to the app URL', async () => {
    const saved = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.test/';
    try {
      const { fetchImpl } = fakeFetch({ '/alerts': { status: 201, headers: { location: '/alerts/6' } } });
      const api = httpAeroApi('k', fetchImpl);
      expect(await api.createAlert({ ident: 'TP204', origin: 'EWR', destination: 'LIS', date: '2026-11-03', targetUrl: 'https://app.test/h' })).toBe('6');
      await expect(api.createAlert({ ident: 'TP204', origin: 'EWR', destination: 'LIS', date: '2026-11-03', targetUrl: 'https://x.test/h' })).rejects.toBeInstanceOf(AeroApiError);
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
      else process.env.NEXT_PUBLIC_APP_URL = saved;
    }
  });

  it('fails alert creation with a typed error', async () => {
    const { fetchImpl } = fakeFetch({ '/alerts': { status: 502 } });
    const err = await httpAeroApi('k', fetchImpl, { appOrigin: 'https://x.test' }).createAlert({ ident: 'TP204', origin: 'EWR', destination: 'LIS', date: '2026-11-03', targetUrl: 'https://x.test/h' }).catch((e) => e);
    expect(err).toBeInstanceOf(AeroApiError);
    expect(err.retryable).toBe(true);
  });
});

describe('aeroApi()', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('refuses the fixture seam in production', async () => {
    process.env.VERCEL_ENV = 'production';
    process.env.ELSEWHERE_AEROAPI_FIXTURE_DIR = '/tmp/x';
    await expect(aeroApi()).rejects.toThrow(/test seam/);
  });

  it('reads canned responses from the fixture directory outside production', async () => {
    process.env.VERCEL_ENV = 'preview';
    process.env.ELSEWHERE_AEROAPI_FIXTURE_DIR = '/nonexistent-fixture-dir';
    const api = await aeroApi();
    expect(await api.airport('EWR')).toBeNull();
    expect(await api.schedules('a', 'b', 'TP', '204')).toEqual([]);
  });

  it('names the missing key without printing any value', async () => {
    delete process.env.ELSEWHERE_AEROAPI_FIXTURE_DIR;
    delete process.env.AEROAPI_KEY;
    await expect(aeroApi()).rejects.toThrow('Missing required environment variable AEROAPI_KEY');
  });
});
