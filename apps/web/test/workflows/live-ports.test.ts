import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAlert = vi.hoisted(() => vi.fn(async (_input: { targetUrl: string }) => 'alert-9'));
const updates: Record<string, unknown>[] = [];
vi.mock('@/lib/flights/aeroapi', () => ({ aeroApi: async () => ({ createAlert }) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: (row: Record<string, unknown>) => {
        updates.push(row);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
}));
vi.mock('@/lib/documents/service', () => ({ runDocumentChecks: vi.fn() }));
vi.mock('@/lib/notify/queue', () => ({ queueNotifications: vi.fn() }));

import { ConfigError } from '@/lib/env';
import { livePorts } from '@/lib/workflows/live-ports';

const segment = { id: 's1', tripId: 't1', ident: 'TP204', departureDate: '2026-11-03', originIata: 'EWR', destinationIata: 'LIS', scheduledOut: null, scheduledIn: null, alertId: null };

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test/';
  process.env.AEROAPI_WEBHOOK_SECRET = 'hook-secret';
  createAlert.mockClear();
  createAlert.mockResolvedValue('alert-9');
  updates.length = 0;
});

describe('livePorts.registerAlert', () => {
  it('points the alert at the app URL from the environment plus the webhook secret', async () => {
    expect(await livePorts().registerAlert(segment)).toBe('monitoring');
    expect(createAlert.mock.calls[0][0].targetUrl).toBe('https://elsewhere.test/api/webhooks/aeroapi/hook-secret');
    expect(updates).toEqual([{ aeroapi_alert_id: 'alert-9', monitor_state: 'monitoring' }]);
  });

  it('falls back to polling when AeroAPI refuses the alert', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    createAlert.mockRejectedValue(new Error('boom'));
    expect(await livePorts().registerAlert(segment)).toBe('polling_only');
    expect(updates).toEqual([{ monitor_state: 'polling_only' }]);
  });

  it('keeps an existing alert without calling AeroAPI', async () => {
    expect(await livePorts().registerAlert({ ...segment, alertId: 'a' })).toBe('monitoring');
    expect(createAlert).not.toHaveBeenCalled();
  });

  it('throws a ConfigError, not a silent fallback, when the webhook secret is missing', async () => {
    delete process.env.AEROAPI_WEBHOOK_SECRET;
    await expect(livePorts().registerAlert(segment)).rejects.toBeInstanceOf(ConfigError);
    expect(createAlert).not.toHaveBeenCalled();
  });
});
