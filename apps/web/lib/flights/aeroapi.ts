import { appUrl, assertTestSeamAllowed, requireEnv } from '@/lib/env';

const BASE = 'https://aeroapi.flightaware.com/aeroapi';
const TIMEOUT_MS = 10_000;

export interface AeroFlight {
  fa_flight_id: string;
  ident_iata: string | null;
  cancelled: boolean;
  diverted: boolean;
  scheduled_out: string | null;
  estimated_out: string | null;
  actual_out: string | null;
  scheduled_in: string | null;
  estimated_in: string | null;
  actual_in: string | null;
  departure_delay: number | null;
  arrival_delay: number | null;
  origin: { code_iata: string | null; timezone: string | null } | null;
  destination: { code_iata: string | null; timezone: string | null } | null;
}

export interface AeroAirport {
  code_iata: string | null;
  country_code: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
}

export interface AeroScheduled {
  ident_iata: string | null;
  /** AeroAPI's operating ident for a codeshare, when it reports one. */
  actual_ident_iata?: string | null;
  origin_iata: string | null;
  destination_iata: string | null;
  scheduled_out: string;
  scheduled_in: string;
}

export interface AeroApi {
  schedules(dateStart: string, dateEnd: string, airline: string, flightNumber: string): Promise<AeroScheduled[]>;
  airport(iata: string): Promise<AeroAirport | null>;
  flights(ident: string, startIso: string, endIso: string): Promise<AeroFlight[]>;
  createAlert(input: { ident: string; origin: string; destination: string; date: string; targetUrl: string }): Promise<string>;
  deleteAlert(id: string): Promise<void>;
}

/**
 * A failed AeroAPI call. `retryable` is true for 429, 5xx, timeouts, and network errors.
 * The message carries the path and status only: never the URL query, the key, or a response body.
 */
export class AeroApiError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'AeroApiError';
  }
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

function place(v: unknown): { code_iata: string | null; timezone: string | null } | null {
  const o = obj(v);
  return o ? { code_iata: str(o.code_iata), timezone: str(o.timezone) } : null;
}

function parseScheduled(v: unknown): AeroScheduled | null {
  const o = obj(v);
  const out = o && str(o.scheduled_out);
  const inn = o && str(o.scheduled_in);
  if (!o || !out || !inn) return null;
  return { ident_iata: str(o.ident_iata), actual_ident_iata: str(o.actual_ident_iata), origin_iata: str(o.origin_iata), destination_iata: str(o.destination_iata), scheduled_out: out, scheduled_in: inn };
}

function parseFlight(v: unknown): AeroFlight | null {
  const o = obj(v);
  const id = o && str(o.fa_flight_id);
  if (!o || !id) return null;
  return {
    fa_flight_id: id,
    ident_iata: str(o.ident_iata),
    cancelled: o.cancelled === true,
    diverted: o.diverted === true,
    scheduled_out: str(o.scheduled_out),
    estimated_out: str(o.estimated_out),
    actual_out: str(o.actual_out),
    scheduled_in: str(o.scheduled_in),
    estimated_in: str(o.estimated_in),
    actual_in: str(o.actual_in),
    departure_delay: num(o.departure_delay),
    arrival_delay: num(o.arrival_delay),
    origin: place(o.origin),
    destination: place(o.destination),
  };
}

function parseAirport(v: unknown): AeroAirport | null {
  const o = obj(v);
  if (!o) return null;
  return { code_iata: str(o.code_iata), country_code: str(o.country_code), latitude: num(o.latitude), longitude: num(o.longitude), timezone: str(o.timezone) };
}

const list = <T>(v: unknown, parse: (x: unknown) => T | null): T[] => (Array.isArray(v) ? v.map(parse).filter((x): x is T => x !== null) : []);

/** Alerts may only call back to our own origin: https, or http on localhost for development. */
function assertOwnOrigin(targetUrl: string, appOrigin: string): void {
  let url: URL;
  try {
    url = new URL(targetUrl);
  } catch {
    throw new AeroApiError('AeroAPI alert target is not a valid URL', null, false);
  }
  const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.origin !== appOrigin || (url.protocol !== 'https:' && !local)) {
    throw new AeroApiError('AeroAPI alert target must be our own https origin', null, false);
  }
}

export function httpAeroApi(key: string, fetchImpl: typeof fetch = fetch, options: { appOrigin?: string } = {}): AeroApi {
  const headers = { 'x-apikey': key, accept: 'application/json' };

  async function request(path: string, init: RequestInit & { query?: Record<string, string> } = {}): Promise<Response> {
    const { query = {}, ...rest } = init;
    const url = new URL(`${BASE}${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await fetchImpl(url.toString(), { ...rest, headers: { ...headers, ...(rest.headers as Record<string, string> | undefined) }, signal: controller.signal });
    } catch {
      throw new AeroApiError(`AeroAPI ${path} ${controller.signal.aborted ? 'timed out' : 'was unreachable'}`, null, true);
    } finally {
      clearTimeout(timer);
    }
  }

  function fail(path: string, response: Response): never {
    throw new AeroApiError(`AeroAPI ${path} failed with ${response.status}`, response.status, response.status === 429 || response.status >= 500);
  }

  async function get(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const response = await request(path, { query });
    if (response.status === 404) return null;
    if (!response.ok) fail(path, response);
    try {
      return await response.json();
    } catch {
      throw new AeroApiError(`AeroAPI ${path} returned an unreadable body`, response.status, false);
    }
  }

  return {
    async schedules(dateStart, dateEnd, airline, flightNumber) {
      const body = obj(await get(`/schedules/${dateStart}/${dateEnd}`, { airline, flight_number: flightNumber }));
      return list(body?.scheduled, parseScheduled);
    },
    async airport(iata) {
      return parseAirport(await get(`/airports/${encodeURIComponent(iata)}`));
    },
    async flights(ident, startIso, endIso) {
      const body = obj(await get(`/flights/${encodeURIComponent(ident)}`, { ident_type: 'designator', start: startIso, end: endIso }));
      return list(body?.flights, parseFlight);
    },
    async createAlert({ ident, origin, destination, date, targetUrl }) {
      assertOwnOrigin(targetUrl, options.appOrigin ?? new URL(appUrl()).origin);
      const response = await request('/alerts', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify({
          ident,
          origin,
          destination,
          start: date,
          end: date,
          events: { arrival: true, cancelled: true, departure: true, diverted: true, filed: true, out: true, in: true },
          target_url: targetUrl,
        }),
      });
      const id = response.headers.get('location')?.split('/').pop();
      if (response.status !== 201 || !id) fail('/alerts', response);
      return id;
    },
    async deleteAlert(id) {
      const response = await request(`/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404) fail('/alerts/:id', response);
    },
  };
}

/** Async so the fixture module loads lazily; production never reads flight data from disk. AEROAPI_KEY is read only here, on use. */
export async function aeroApi(): Promise<AeroApi> {
  const fixtureDir = process.env.ELSEWHERE_AEROAPI_FIXTURE_DIR;
  if (fixtureDir) {
    assertTestSeamAllowed('ELSEWHERE_AEROAPI_FIXTURE_DIR');
    const { fixtureAeroApi } = await import('./fixture-aeroapi');
    return fixtureAeroApi(fixtureDir);
  }
  return httpAeroApi(requireEnv('AEROAPI_KEY'));
}
