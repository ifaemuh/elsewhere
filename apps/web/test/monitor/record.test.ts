import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightSnapshot } from '@/lib/monitor/snapshot';

type Row = Record<string, unknown>;
const state: { segment: Row | null; members: Row[]; inserted: Row[]; upsertId: string | null; writes: string[]; fail: string | null } = {
  segment: null,
  members: [],
  inserted: [],
  upsertId: 'inc-1',
  writes: [],
  fail: null,
};

function query(table: string) {
  let mode: 'select' | 'update' | 'upsert' | 'insert' = 'select';
  let payload: Row = {};
  const q: Record<string, unknown> = {};
  const done = (data: unknown) => {
    if (state.fail === `${table}:${mode}`) return { data: null, error: { message: `${table} ${mode} failed` } };
    return { data, error: null };
  };
  Object.assign(q, {
    select: () => q,
    eq: () => q,
    maybeSingle: async () => done(state.segment),
    upsert: (row: Row) => {
      mode = 'upsert';
      payload = row;
      return q;
    },
    insert: (row: Row) => {
      mode = 'insert';
      payload = row;
      state.writes.push(`${table}:insert`);
      state.inserted.push({ table, ...row });
      return q;
    },
    update: (row: Row) => {
      mode = 'update';
      payload = row;
      return q;
    },
    then: (resolve: (v: unknown) => void) => {
      if (mode === 'upsert') {
        state.writes.push(`${table}:upsert`);
        state.inserted.push({ table, ...payload });
        return resolve(done(state.upsertId ? [{ id: state.upsertId }] : []));
      }
      if (mode === 'update') {
        state.writes.push(`${table}:update`);
        state.inserted.push({ table, update: payload });
        return resolve(done(null));
      }
      if (mode === 'insert') return resolve(done(null));
      return resolve(done(state.members));
    },
  });
  return q;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: query }) }));

import { recordFlightSnapshot } from '@/lib/monitor/record';

const snap: FlightSnapshot = {
  faFlightId: 'TAP204-1',
  cancelled: false,
  diverted: false,
  scheduledOut: '2026-11-03T23:15:00Z',
  estimatedOut: null,
  actualOut: null,
  scheduledIn: '2026-11-04T06:35:00Z',
  estimatedIn: null,
  actualIn: null,
  arrivalDelayMinutes: 0,
};

beforeEach(() => {
  Object.assign(state, {
    segment: { id: 's1', trip_id: 't1', booking_id: 'b1', scheduled_out: '2026-11-03T23:15:00Z', last_status: snap },
    members: [{ trip_members: { user_id: 'u1' } }, { trip_members: [{ user_id: 'u2' }] }],
    inserted: [],
    upsertId: 'inc-1',
    writes: [],
    fail: null,
  });
});

describe('recordFlightSnapshot', () => {
  it('opens an incident for a cancellation, logs it, and saves the snapshot last', async () => {
    const result = await recordFlightSnapshot('s1', { ...snap, cancelled: true }, 'alert');
    expect(result).toEqual({ incidentId: 'inc-1' });
    expect(state.writes).toEqual(['incidents:upsert', 'incident_events:insert', 'booking_segments:update']);
    expect(state.inserted[0]).toMatchObject({ table: 'incidents', event_type: 'cancellation', dedupe_key: 's1:cancellation', affected_user_ids: ['u1', 'u2'] });
  });

  it('only saves the snapshot when nothing changed', async () => {
    expect(await recordFlightSnapshot('s1', snap, 'poll')).toEqual({ incidentId: null });
    expect(state.writes).toEqual(['booking_segments:update']);
  });

  it('returns no incident id when the incident was already recorded', async () => {
    state.upsertId = null;
    expect(await recordFlightSnapshot('s1', { ...snap, cancelled: true }, 'poll')).toEqual({ incidentId: null });
    expect(state.writes).not.toContain('incident_events:insert');
  });

  it('does not save the snapshot when recording the incident fails, so the change is classified again', async () => {
    state.fail = 'incident_events:insert';
    await expect(recordFlightSnapshot('s1', { ...snap, cancelled: true }, 'poll')).rejects.toThrow('incident_events insert failed');
    expect(state.writes).not.toContain('booking_segments:update');
  });

  it('ignores a segment that no longer exists', async () => {
    state.segment = null;
    expect(await recordFlightSnapshot('gone', snap, 'poll')).toEqual({ incidentId: null });
  });
});
