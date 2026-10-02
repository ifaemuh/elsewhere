import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
let tripRow: { data: unknown; error: unknown };
const single = vi.fn(async () => tripRow);
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ rpc, from: () => ({ select: () => ({ eq: () => ({ single }) }) }) }),
}));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: 'user-1', email: 'pat@example.test', phone: null }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));
vi.mock('@/lib/payments/stripe', () => ({ priceIdFor: () => 'price', stripe: () => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/funnel/events', () => ({ recordEvent: vi.fn() }));

import { createJoinLink, currentJoinLink, resetJoinLink } from '@/app/trips/[id]/actions';
import { isJoinTokenShape, joinToken } from '@/lib/trips/join-token';

const TRIP = '11111111-1111-1111-1111-111111111111';

function plannerGate(isPlanner: boolean) {
  rpc.mockImplementation(async (name: string) => (name === 'is_trip_planner' ? { data: isPlanner, error: null } : { data: null, error: null }));
}

beforeEach(() => {
  process.env.JOIN_LINK_SECRET = 's3cret';
  process.env.NEXT_PUBLIC_APP_URL = 'https://elsewhere.test/';
  rpc.mockReset();
  plannerGate(true);
  tripRow = { data: { end_date: '2026-11-10', join_token_expires_at: null }, error: null };
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('createJoinLink', () => {
  it('sets the hash through set_join_token and returns the link', async () => {
    const link = await createJoinLink(TRIP);
    const call = rpc.mock.calls.find(([name]) => name === 'set_join_token')!;
    expect(call[1].p_trip_id).toBe(TRIP);
    expect(link).toBe(`https://elsewhere.test/join/${call[1].p_token}`);
    expect(isJoinTokenShape(call[1].p_token)).toBe(true);
    expect(call[1].p_token).toBe(joinToken('s3cret', TRIP, call[1].p_expires_at));
  });

  it('refuses a non-planner before touching the token', async () => {
    plannerGate(false);
    await expect(createJoinLink(TRIP)).rejects.toThrow('Only the planner can do that.');
    expect(rpc.mock.calls.some(([name]) => name === 'set_join_token')).toBe(false);
  });

  it('never reuses the stored expiry, so a reset rotates the link', async () => {
    const first = await createJoinLink(TRIP);
    const stored = rpc.mock.calls.find(([name]) => name === 'set_join_token')![1].p_expires_at as string;
    rpc.mockClear();
    plannerGate(true);
    tripRow = { data: { end_date: '2026-11-10', join_token_expires_at: stored }, error: null };
    vi.useFakeTimers({ now: new Date(new Date(stored).getTime() - 7 * 24 * 3600 * 1000 - 0) });
    try {
      // Same millisecond remainder as the stored expiry would reproduce it exactly without the guard.
      const second = await createJoinLink(TRIP);
      expect(second).not.toBe(first);
    } finally {
      vi.useRealTimers();
    }
  });

  it('surfaces an RPC error', async () => {
    rpc.mockImplementation(async (name: string) => (name === 'is_trip_planner' ? { data: true, error: null } : { data: null, error: { message: 'invalid invite token' } }));
    await expect(createJoinLink(TRIP)).rejects.toThrow('invalid invite token');
  });
});

describe('currentJoinLink', () => {
  it('refuses a non-planner', async () => {
    plannerGate(false);
    await expect(currentJoinLink(TRIP)).rejects.toThrow('Only the planner can do that.');
  });

  it('rebuilds the same link from a Postgres timestamp', async () => {
    const iso = '2099-11-17T23:59:59.123Z';
    tripRow = { data: { join_token_expires_at: '2099-11-17T23:59:59.123+00:00' }, error: null };
    expect(await currentJoinLink(TRIP)).toBe(`https://elsewhere.test/join/${joinToken('s3cret', TRIP, iso)}`);
  });

  it('returns null when there is no link or it has expired', async () => {
    tripRow = { data: { join_token_expires_at: null }, error: null };
    expect(await currentJoinLink(TRIP)).toBeNull();
    tripRow = { data: { join_token_expires_at: '2020-01-01T00:00:00.000+00:00' }, error: null };
    expect(await currentJoinLink(TRIP)).toBeNull();
  });
});

describe('resetJoinLink', () => {
  it('redirects back with a note instead of throwing when the link cannot be made', async () => {
    tripRow = { data: { end_date: null, join_token_expires_at: null }, error: null };
    await expect(resetJoinLink(TRIP)).rejects.toThrow(`REDIRECT:/trips/${TRIP}?invite=failed`);
    expect(console.error).toHaveBeenCalledWith('createJoinLink failed', 'Set the trip dates before inviting the group.');
  });

  it('does nothing visible on success', async () => {
    await expect(resetJoinLink(TRIP)).resolves.toBeUndefined();
  });
});
