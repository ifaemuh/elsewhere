import { describe, expect, it, vi } from 'vitest';
import type { AeroAirport, AeroApi } from '@/lib/flights/aeroapi';
import { withAirportCache, type AirportStore } from '@/lib/flights/airport-cache';

const LIS: AeroAirport = { code_iata: 'LIS', country_code: 'PT', latitude: 38.77, longitude: -9.13, timezone: 'Europe/Lisbon' };

function memoryStore(initial: Record<string, AeroAirport> = {}) {
  const rows = new Map(Object.entries(initial));
  const store: AirportStore = {
    get: vi.fn(async (iata: string) => rows.get(iata) ?? null),
    put: vi.fn(async (iata: string, airport: AeroAirport) => void rows.set(iata, airport)),
  };
  return { store, rows };
}
const api = (airport: AeroApi['airport']) => ({ airport: vi.fn(airport), flights: vi.fn(), schedules: vi.fn() }) as unknown as AeroApi & { airport: ReturnType<typeof vi.fn> };

describe('withAirportCache', () => {
  it('looks an airport up once, then serves it from the store', async () => {
    const { store } = memoryStore();
    const inner = api(async () => LIS);
    const cached = withAirportCache(inner, store);
    expect(await cached.airport('LIS')).toEqual(LIS);
    expect(await cached.airport('LIS')).toEqual(LIS);
    expect(inner.airport).toHaveBeenCalledTimes(1);
    expect(store.put).toHaveBeenCalledWith('LIS', LIS);
  });

  it('does not call AeroAPI at all for an airport already stored', async () => {
    const { store } = memoryStore({ LIS });
    const inner = api(async () => null);
    expect(await withAirportCache(inner, store).airport('LIS')).toEqual(LIS);
    expect(inner.airport).not.toHaveBeenCalled();
  });

  it('does not cache a failed lookup: the error passes through and the next call tries again', async () => {
    const { store, rows } = memoryStore();
    const inner = api(async () => LIS);
    inner.airport.mockRejectedValueOnce(new Error('503'));
    const cached = withAirportCache(inner, store);
    await expect(cached.airport('LIS')).rejects.toThrow('503');
    expect(rows.size).toBe(0);
    expect(await cached.airport('LIS')).toEqual(LIS);
    expect(inner.airport).toHaveBeenCalledTimes(2);
  });

  it('does not cache a lookup that finds nothing, or one without full coordinates', async () => {
    const { store, rows } = memoryStore();
    const inner = api(async () => null);
    const cached = withAirportCache(inner, store);
    expect(await cached.airport('ZZZ')).toBeNull();
    inner.airport.mockResolvedValueOnce({ ...LIS, latitude: null });
    expect((await cached.airport('LIS'))?.latitude).toBeNull();
    expect(rows.size).toBe(0);
    expect(store.put).not.toHaveBeenCalled();
  });

  it('falls back to AeroAPI when the store cannot be read, and still answers when it cannot be written', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const store: AirportStore = { get: vi.fn(async () => Promise.reject(new Error('db down'))), put: vi.fn(async () => Promise.reject(new Error('db down'))) };
    const inner = api(async () => LIS);
    expect(await withAirportCache(inner, store).airport('LIS')).toEqual(LIS);
    expect(inner.airport).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('leaves the other AeroAPI calls alone', async () => {
    const { store } = memoryStore();
    const inner = api(async () => LIS);
    const cached = withAirportCache(inner, store);
    expect(cached.flights).toBe(inner.flights);
    expect(cached.schedules).toBe(inner.schedules);
  });
});
