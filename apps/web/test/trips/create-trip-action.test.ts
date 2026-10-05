import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (k: string) => (store.has(k) ? { value: store.get(k) } : undefined) }),
}));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ rpc }) }));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: 'user-1', email: 'pat@example.test', phone: null }) }));
const recordEvent = vi.fn();
vi.mock('@/lib/funnel/events', () => ({ recordEvent: (...args: unknown[]) => recordEvent(...args) }));
const { rateLimited } = vi.hoisted(() => ({ rateLimited: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ RATE_LIMIT_RULES: { codeSend: 'auth-code-send', codeSendContact: 'auth-code-send-contact', tripCreate: 'trips-create' }, rateLimited }));

import { createTrip } from '@/app/trips/new/actions';

const AID = 'c'.repeat(32);
const TRIP_ID = '11111111-1111-1111-1111-111111111111';
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}
const valid = { name: 'Lisbon 2026', destinationCountry: 'pt', startDate: '2026-11-03', endDate: '2026-11-10', displayName: 'Pat' };

beforeEach(() => {
  store.clear();
  process.env.TRIPS_OPEN = 'true';
  rpc.mockReset().mockResolvedValue({ data: TRIP_ID, error: null });
  recordEvent.mockReset().mockResolvedValue(undefined);
  rateLimited.mockReset().mockResolvedValue(false);
});
afterEach(() => {
  delete process.env.TRIPS_OPEN;
});

describe('createTrip', () => {
  it('calls create_trip with parsed values and a generated code, then records trip_started', async () => {
    store.set('elsewhere_aid', AID);
    store.set('elsewhere_utm', JSON.stringify({ utm_source: 'tiktok' }));
    await expect(createTrip({ error: null }, form(valid))).rejects.toThrow(`REDIRECT:/trips/${TRIP_ID}`);
    expect(rpc).toHaveBeenCalledWith('create_trip', {
      p_name: 'Lisbon 2026',
      p_destination_country: 'PT',
      p_start_date: '2026-11-03',
      p_end_date: '2026-11-10',
      p_inbound_code: expect.stringMatching(/^trip-[a-km-np-z2-9]{12}$/),
      p_display_name: 'Pat',
      p_anonymous_id: AID,
      p_utm: { utm_source: 'tiktok' },
    });
    expect(recordEvent).toHaveBeenCalledWith({ anonymousId: AID, event: 'trip_started', userId: 'user-1', tripId: TRIP_ID, utm: { utm_source: 'tiktok' } });
  });

  it('passes a null anonymous id for an invalid cookie and records no trip_started', async () => {
    store.set('elsewhere_aid', 'bogus');
    await expect(createTrip({ error: null }, form(valid))).rejects.toThrow(`REDIRECT:/trips/${TRIP_ID}`);
    expect(rpc.mock.calls[0][1].p_anonymous_id).toBeNull();
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('redirects to /start with no RPC call while TRIPS_OPEN is not true', async () => {
    process.env.TRIPS_OPEN = 'false';
    await expect(createTrip({ error: null }, form(valid))).rejects.toThrow('REDIRECT:/start');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns the generic error and does not redirect on an RPC error', async () => {
    store.set('elsewhere_aid', AID);
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    await expect(createTrip({ error: null }, form(valid))).resolves.toEqual({ error: 'We could not create the trip. Try again.' });
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('returns the parse error and makes no RPC call', async () => {
    await expect(createTrip({ error: null }, form({ ...valid, endDate: '2026-11-01' }))).resolves.toEqual({
      error: 'The trip has to end on or after it starts.',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses while the visitor is over the trip-creation limit', async () => {
    rateLimited.mockResolvedValue(true);
    await expect(createTrip({ error: null }, form(valid))).resolves.toEqual({ error: 'Too many new trips from here. Wait a minute, then try again.' });
    expect(rateLimited).toHaveBeenCalledWith('trips-create', 'user-1');
    expect(rpc).not.toHaveBeenCalled();
  });
});
