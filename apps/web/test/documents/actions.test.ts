import { beforeEach, describe, expect, it, vi } from 'vitest';

const upserts: { table: string; rows: Record<string, unknown>[] }[] = [];
const inserts: { table: string; row: Record<string, unknown> }[] = [];
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      upsert: async (rows: Record<string, unknown>[]) => {
        upserts.push({ table, rows });
        return { error: null };
      },
      insert: async (row: Record<string, unknown>) => {
        inserts.push({ table, row });
        return { error: null };
      },
    }),
  }),
}));
vi.mock('@/lib/auth/user', () => ({ requireUser: async () => ({ id: 'user-1' }) }));
const runDocumentChecks = vi.hoisted(() => vi.fn(async (_tripId: string) => undefined));
vi.mock('@/lib/documents/service', () => ({ runDocumentChecks }));
vi.mock('next/cache', () => ({ revalidatePath: () => undefined }));

import { saveDocuments } from '@/app/trips/[id]/documents/actions';

const TRIP = '11111111-1111-1111-1111-111111111111';
function form(values: Record<string, string>) {
  const data = new FormData();
  for (const [k, v] of Object.entries({ passportCountry: 'us', passportExpires: '2027-01-15', realId: 'yes', consent: 'on', ...values })) data.set(k, v);
  return data;
}

beforeEach(() => {
  upserts.length = 0;
  inserts.length = 0;
  runDocumentChecks.mockClear();
});

describe('saveDocuments', () => {
  it('stores only issuing country, expiry and the REAL ID answer, then re-checks the trip', async () => {
    const state = await saveDocuments(TRIP, { error: null, saved: false }, form({}));
    expect(state).toEqual({ error: null, saved: true });
    expect(upserts).toHaveLength(1);
    expect(upserts[0].rows).toEqual([
      { user_id: 'user-1', kind: 'passport', issuing_country: 'US', expires_on: '2027-01-15', keep_on_profile: false, updated_at: expect.any(String) },
      { user_id: 'user-1', kind: 'real_id', real_id_compliant: true, keep_on_profile: false, updated_at: expect.any(String) },
    ]);
    expect(runDocumentChecks).toHaveBeenCalledWith(TRIP);
  });

  it('ignores extra fields such as a passport number, date of birth or another user id', async () => {
    await saveDocuments(TRIP, { error: null, saved: false }, form({ passportNumber: '123456789', dateOfBirth: '1990-01-01', user_id: 'someone-else', loyaltyNumber: 'AB1234' }));
    const written = JSON.stringify([upserts, inserts]);
    for (const secret of ['123456789', '1990-01-01', 'someone-else', 'AB1234']) expect(written).not.toContain(secret);
    expect(upserts[0].rows.every((r) => r.user_id === 'user-1')).toBe(true);
  });

  it('refuses to save without the consent box, and writes nothing', async () => {
    const data = form({});
    data.delete('consent');
    const state = await saveDocuments(TRIP, { error: null, saved: false }, data);
    expect(state.saved).toBe(false);
    expect(state.error).toMatch(/Tick the box/);
    expect(upserts).toHaveLength(0);
    expect(runDocumentChecks).not.toHaveBeenCalled();
  });

  it('rejects a malformed country or date', async () => {
    expect((await saveDocuments(TRIP, { error: null, saved: false }, form({ passportCountry: 'USA' }))).saved).toBe(false);
    expect((await saveDocuments(TRIP, { error: null, saved: false }, form({ passportExpires: 'next year' }))).saved).toBe(false);
    expect(upserts).toHaveLength(0);
  });
});
