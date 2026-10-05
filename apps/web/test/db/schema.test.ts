import { createHash } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { asService, asUser, createAuthUser, createTestDb, type TestDb } from './harness';

const PLANNER = '00000000-0000-4000-8000-000000000001';
const MEMBER = '00000000-0000-4000-8000-000000000002';
const OUTSIDER = '00000000-0000-4000-8000-000000000003';
const TOKEN = 'raw-invite-token-0123456789';
const TOKEN_HASH = createHash('sha256').update(TOKEN).digest('hex');

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
  await asUser(db, MEMBER, () => db.query("select public.join_trip($1, 'Sam')", [TOKEN]));

  const members = await asService(db, () => db.query<{ id: string; user_id: string }>('select id, user_id from public.trip_members where trip_id = $1', [tripId]));
  plannerMemberId = members.rows.find((m) => m.user_id === PLANNER)!.id;
  memberMemberId = members.rows.find((m) => m.user_id === MEMBER)!.id;

  bookingId = await asService(db, async () =>
    (await one<{ id: string }>(
      `insert into public.bookings (trip_id, kind, provider, confirmation_code, passenger_names, extraction_confidence, dedupe_key)
       values ($1, 'flight', 'TAP Air Portugal', 'ABC123', '{PAT,SAM}', 0.97, 'flight|TP204|2026-11-03|pat-sam') returning id`,
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
    try {
      await expect(asUser(db, OUTSIDER, () => db.query("select public.join_trip($1, 'Olly')", [TOKEN]))).rejects.toThrow(/invalid or expired link/);
    } finally {
      await asService(db, () => db.query("update public.trips set join_token_expires_at = now() + interval '7 days' where id = $1", [tripId]));
    }
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

  it('dedupes rule_page_view per visitor, rule and UTC day', async () => {
    const aid = 'aid0000000000000000000000000000b';
    const view = (rule: string) =>
      asService(db, () =>
        db.query("insert into public.funnel_telemetry_events (anonymous_id, event_name, rule_id) values ($1, 'rule_page_view', $2)", [aid, rule]),
      );
    await view('r1');
    await expect(view('r1')).rejects.toThrow(/funnel_page_view_daily_idx/);
    await expect(view('r2')).resolves.toBeDefined();
  });

  it('dedupes offer_click per visitor, rule and UTC day', async () => {
    const aid = 'aid0000000000000000000000000000c';
    const click = (rule: string) =>
      asService(db, () =>
        db.query("insert into public.funnel_telemetry_events (anonymous_id, event_name, rule_id) values ($1, 'offer_click', $2)", [aid, rule]),
      );
    await click('r1');
    await expect(click('r1')).rejects.toThrow(/funnel_offer_click_daily_idx/);
    await expect(click('r2')).resolves.toBeDefined();
  });

  it('allows only one paid event per trip', async () => {
    const paid = () =>
      asService(db, () =>
        db.query("insert into public.funnel_telemetry_events (anonymous_id, event_name, trip_id) values ($1, 'paid', $2)", ['aid0000000000000000000000000000d', tripId]),
      );
    await paid();
    await expect(paid()).rejects.toThrow(/funnel_paid_trip_idx/);
    await asService(db, () => db.query("delete from public.funnel_telemetry_events where anonymous_id = 'aid0000000000000000000000000000d'"));
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

describe('write paths are closed (non-superuser roles)', () => {
  const rejects = (fn: () => Promise<unknown>) => expect(fn()).rejects.toThrow(/permission denied|row-level security|violates/);

  it('a member cannot promote themselves or move to another trip', async () => {
    await rejects(() => asUser(db, MEMBER, () => db.query("update public.trip_members set role = 'planner' where user_id = $1", [MEMBER])));
    await rejects(() => asUser(db, MEMBER, () => db.query('update public.trip_members set trip_id = gen_random_uuid() where user_id = $1', [MEMBER])));
    const ok = await asUser(db, MEMBER, () => db.query("update public.trip_members set display_name = 'Sammy' where user_id = $1", [MEMBER]));
    expect(ok.affectedRows).toBe(1);
    const role = await asService(db, () => one<{ role: string }>('select role from public.trip_members where user_id = $1', [MEMBER]));
    expect(role.role).toBe('member');
  });

  it('a planner cannot set pass_status or rewrite owner, invite, or attribution columns', async () => {
    for (const col of ["pass_status = 'active'", `owner_id = '${OUTSIDER}'`, "inbound_code = 'trip-hijack'", "join_token_hash = 'x'", "created_utm = '{}'"]) {
      await rejects(() => asUser(db, PLANNER, () => db.query(`update public.trips set ${col} where id = $1`, [tripId])));
    }
    const ok = await asUser(db, PLANNER, () => db.query("update public.trips set name = 'Lisbon!' where id = $1", [tripId]));
    expect(ok.affectedRows).toBe(1);
    const asMember = await asUser(db, MEMBER, () => db.query("update public.trips set name = 'nope' where id = $1", [tripId]));
    expect(asMember.affectedRows).toBe(0);
    const trip = await asService(db, () => one<{ pass_status: string }>('select pass_status from public.trips where id = $1', [tripId]));
    expect(trip.pass_status).toBe('none');
  });

  it('members cannot read the join hash or inbound code; the planner gets the code via the accessor', async () => {
    await rejects(() => asUser(db, MEMBER, () => db.query('select join_token_hash from public.trips')));
    await rejects(() => asUser(db, PLANNER, () => db.query('select inbound_code from public.trips')));
    const planner = await asUser(db, PLANNER, () => one<{ c: string | null }>('select public.trip_inbound_code($1) as c', [tripId]));
    const member = await asUser(db, MEMBER, () => one<{ c: string | null }>('select public.trip_inbound_code($1) as c', [tripId]));
    expect(planner.c).toBe('trip-abc234');
    expect(member.c).toBeNull();
  });

  it('join_trip rejects the stored hash used as a token', async () => {
    await expect(asUser(db, OUTSIDER, () => db.query("select public.join_trip($1, 'Olly')", [TOKEN_HASH]))).rejects.toThrow(/invalid or expired link/);
  });

  it('a member cannot assign themselves to a booking; non-planner booking members see the code', async () => {
    await rejects(() => asUser(db, MEMBER, () => db.query('insert into public.booking_members (booking_id, member_id, trip_id) values ($1, $2, $3)', [bookingId, memberMemberId, tripId])));
    const before = await asUser(db, MEMBER, () => one<{ code: string | null }>('select public.booking_confirmation_code($1) as code', [bookingId]));
    expect(before.code).toBeNull();
    await asUser(db, PLANNER, () => db.query('insert into public.booking_members (booking_id, member_id, trip_id) values ($1, $2, $3)', [bookingId, memberMemberId, tripId]));
    const after = await asUser(db, MEMBER, () => one<{ code: string | null }>('select public.booking_confirmation_code($1) as code', [bookingId]));
    expect(after.code).toBe('ABC123');
    const outsider = await asUser(db, OUTSIDER, () => one<{ code: string | null }>('select public.booking_confirmation_code($1) as code', [bookingId]));
    expect(outsider.code).toBeNull();
    await asUser(db, PLANNER, () => db.query('delete from public.booking_members where booking_id = $1 and member_id = $2', [bookingId, memberMemberId]));
  });

  it('planners cannot edit protected booking columns or read dedupe_key', async () => {
    for (const col of ["confirmation_code = 'ZZZ999'", "dedupe_key = 'x'", 'extraction_confidence = 0.1', `trip_id = '${tripId}'`]) {
      await rejects(() => asUser(db, PLANNER, () => db.query(`update public.bookings set ${col} where id = $1`, [bookingId])));
    }
    await rejects(() => asUser(db, PLANNER, () => db.query('select dedupe_key from public.bookings')));
    const ok = await asUser(db, PLANNER, () => db.query("update public.bookings set booked_via = 'Direct' where id = $1", [bookingId]));
    expect(ok.affectedRows).toBe(1);
  });

  it('votes and action items cannot change trip or assignees; responses cannot pick another vote option', async () => {
    const mk = async (title: string) => {
      const v = await asUser(db, MEMBER, () => one<{ id: string }>(
        "insert into public.votes (trip_id, title, detail, created_by) values ($1, $2, 'd', $3) returning id", [tripId, title, MEMBER]));
      const o = await asUser(db, MEMBER, () => one<{ id: string }>(
        "insert into public.vote_options (vote_id, label, position) values ($1, 'A', 1) returning id", [v.id]));
      return { vote: v.id, option: o.id };
    };
    const a = await mk('A');
    const b = await mk('B');
    await rejects(() => asUser(db, MEMBER, () => db.query('update public.votes set trip_id = gen_random_uuid() where id = $1', [a.vote])));
    await rejects(() => asUser(db, PLANNER, () => db.query('insert into public.vote_responses (vote_id, user_id, option_id) values ($1, $2, $3)', [a.vote, PLANNER, b.option])));
    await asUser(db, PLANNER, () => db.query('select public.respond_vote($1, $2)', [a.vote, a.option]));
    await rejects(() => asUser(db, PLANNER, () => db.query('update public.vote_responses set option_id = $1 where vote_id = $2', [b.option, a.vote])));

    const item = await asService(db, () => one<{ id: string }>(
      `insert into public.action_items (trip_id, kind, title, detail, assigned_user_ids, source_kind)
       values ($1, 'document', 't', 'd', $2, 'document_check') returning id`, [tripId, `{${MEMBER}}`]));
    await rejects(() => asUser(db, MEMBER, () => db.query('update public.action_items set trip_id = gen_random_uuid() where id = $1', [item.id])));
    await rejects(() => asUser(db, MEMBER, () => db.query(`update public.action_items set assigned_user_ids = '{}' where id = $1`, [item.id])));
    const ok = await asUser(db, MEMBER, () => db.query("update public.action_items set status = 'done' where id = $1", [item.id]));
    expect(ok.affectedRows).toBe(1);
  });

  it('an affected non-planner reads the incident', async () => {
    await asService(db, () => db.query('update public.incidents set affected_user_ids = $1', [`{${MEMBER}}`]));
    const member = await asUser(db, MEMBER, () => db.query('select id from public.incidents'));
    const outsider = await asUser(db, OUTSIDER, () => db.query('select id from public.incidents'));
    expect(member.rows).toHaveLength(1);
    expect(outsider.rows).toHaveLength(0);
  });
});
