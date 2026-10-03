import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlightSnapshot } from '@/lib/monitor/snapshot';

type Row = Record<string, unknown>;
const db: { segment: Row | null; members: Row[]; incidents: Row[]; events: Row[]; segmentUpdates: Row[]; failOnce: Set<string>; duplicateDetected: boolean } = {
  segment: null,
  members: [],
  incidents: [],
  events: [],
  segmentUpdates: [],
  failOnce: new Set(),
  duplicateDetected: false,
};

/** A small in-memory stand-in for the three tables recordFlightSnapshot touches. */
function from(table: string) {
  const eqs: [string, unknown][] = [];
  let op: 'select' | 'upsert' | 'insert' | 'update' = 'select';
  let payload: Row = {};
  const q: Record<string, unknown> = {};
  const fail = (what: string) => {
    if (db.failOnce.delete(`${table}:${what}`)) return { data: null, error: { message: `${table} ${what} failed` } };
    return null;
  };
  const rows = () => (table === 'incidents' ? db.incidents : table === 'incident_events' ? db.events : []);
  const matching = () => rows().filter((r) => eqs.every(([k, v]) => r[k] === v));
  const run = (): { data: unknown; error: { message: string } | null } => {
    if (op === 'upsert') {
      const failed = fail('upsert');
      if (failed) return failed;
      if (db.incidents.some((r) => r.dedupe_key === payload.dedupe_key)) return { data: [], error: null };
      const row = { id: `inc-${db.incidents.length + 1}`, ...payload };
      db.incidents.push(row);
      return { data: [{ id: row.id }], error: null };
    }
    if (op === 'insert') {
      const failed = fail('insert');
      if (failed) return failed;
      if (db.duplicateDetected && payload.kind === 'detected') return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } as { message: string } };
      db.events.push(payload);
      return { data: null, error: null };
    }
    if (op === 'update') {
      const failed = fail('update');
      if (failed) return failed;
      db.segmentUpdates.push(payload);
      return { data: null, error: null };
    }
    if (table === 'booking_members') return { data: db.members, error: null };
    return { data: matching().slice(0, 1), error: null };
  };
  Object.assign(q, {
    select: () => q,
    eq: (k: string, v: unknown) => (eqs.push([k, v]), q),
    limit: () => q,
    maybeSingle: async () => (table === 'booking_segments' ? { data: db.segment, error: null } : { data: (run().data as Row[])[0] ?? null, error: null }),
    upsert: (row: Row) => ((op = 'upsert'), (payload = row), q),
    insert: (row: Row) => ((op = 'insert'), (payload = row), q),
    update: (row: Row) => ((op = 'update'), (payload = row), q),
    then: (resolve: (v: unknown) => void) => resolve(run()),
  });
  return q;
}
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }));

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
const cancelled = { ...snap, cancelled: true };

beforeEach(() => {
  Object.assign(db, {
    segment: { id: 's1', trip_id: 't1', booking_id: 'b1', scheduled_out: '2026-11-03T23:15:00Z', last_status: snap, last_status_at: '2026-11-01T08:00:00Z' },
    members: [{ trip_members: { user_id: 'u1' } }, { trip_members: [{ user_id: 'u2' }] }],
    incidents: [],
    events: [],
    segmentUpdates: [],
    failOnce: new Set(),
    duplicateDetected: false,
  });
});

describe('recordFlightSnapshot', () => {
  it('opens an incident for a cancellation, logs it once, and saves the snapshot', async () => {
    expect(await recordFlightSnapshot('s1', cancelled, 'alert')).toEqual({ incidentId: 'inc-1' });
    expect(db.incidents[0]).toMatchObject({ event_type: 'cancellation', dedupe_key: 's1:cancellation', affected_user_ids: ['u1', 'u2'] });
    expect(db.events).toHaveLength(1);
    expect(db.segmentUpdates).toHaveLength(1);
    // The snapshot and the time it was taken are written in the same update.
    expect(db.segmentUpdates[0]).toMatchObject({ last_status: cancelled, last_status_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
  });

  it('keeps the status it replaces on the incident it opens, with the time that status was taken', async () => {
    await recordFlightSnapshot('s1', cancelled, 'poll');
    expect(db.incidents[0]).toMatchObject({ previous_status: snap, previous_status_at: '2026-11-01T08:00:00Z' });
    expect(db.incidents[0].raw_payload).not.toHaveProperty('previous_status');
  });

  it('stores nulls when the flight had no earlier status', async () => {
    db.segment = { ...(db.segment as Row), last_status: null, last_status_at: null };
    await recordFlightSnapshot('s1', cancelled, 'poll');
    expect(db.incidents[0]).toMatchObject({ previous_status: null, previous_status_at: null });
  });

  it('only saves the snapshot when nothing changed', async () => {
    expect(await recordFlightSnapshot('s1', snap, 'poll')).toEqual({ incidentId: null });
    expect(db.incidents).toHaveLength(0);
    expect(db.segmentUpdates).toHaveLength(1);
  });

  it('does not save the snapshot when logging the incident fails', async () => {
    db.failOnce.add('incident_events:insert');
    await expect(recordFlightSnapshot('s1', cancelled, 'poll')).rejects.toThrow('incident_events insert failed');
    expect(db.segmentUpdates).toHaveLength(0);
  });

  it('on retry after that failure returns the same incident and writes detected exactly once', async () => {
    db.failOnce.add('incident_events:insert');
    await expect(recordFlightSnapshot('s1', cancelled, 'poll')).rejects.toThrow();
    expect(await recordFlightSnapshot('s1', cancelled, 'poll')).toEqual({ incidentId: 'inc-1' });
    expect(db.incidents).toHaveLength(1);
    expect(db.events).toHaveLength(1);
    expect(db.events[0]).toMatchObject({ incident_id: 'inc-1', kind: 'detected' });
    expect(db.segmentUpdates).toHaveLength(1);
  });

  it('does not log detected a second time when another path already recorded the incident', async () => {
    await recordFlightSnapshot('s1', cancelled, 'alert');
    db.segment = { ...(db.segment as Row), last_status: snap };
    expect(await recordFlightSnapshot('s1', cancelled, 'poll')).toEqual({ incidentId: 'inc-1' });
    expect(db.events).toHaveLength(1);
  });

  it('treats the unique-index rejection of a concurrent detected insert as success', async () => {
    db.duplicateDetected = true;
    expect(await recordFlightSnapshot('s1', cancelled, 'alert')).toEqual({ incidentId: 'inc-1' });
    expect(db.segmentUpdates).toHaveLength(1);
  });

  it('ignores a segment that no longer exists', async () => {
    db.segment = null;
    expect(await recordFlightSnapshot('gone', snap, 'poll')).toEqual({ incidentId: null });
  });
});
