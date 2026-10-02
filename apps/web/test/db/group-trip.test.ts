import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createAuthUser, createTestDb, type TestDb } from './harness';

// C2's additions to 00012. C1's schema.test.ts covers the rest of the schema.
const PLANNER = '00000000-0000-4000-8000-0000000000c1';
const MEMBER = '00000000-0000-4000-8000-0000000000c2';
const OUTSIDER = '00000000-0000-4000-8000-0000000000c3';
const JOINER = '00000000-0000-4000-8000-0000000000c4';
const TOKEN = 'c2-invite-token-0123456789';
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

let db: TestDb;
let tripId: string;
let plannerMemberId: string;
let memberMemberId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<T>(sql, params);
  return result.rows[0] as T;
}
const rejects = (fn: () => Promise<unknown>, pattern: RegExp = /permission denied|row-level security|violates/) => expect(fn()).rejects.toThrow(pattern);

beforeAll(async () => {
  db = await createTestDb();
  await createAuthUser(db, { id: PLANNER, email: 'pat@example.test', displayName: 'Pat' });
  await createAuthUser(db, { id: MEMBER, email: 'sam@example.test', displayName: 'Sam' });
  await createAuthUser(db, { id: OUTSIDER, email: 'out@example.test' });
  await createAuthUser(db, { id: JOINER, email: 'jo@example.test' });
  tripId = await asUser(db, PLANNER, async () =>
    (await one<{ id: string }>(
      `select public.create_trip('Lisbon 2026', 'PT', '2026-11-03', '2026-11-10', 'trip-c2c2c2c2c2c2', 'Pat', null, '{}'::jsonb) as id`,
    )).id,
  );
  await asUser(db, PLANNER, () => db.query("select public.set_join_token($1, $2, now() + interval '7 days')", [tripId, TOKEN]));
  await asUser(db, MEMBER, () => db.query("select public.join_trip($1, 'Sam')", [TOKEN]));
  const members = await asService(db, () => db.query<{ id: string; user_id: string }>('select id, user_id from public.trip_members where trip_id = $1', [tripId]));
  plannerMemberId = members.rows.find((m) => m.user_id === PLANNER)!.id;
  memberMemberId = members.rows.find((m) => m.user_id === MEMBER)!.id;
}, 60_000);

describe('invite links (Task 1)', () => {
  it('stores only the hash of the token the planner sets, and rotating it retires the old link', async () => {
    const rotated = 'c2-rotated-token-9876543210';
    await asUser(db, PLANNER, () => db.query("select public.set_join_token($1, $2, now() + interval '7 days')", [tripId, rotated]));
    const stored = await asService(db, () => one<{ h: string }>('select join_token_hash as h from public.trips where id = $1', [tripId]));
    expect(stored.h).toBe(sha256(rotated));
    await rejects(() => asUser(db, JOINER, () => db.query("select public.join_trip($1, 'Jo')", [TOKEN])), /invalid or expired link/);
    await asUser(db, JOINER, () => db.query("select public.join_trip($1, 'Jo')", [rotated]));
    const joined = await asService(db, () => one<{ n: number }>('select count(*)::int as n from public.trip_members where trip_id = $1 and user_id = $2', [tripId, JOINER]));
    expect(joined.n).toBe(1);
  });

  it('refuses a member, an outsider, a short token, or a past expiry', async () => {
    await rejects(() => asUser(db, MEMBER, () => db.query("select public.set_join_token($1, $2, now() + interval '7 days')", [tripId, 'member-token-0123456789'])), /only the planner/);
    await rejects(() => asUser(db, OUTSIDER, () => db.query("select public.set_join_token($1, $2, now() + interval '7 days')", [tripId, 'outsider-token-0123456789'])), /only the planner/);
    await rejects(() => asUser(db, PLANNER, () => db.query("select public.set_join_token($1, 'short', now() + interval '7 days')", [tripId])), /invalid invite token/);
    await rejects(() => asUser(db, PLANNER, () => db.query("select public.set_join_token($1, $2, now() - interval '1 day')", [tripId, 'expired-token-0123456789'])), /invalid invite token/);
  });

  it('is closed to anon', async () => {
    const grants = await asService(db, () =>
      one<{ anon: boolean; signed_in: boolean }>(
        "select has_function_privilege('anon', 'public.set_join_token(uuid, text, timestamptz)', 'execute') as anon, has_function_privilege('authenticated', 'public.set_join_token(uuid, text, timestamptz)', 'execute') as signed_in",
      ),
    );
    expect(grants).toEqual({ anon: false, signed_in: true });
  });
});
