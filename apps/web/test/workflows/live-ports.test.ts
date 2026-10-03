import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; error: { message: string } | null };
const selects: Record<string, Result> = {};
const updates: Record<string, unknown>[] = [];
let updateError: string | null = null;

function chain(result: () => Result) {
  const q: Record<string, unknown> = {};
  const self = () => q;
  Object.assign(q, {
    select: self,
    eq: self,
    not: self,
    order: self,
    limit: self,
    single: async () => result(),
    maybeSingle: async () => result(),
    then: (resolve: (v: unknown) => void) => resolve(result()),
  });
  return q;
}

const createAlert = vi.hoisted(() => vi.fn(async (_input: { targetUrl: string }) => 'alert-9'));
const deleteAlert = vi.hoisted(() => vi.fn(async (_id: string) => undefined));
const runDocumentChecks = vi.hoisted(() => vi.fn(async (_tripId: string) => undefined));
const queueNotifications = vi.hoisted(() => vi.fn(async (_input: unknown) => undefined));
vi.mock('@/lib/flights/aeroapi', () => ({ aeroApi: async () => ({ createAlert, deleteAlert }) }));
vi.mock('@/lib/documents/service', () => ({ runDocumentChecks }));
vi.mock('@/lib/notify/queue', () => ({ queueNotifications }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => ({
      ...chain(() => selects[table] ?? { data: null, error: null }),
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return { eq: async () => ({ error: updateError ? { message: updateError } : null }) };
      },
    }),
  }),
}));

import { livePorts } from '@/lib/workflows/live-ports';

const segment = { id: 's1', tripId: 't1', ident: 'TP204', departureDate: '2026-11-03', originIata: 'EWR', destinationIata: 'LIS', scheduledOut: null, scheduledIn: null, alertId: null };
let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test/';
  process.env.AEROAPI_WEBHOOK_SECRET = 'hook-secret';
  for (const key of Object.keys(selects)) delete selects[key];
  createAlert.mockReset().mockResolvedValue('alert-9');
  deleteAlert.mockReset().mockResolvedValue(undefined);
  runDocumentChecks.mockClear();
  queueNotifications.mockClear();
  updates.length = 0;
  updateError = null;
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => consoleError.mockRestore());

describe('livePorts.registerAlert', () => {
  it('points the alert at the app URL from the environment plus the webhook secret', async () => {
    expect(await livePorts().registerAlert(segment)).toBe('monitoring');
    expect(createAlert.mock.calls[0][0].targetUrl).toBe('https://elsewhere.test/api/webhooks/aeroapi/hook-secret');
    expect(updates).toEqual([{ aeroapi_alert_id: 'alert-9', monitor_state: 'monitoring' }]);
  });

  it('falls back to polling when AeroAPI refuses the alert', async () => {
    createAlert.mockRejectedValue(new Error('boom'));
    expect(await livePorts().registerAlert(segment)).toBe('polling_only');
    expect(updates).toEqual([{ monitor_state: 'polling_only' }]);
  });

  it('falls back to polling, without throwing, when the webhook secret or app URL is missing', async () => {
    delete process.env.AEROAPI_WEBHOOK_SECRET;
    expect(await livePorts().registerAlert(segment)).toBe('polling_only');
    process.env.AEROAPI_WEBHOOK_SECRET = 'hook-secret';
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(await livePorts().registerAlert(segment)).toBe('polling_only');
    expect(createAlert).not.toHaveBeenCalled();
    expect(updates).toEqual([{ monitor_state: 'polling_only' }, { monitor_state: 'polling_only' }]);
  });

  it('keeps an existing alert without calling AeroAPI', async () => {
    expect(await livePorts().registerAlert({ ...segment, alertId: 'a' })).toBe('monitoring');
    expect(createAlert).not.toHaveBeenCalled();
  });

  it('deletes the new alert and throws when saving its id fails, so it is not orphaned', async () => {
    updateError = 'db down';
    await expect(livePorts().registerAlert(segment)).rejects.toThrow('db down');
    expect(deleteAlert).toHaveBeenCalledWith('alert-9');
    expect(updates).toEqual([{ aeroapi_alert_id: 'alert-9', monitor_state: 'monitoring' }]);
  });

  it('still throws the database error, and logs, when the cleanup delete also fails', async () => {
    updateError = 'db down';
    deleteAlert.mockRejectedValue(new Error('aeroapi down'));
    await expect(livePorts().registerAlert(segment)).rejects.toThrow('db down');
    expect(consoleError).toHaveBeenCalledWith('could not delete the orphaned alert', 'alert-9', 'aeroapi down');
  });
});

describe('livePorts.endSegment', () => {
  it('logs a failed alert delete and still ends the segment', async () => {
    selects.booking_segments = { data: { aeroapi_alert_id: 'a1' }, error: null };
    deleteAlert.mockRejectedValue(new Error('aeroapi down'));
    await livePorts().endSegment('s1');
    expect(consoleError).toHaveBeenCalledWith('could not delete the alert', 'a1', 'aeroapi down');
    expect(updates).toEqual([{ monitor_state: 'ended' }]);
  });
});

describe('livePorts.preTripChecks', () => {
  beforeEach(() => {
    selects.trips = { data: { name: 'Lisbon' }, error: null };
    selects.trip_members = { data: [{ user_id: 'u1' }, { user_id: 'u2' }], error: null };
  });

  it('queues the briefing when none exists for the trip', async () => {
    selects.notifications = { data: [], error: null };
    await livePorts().preTripChecks('t1');
    expect(runDocumentChecks).toHaveBeenCalledWith('t1');
    expect(queueNotifications).toHaveBeenCalledTimes(1);
  });

  it('skips the briefing when one was already queued, as after a retry or a restart', async () => {
    selects.notifications = { data: [{ id: 'n1' }], error: null };
    await livePorts().preTripChecks('t1');
    expect(queueNotifications).not.toHaveBeenCalled();
  });

  it('fails, rather than risk a second briefing, when the lookup errors', async () => {
    selects.notifications = { data: null, error: { message: 'db down' } };
    await expect(livePorts().preTripChecks('t1')).rejects.toThrow('db down');
    expect(queueNotifications).not.toHaveBeenCalled();
  });
});
