import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createAuthUser, createTestDb, type TestDb } from './harness';

const PLANNER = '00000000-0000-4000-8000-000000000001';
const MEMBER = '00000000-0000-4000-8000-000000000002';
const OUTSIDER = '00000000-0000-4000-8000-000000000003';
const TOKEN_HASH = 'a'.repeat(64);

let db: TestDb;
let tripId: string;
let bookingId: string;
let plannerMemberId: string;
let memberMemberId: string;

async function one<T>(sql: string, params: unknown[] = []): Promise<T> {
  const result = await db.query<T>(sql, params);
  return result.rows[0] as T;
}

beforeAll(async () => {
  db = await createTestDb();
  await createAuthUser(db, { id: PLANNER, email: 'Planner@Example.test', displayName: 'Pat' });
  await createAuthUser(db, { id: MEMBER, phone: '15551234567' });
  await createAuthUser(db, { id: OUTSIDER, email: 'out@example.test' });

  tripId = await asUser(db, PLANNER, async () =>
    (await one<{ id: string }>(
      `select public.create_trip('Lisbon 2026', 'PT', '2026-11-03', '2026-11-10', 'trip-abc234', 'Pat',
         'aid0000000000000000000000000000a', '{"utm_source":"tiktok"}'::jsonb) as id`,
    )).id,
  );
  await asService(db, () =>
    db.query("update public.trips set join_token_hash = $1, join_token_expires_at = now() + interval '7 days' where id = $2", [TOKEN_HASH, tripId]),
  );
  await asUser(db, MEMBER, () => db.query("select public.join_trip($1, 'Sam')", [TOKEN_HASH]));

  const members = await asService(db, () => db.query<{ id: string; user_id: string }>('select id, user_id from public.trip_members where trip_id = $1', [tripId]));
  plannerMemberId = members.rows.find((m) => m.user_id === PLANNER)!.id;
  memberMemberId = members.rows.find((m) => m.user_id === MEMBER)!.id;

  bookingId = await asService(db, async () =>
    (await one<{ id: string }>(
      `insert into public.bookings (trip_id, kind, provider, confirmation_code, passenger_names, extraction_confidence, dedupe_key)
       values ($1, 'flight', 'TAP Air Portugal', 'ABC123', '{PAT,SAM}', 0.97, 'ABC123|TP204|2026-11-03') returning id`,
      [tripId],
    )).id,
  );
  await asService(db, () =>
    db.query('insert into public.booking_members (booking_id, member_id, trip_id) values ($1, $2, $3)', [bookingId, plannerMemberId, tripId]),
  );
}, 60_000);

describe('profiles trigger', () => {
  it('normalizes email, prefixes phone, and falls back to a display name', async () => {
    const rows = await asService(db, () =>
      db.query<{ id: string; email: string | null; phone: string | null; display_name: string }>(
        'select id, email, phone, display_name from public.profiles order by id',
      ),
    );
    expect(rows.rows).toEqual([
      { id: PLANNER, email: 'planner@example.test', phone: null, display_name: 'Pat' },
      { id: MEMBER, email: null, phone: '+15551234567', display_name: 'Traveler' },
      { id: OUTSIDER, email: 'out@example.test', phone: null, display_name: 'out' },
    ]);
  });
});

describe('trips and membership', () => {
  it('create_trip makes the caller the planner and keeps the visitor attribution', async () => {
    const role = await asUser(db, PLANNER, () => one<{ role: string }>('select role from public.trip_members where trip_id = $1 and user_id = $2', [tripId, PLANNER]));
    expect(role.role).toBe('planner');
    const trip = await asService(db, () => one<{ created_anonymous_id: string; created_utm: Record<string, string> }>('select created_anonymous_id, created_utm from public.trips where id = $1', [tripId]));
    expect(trip).toEqual({ created_anonymous_id: 'aid0000000000000000000000000000a', created_utm: { utm_source: 'tiktok' } });
  });

  it('members read the trip; outsiders do not', async () => {
    const member = await asUser(db, MEMBER, () => db.query('select id from public.trips where id = $1', [tripId]));
    const outsider = await asUser(db, OUTSIDER, () => db.query('select id from public.trips where id = $1', [tripId]));
    expect(member.rows).toHaveLength(1);
    expect(outsider.rows).toHaveLength(0);
  });

  it('join_trip rejects an expired link', async () => {
    await asService(db, () => db.query("update public.trips set join_token_expires_at = now() - interval '1 minute' where id = $1", [tripId]));
    await expect(asUser(db, OUTSIDER, () => db.query("select public.join_trip($1, 'Olly')", [TOKEN_HASH]))).rejects.toThrow(/invalid or expired link/);
    await asService(db, () => db.query("update public.trips set join_token_expires_at = now() + interval '7 days' where id = $1", [tripId]));
  });

  it('trip_directory exposes pay handles to members only', async () => {
    await asUser(db, PLANNER, () => db.query("update public.profiles set venmo_username = 'pat-travels' where id = $1", [PLANNER]));
    const forMember = await asUser(db, MEMBER, () => db.query<{ display_name: string; venmo_username: string | null }>('select display_name, venmo_username from public.trip_directory($1)', [tripId]));
    const forOutsider = await asUser(db, OUTSIDER, () => db.query('select * from public.trip_directory($1)', [tripId]));
    expect(forMember.rows).toContainEqual({ display_name: 'Pat', venmo_username: 'pat-travels' });
    expect(forOutsider.rows).toHaveLength(0);
  });
});

