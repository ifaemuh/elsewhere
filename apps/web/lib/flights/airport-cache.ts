import type { AeroAirport, AeroApi } from './aeroapi';

export interface AirportStore {
  get(iata: string): Promise<AeroAirport | null>;
  put(iata: string, airport: AeroAirport): Promise<void>;
}

/** The `airports` table, service role only. The client loads lazily so this module stays importable anywhere. */
export function supabaseAirportStore(): AirportStore {
  return {
    async get(iata) {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { data, error } = await createAdminClient().from('airports').select('iata, latitude, longitude, country_code, timezone').eq('iata', iata).maybeSingle();
      if (error) throw new Error(error.message);
      return data ? { code_iata: data.iata, latitude: data.latitude, longitude: data.longitude, country_code: data.country_code, timezone: data.timezone } : null;
    },
    async put(iata, airport) {
      const { createAdminClient } = await import('@/lib/supabase/admin');
      const { error } = await createAdminClient()
        .from('airports')
        .upsert({ iata, latitude: airport.latitude, longitude: airport.longitude, country_code: airport.country_code, timezone: airport.timezone, fetched_at: new Date().toISOString() });
      if (error) throw new Error(error.message);
    },
  };
}

/**
 * Airport data is static and every AeroAPI lookup costs money, so look each airport up once, ever. Only a successful
 * lookup with full coordinates is stored. A store that fails never fails the lookup: it just costs a call.
 */
export function withAirportCache(api: AeroApi, store: AirportStore = supabaseAirportStore()): AeroApi {
  return {
    ...api,
    async airport(iata) {
      try {
        const hit = await store.get(iata);
        if (hit) return hit;
      } catch (error) {
        console.error('airport cache read failed', iata, error instanceof Error ? error.message : 'unknown');
      }
      const airport = await api.airport(iata);
      if (airport && airport.latitude !== null && airport.longitude !== null) {
        try {
          await store.put(iata, airport);
        } catch (error) {
          console.error('airport cache write failed', iata, error instanceof Error ? error.message : 'unknown');
        }
      }
      return airport;
    },
  };
}
