import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = { isPlanner: true, passStatus: 'none' as string };
const createSession = vi.fn(async () => ({ id: 'cs_test_1', url: 'https://checkout.example/cs_test_1' }));
const insert = vi.fn(async () => ({ error: null }));

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
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: 'user-1', email: 'p@example.com' }) }));
vi.mock('@/lib/funnel/events', () => ({ recordEvent: async () => undefined }));
vi.mock('@/lib/payments/stripe', () => ({
  priceIdFor: () => 'price_fake',
  stripe: () => ({ checkout: { sessions: { create: createSession } } }),
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({ insert }) }) }));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    rpc: async () => ({ data: state.isPlanner }),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { pass_status: state.passStatus }, error: null }) }) }),
    }),
  }),
}));

const TRIP = '0b0f3c1e-5a4b-4c1d-8f0e-2a1b3c4d5e6f';

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  state.isPlanner = true;
  state.passStatus = 'none';
  createSession.mockClear();
  insert.mockClear();
});

describe('startPassCheckout', () => {
  it('rejects a trip id that is not a uuid before touching Stripe', async () => {
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout('not-a-uuid')).rejects.toThrow();
    expect(createSession).not.toHaveBeenCalled();
  });

  it('refuses a non-planner', async () => {
    state.isPlanner = false;
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toThrow('Only the planner');
    expect(createSession).not.toHaveBeenCalled();
  });

  it.each(['active', 'comp'])('does not open a second checkout when the pass is %s', async (status) => {
    state.passStatus = status;
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toMatchObject({ url: `/trips/${TRIP}` });
    expect(createSession).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it('creates the session, records a pending pass, and redirects to Stripe', async () => {
    const { startPassCheckout } = await import('@/app/trips/[id]/actions');
    await expect(startPassCheckout(TRIP)).rejects.toMatchObject({ url: 'https://checkout.example/cs_test_1' });
    expect(createSession).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ trip_id: TRIP, stripe_session_id: 'cs_test_1', status: 'pending', price_variant: 'p19' }));
  });
});