describe('bookings', () => {
  it('hides the confirmation code column from direct reads', async () => {
    await expect(asUser(db, PLANNER, () => db.query('select confirmation_code from public.bookings'))).rejects.toThrow(/permission denied/);
    const visible = await asUser(db, MEMBER, () => db.query('select id, provider from public.bookings where trip_id = $1', [tripId]));
    expect(visible.rows).toHaveLength(1);
  });

  it('booking_confirmation_code returns the code to the planner and booking members only', async () => {
    const planner = await asUser(db, PLANNER, () => one<{ code: string | null }>('select public.booking_confirmation_code($1) as code', [bookingId]));
    const member = await asUser(db, MEMBER, () => one<{ code: string | null }>('select public.booking_confirmation_code($1) as code', [bookingId]));
    expect(planner.code).toBe('ABC123');
    expect(member.code).toBeNull();
  });
});

describe('documents', () => {
  it('member_documents are owner-only', async () => {
    await asUser(db, MEMBER, () => db.query("insert into public.member_documents (user_id, kind, issuing_country, expires_on) values ($1, 'passport', 'US', '2027-01-15')", [MEMBER]));
    const planner = await asUser(db, PLANNER, () => db.query('select * from public.member_documents'));
    const member = await asUser(db, MEMBER, () => db.query('select kind from public.member_documents'));
    expect(planner.rows).toHaveLength(0);
    expect(member.rows).toEqual([{ kind: 'passport' }]);
  });

  it('planners see every document check; members see their own', async () => {
    await asService(db, () =>
      db.query(
        `insert into public.document_checks (trip_id, member_id, user_id, rule_id, rule_version, result, detail)
         values ($1, $2, $3, 'x', 1, 'action_needed', 'Passport may not be valid long enough for Portugal.'),
                ($1, $4, $5, null, null, 'ok', 'No document issues found.')`,
        [tripId, memberMemberId, MEMBER, plannerMemberId, PLANNER],
      ),
    );
    const planner = await asUser(db, PLANNER, () => db.query('select result from public.document_checks where trip_id = $1', [tripId]));
    const member = await asUser(db, MEMBER, () => db.query('select result from public.document_checks where trip_id = $1', [tripId]));
    expect(planner.rows).toHaveLength(2);
    expect(member.rows).toEqual([{ result: 'action_needed' }]);
  });

  it('seeds the official travel-admin routes', async () => {
    const routes = await asUser(db, OUTSIDER, () => db.query<{ kind: string }>('select kind from public.travel_admin_partner_routes order by kind'));
    expect(routes.rows.map((r) => r.kind)).toEqual(['passport', 'real_id', 'global_entry', 'tsa_precheck']);
  });
});

describe('incidents', () => {
  it('are visible to affected members and the planner only', async () => {
    const segment = await asService(db, () =>
      one<{ id: string }>(
        `insert into public.booking_segments (booking_id, trip_id, position, carrier_iata, flight_number, origin_iata, destination_iata, departure_local)
         values ($1, $2, 1, 'TP', '204', 'EWR', 'LIS', '2026-11-03T18:15') returning id`,
        [bookingId, tripId],
      ),
    );
    await asService(db, () =>
      db.query(
        `insert into public.incidents (trip_id, segment_id, event_type, dedupe_key, affected_user_ids)
         values ($1, $2, 'cancellation', 'seg:cancellation', $3)`,
        [tripId, segment.id, `{${PLANNER}}`],
      ),
    );
    const planner = await asUser(db, PLANNER, () => db.query('select id from public.incidents'));
    const member = await asUser(db, MEMBER, () => db.query('select id from public.incidents'));
    expect(planner.rows).toHaveLength(1);
    expect(member.rows).toHaveLength(0);
  });
});

describe('growth tables and attribution', () => {
  it('are closed to signed-in users', async () => {
    await expect(asUser(db, PLANNER, () => db.query('select * from public.funnel_telemetry_events'))).resolves.toMatchObject({ rows: [] });
    await expect(asUser(db, PLANNER, () => db.query("select * from public.attribution_summary(now() - interval '1 day')"))).rejects.toThrow(/permission denied/);
  });

  it('attributes conversions to the last touch before them', async () => {
    const aid = 'aid0000000000000000000000000000a';
    await asService(db, async () => {
      await db.query(
        `insert into public.attribution_touchpoints (anonymous_id, post_id, platform, landing_path, created_at) values
           ($1, 'post-1', 'tiktok', '/rules', now() - interval '3 hours'),
           ($1, 'post-2', 'instagram', '/rules', now() - interval '2 hours')`,
        [aid],
      );
      await db.query(
        `insert into public.funnel_telemetry_events (anonymous_id, trip_id, event_name, created_at) values
           ($1, $2, 'booking_forwarded', now() - interval '1 hour'),
           ($1, $2, 'paid', now() - interval '30 minutes')`,
        [aid, tripId],
      );
    });
    const summary = await asService(db, () =>
      db.query<{ post_id: string; clicks: number; forwarded_bookings: number; paid_passes: number }>(
        "select post_id, clicks::int, forwarded_bookings::int, paid_passes::int from public.attribution_summary(now() - interval '1 day')",
      ),
    );
    expect(summary.rows).toEqual([
      { post_id: 'post-1', clicks: 1, forwarded_bookings: 0, paid_passes: 0 },
      { post_id: 'post-2', clicks: 1, forwarded_bookings: 1, paid_passes: 1 },
    ]);
  });
});
