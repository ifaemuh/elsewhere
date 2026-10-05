import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { AeroAirport, AeroApi, AeroFlight, AeroScheduled } from './aeroapi';

/** Reads <dir>/schedules/<CC><NNN>.json, <dir>/routes/<ORIGIN>-<DEST>.json, <dir>/airports/<IATA>.json, and <dir>/flights/<IDENT>.json. E2E rewrites flights between polls. */
export function fixtureAeroApi(dir: string): AeroApi {
  const read = <T>(file: string, fallback: T): T => {
    const full = path.join(dir, file);
    return existsSync(full) ? (JSON.parse(readFileSync(full, 'utf8')) as T) : fallback;
  };
  return {
    async schedules(_start, _end, airline, flightNumber) {
      return read<AeroScheduled[]>(`schedules/${airline}${flightNumber}.json`, []);
    },
    async routeSchedules(_start, _end, origin, destination) {
      return read<AeroScheduled[]>(`routes/${origin}-${destination}.json`, []);
    },
    async airport(iata) {
      return read<AeroAirport | null>(`airports/${iata}.json`, null);
    },
    async flights(ident) {
      return read<AeroFlight[]>(`flights/${ident}.json`, []);
    },
    async createAlert({ ident }) {
      return `fixture-${ident}`;
    },
    async deleteAlert() {
      return undefined;
    },
  };
}
