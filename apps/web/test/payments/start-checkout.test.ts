import { beforeEach, describe, expect, it, vi } from 'vitest';

const A_ID = 'b'.repeat(32);
const state = {
  isPlanner: true,
  passStatus: 'none' as string,
  cookies: {} as Record<string, string>,
  pending: [] as { stripe_session_id: string }[],
  sessions: {} as Record<string, { status: string; url: string | null }>,
};
const createSession = vi.fn(async (_args: unknown) => ({ id: 'cs_test_new', url: 'https://checkout.example/cs_test_new' }));
const retrieve = vi.fn(async (id: string) => state.sessions[id]);
const insert = vi.fn(async (_row: unknown) => ({ error: null }));
const recordEvent = vi.fn(async (_e: unknown) => undefined);
const rpc = vi.fn(async (_fn: string, _args: unknown) => ({ data: state.isPlanner }));
const rlsEq = vi.fn();
const rlsSelect = vi.fn();
const rlsFrom = vi.fn();
const adminFrom = vi.fn();
const passesEq: [string, unknown][] = [];
let gteArg: [string, string] | null = null;

class Redirect extends Error {
  constructor(public url: string) {
    super(`redirect ${url}`);
  }
}

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Redirect(url);
  },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (k: string) => (k in state.cookies ? { value: state.cookies[k] } : undefined) }) }));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: 'user-1', email: 'p@example.com' }) }));
vi.mock('@/lib/funnel/events', () => ({ recordEvent: (e: unknown) => recordEvent(e) }));
vi.mock('@/lib/payments/stripe', () => ({
  priceIdFor: (v: string) => `price_${v}`,
  stripe: () => ({ checkout: { sessions: { create: createSession, retrieve } } }),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      adminFrom(table);
      const q: Record<string, unknown> = {
        insert,
        select: () => q,
        eq: (c: string, v: unknown) => (passesEq.push([c, v]), q),
        gte: (c: string, v: string) => ((gteArg = [c, v]), q),
        order: async () => ({ data: state.pending, error: null }),
      };
      return q;
    },
  }),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc,
    from: (t: string) => {
      rlsFrom(t);
      return {
        select: (c: string) => {
          rlsSelect(c);
          return {
            eq: (col: string, v: unknown) => {
              rlsEq(col, v);
              return { maybeSingle: async () => ({ data: { pass_status: state.passStatus }, error: null }) };
            },
          };
        },
      };
    },
  }),
}));

const TRIP = '0b0f3c1e-5a4b-4c1d-8f0e-2a1b3c4d5e6f';

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  Object.assign(state, { isPlanner: true, passStatus: 'none', cookies: {}, pending: [], sessions: {} });
  passesEq.length = 0;
  gteArg = null;
  for (const fn of [createSession, retrieve, insert, recordEvent, rpc, rlsEq, rlsSelect, rlsFrom, adminFrom]) fn.mockClear();
});

describe('startPassCheckout', () => {
  it('rejects a trip id that is not a uuid before touching Stripe', async () => {
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout('not-a-uuid')).rejects.toThrow();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('refuses a non-planner, asking the RPC about this trip', async () => {
    state.isPlanner = false;
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toThrow('Only the planner');
    expect(rpc).toHaveBeenCalledWith('is_trip_planner', { p_trip_id: TRIP });
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each(['active', 'comp'])('does not open a second checkout when the pass is %s', async (status) => {
    state.passStatus = status;
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toMatchObject({ url: `/trips/${TRIP}` });
    expect(rlsFrom).toHaveBeenCalledWith('trips');
    expect(rlsSelect).toHaveBeenCalledWith('pass_status');
    expect(rlsEq).toHaveBeenCalledWith('id', TRIP);
    expect(createSession).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('creates a card-only session with the anonymous visitor’s variant, records the pass and the event', async () => {
    state.cookies = { elsewhere_aid: A_ID, elsewhere_utm: '' };
    const { assignVariant } = await import('@/lib/funnel/variant');
    const variant = assignVariant(A_ID);
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toMatchObject({ url: 'https://checkout.example/cs_test_new' });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'payment',
        allowed_payment_method_types: ['card'],
        client_reference_id: TRIP,
        line_items: [{ price: `price_${variant}`, quantity: 1 }],
        metadata: { trip_id: TRIP, variant },
      }),
    );
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ trip_id: TRIP, stripe_session_id: 'cs_test_new', status: 'pending', price_variant: variant, anonymous_id: A_ID, created_by: 'user-1' }),
    );
    expect(recordEvent).toHaveBeenCalledWith(expect.objectContaining({ anonymousId: A_ID, event: 'checkout_started', tripId: TRIP, variant, userId: 'user-1' }));
  });

  it('defaults to p19 with no visitor id and records no event', async () => {
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toMatchObject({ url: 'https://checkout.example/cs_test_new' });
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ line_items: [{ price: 'price_p19', quantity: 1 }] }));
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ price_variant: 'p19', anonymous_id: null }));
    expect(recordEvent).not.toHaveBeenCalled();
  });

  it('looks for this trip’s pending passes from the last 24 hours', async () => {
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toBeDefined();
    expect(adminFrom).toHaveBeenCalledWith('passes');
    expect(passesEq).toEqual([['trip_id', TRIP], ['status', 'pending']]);
    expect(gteArg?.[0]).toBe('created_at');
    expect(Date.now() - new Date(gteArg![1]).getTime()).toBeGreaterThan(23.9 * 3600_000);
  });

  it('sends the planner back to success when an earlier session already completed', async () => {
    state.pending = [{ stripe_session_id: 'cs_done' }];
    state.sessions = { cs_done: { status: 'complete', url: null } };
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toMatchObject({ url: `/trips/${TRIP}?pass=success` });
    expect(createSession).not.toHaveBeenCalled();
  });

  it('reuses an open session instead of creating another', async () => {
    state.pending = [{ stripe_session_id: 'cs_expired' }, { stripe_session_id: 'cs_open' }];
    state.sessions = { cs_expired: { status: 'expired', url: null }, cs_open: { status: 'open', url: 'https://checkout.example/cs_open' } };
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toMatchObject({ url: 'https://checkout.example/cs_open' });
    expect(createSession).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('creates a new session when the only pending one has expired', async () => {
    state.pending = [{ stripe_session_id: 'cs_expired' }];
    state.sessions = { cs_expired: { status: 'expired', url: null } };
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toMatchObject({ url: 'https://checkout.example/cs_test_new' });
    expect(createSession).toHaveBeenCalledTimes(1);
  });
});
