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

  it('refuses a reset that would leave the token unchanged', async () => {
    await rejects(
      () => asUser(db, PLANNER, () => db.query("select public.set_join_token($1, $2, now() + interval '7 days')", [tripId, 'c2-rotated-token-9876543210'])),
      /invite token unchanged/,
    );
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

describe('profile columns (Task 1)', () => {
  it('lets a user update the granted columns only', async () => {
    await asUser(db, MEMBER, () => db.query("update public.profiles set display_name = 'Sam S', venmo_username = 'sam-pays', cashtag = 'sampays', timezone = 'Asia/Kolkata', sms_opt_in = false where id = $1", [MEMBER]));
    const row = await asService(db, () => one<{ venmo_username: string; timezone: string }>('select venmo_username, timezone from public.profiles where id = $1', [MEMBER]));
    expect(row).toEqual({ venmo_username: 'sam-pays', timezone: 'Asia/Kolkata' });
  });

  it('refuses a user rewriting their own phone or email', async () => {
    await rejects(() => asUser(db, MEMBER, () => db.query("update public.profiles set phone = '+15551230000' where id = $1", [MEMBER])), /permission denied/);
    await rejects(() => asUser(db, MEMBER, () => db.query("update public.profiles set email = 'evil@example.test' where id = $1", [MEMBER])), /permission denied/);
  });
});

describe('claim_due_notifications (Task 2)', () => {
  const NOW = '2026-11-04T15:00:00Z';
  async function seed(n: number, extra = '') {
    await db.exec('delete from public.notifications');
    for (let i = 0; i < n; i += 1) {
      await db.query(
        `insert into public.notifications (user_id, channel, template, body, send_after, created_at ${extra ? ', status, claimed_at' : ''})
         values ($1, 'email', 't', $2, '2026-11-04T14:00:00Z', now() + ($3 || ' seconds')::interval ${extra ? ', ' + extra : ''})`,
        [MEMBER, `b${i}`, String(i)],
      );
    }
  }
  const claim = (limit: number) => asService(db, () => db.query<{ id: string; email: string }>('select * from public.claim_due_notifications($1, $2)', [NOW, limit]));

  it('never returns the same row to two concurrent claims', async () => {
    await seed(6);
    const [a, b] = await Promise.all([claim(4), claim(4)]);
    const ids = [...a.rows, ...b.rows].map((r) => r.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(a.rows[0].email).toBe('sam@example.test');
    expect((await claim(4)).rows).toHaveLength(0);
  });

  it('skips rows that are not yet due', async () => {
    await seed(1);
    await db.exec("update public.notifications set send_after = '2026-11-04T16:00:00Z'");
    expect((await claim(10)).rows).toHaveLength(0);
  });

  it('reclaims a stale sending row but not a fresh one', async () => {
    await seed(1, "'sending', '2026-11-04T14:30:00Z'::timestamptz");
    expect((await claim(10)).rows).toHaveLength(1);
    await seed(1, "'sending', '2026-11-04T14:55:00Z'::timestamptz");
    expect((await claim(10)).rows).toHaveLength(0);
  });

  it('is executable by the service role only', async () => {
    await rejects(() => asUser(db, MEMBER, () => db.query('select * from public.claim_due_notifications($1, 1)', [NOW])), /permission denied/);
    await db.exec('set role anon');
    try {
      await rejects(() => db.query('select * from public.claim_due_notifications($1, 1)', [NOW]), /permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('intake (Task 5)', () => {
  it('counts one booking_forwarded event per trip', async () => {
    const forwarded = () =>
      asService(db, () =>
        db.query("insert into public.funnel_telemetry_events (anonymous_id, event_name, trip_id) values ($1, 'booking_forwarded', $2)", ['aid000000000000000000000000000c5', tripId]),
      );
    await forwarded();
    await expect(forwarded()).rejects.toThrow(/funnel_forwarded_trip_idx/);
  });

  it('keeps a printed booking date or local date-time in bookings.booked_at, and nothing else', async () => {
    const insert = (key: string, bookedAt: string) =>
      asService(db, () =>
        db.query(
          `insert into public.bookings (trip_id, kind, provider, booked_at, extraction_confidence, dedupe_key) values ($1, 'flight', 'TAP Air Portugal', $2, 0.95, $3)`,
          [tripId, bookedAt, key],
        ),
      );
    await insert('booked-at-date', '2026-10-01');
    await insert('booked-at-time', '2026-10-01T09:30');
    await expect(insert('booked-at-bad', 'Oct 1, 2026')).rejects.toThrow(/violates check constraint/);
  });

  it('rejects an impossible booked_at, and hides the column from authenticated users', async () => {
    const insert = (key: string, bookedAt: string) =>
      asService(db, () =>
        db.query(
          `insert into public.bookings (trip_id, kind, provider, booked_at, extraction_confidence, dedupe_key) values ($1, 'flight', 'TAP', $2, 0.95, $3)`,
          [tripId, bookedAt, key],
        ),
      );
    await expect(insert('booked-at-99', '2026-99-99')).rejects.toThrow(/out of range|violates check constraint/);
    await expect(insert('booked-at-feb', '2026-02-30')).rejects.toThrow(/out of range|violates check constraint/);
    await expect(insert('booked-at-hour', '2026-10-01T25:00')).rejects.toThrow(/violates check constraint/);
    await rejects(() => asUser(db, PLANNER, () => db.query('select booked_at from public.bookings where trip_id = $1', [tripId])), /permission denied/);
  });

  describe('save_booking', () => {
    const booking = (key: string, segments = 2) =>
      JSON.stringify({
        kind: 'flight', provider: 'TAP Air Portugal', confirmation_code: 'ABC123', booked_via: null, booked_at: '2026-10-01',
        passenger_names: ['DOE/PAT MR'], confidence: 0.973, dedupe_key: key,
        segments: Array.from({ length: segments }, (_, n) => ({
          carrier_iata: 'TP', flight_number: String(204 + n), origin_iata: 'EWR', destination_iata: 'LIS', departure_local: `2026-11-0${3 + n}T18:15`, arrival_local: null,
        })),
      });
    const save = (messageId: string, json: string, confirmed = true) =>
      asService(db, () => one<{ out_booking_id: string; out_created: boolean }>('select * from public.save_booking($1, $2, $3::jsonb, $4)', [tripId, messageId, json, confirmed]));
    const message = async (providerId: string) =>
      (await asService(db, () => one<{ id: string }>("insert into public.inbound_messages (trip_id, source, provider_message_id) values ($1, 'email', $2) returning id", [tripId, providerId]))).id;
    const segmentCount = (bookingId: string) =>
      asService(db, async () => (await one<{ n: number }>('select count(*)::int as n from public.booking_segments where booking_id = $1', [bookingId])).n);

    it('saves a booking with its segments, and a second run for the same message adds nothing', async () => {
      const m1 = await message('em_sb_1');
      const first = await save(m1, booking('flight|SB1'));
      expect(first.out_created).toBe(true);
      expect(await segmentCount(first.out_booking_id)).toBe(2);
      const again = await save(m1, booking('flight|SB1'));
      expect(again).toEqual({ out_booking_id: first.out_booking_id, out_created: true });
      expect(await segmentCount(first.out_booking_id)).toBe(2);
    });

    it('heals a booking whose segments were never written, for the same message', async () => {
      const m = await message('em_sb_2');
      const inserted = await asService(db, () =>
        one<{ id: string }>(
          "insert into public.bookings (trip_id, inbound_message_id, kind, provider, extraction_confidence, dedupe_key) values ($1, $2, 'flight', 'TAP', 0.95, 'flight|SB2') returning id",
          [tripId, m],
        ),
      );
      expect(await segmentCount(inserted.id)).toBe(0);
      expect(await save(m, booking('flight|SB2'))).toEqual({ out_booking_id: inserted.id, out_created: true });
      expect(await segmentCount(inserted.id)).toBe(2);
    });

    it('leaves a booking another message saved alone', async () => {
      const first = await save(await message('em_sb_3'), booking('flight|SB3'));
      const other = await save(await message('em_sb_4'), booking('flight|SB3', 1));
      expect(other).toEqual({ out_booking_id: first.out_booking_id, out_created: false });
      expect(await segmentCount(first.out_booking_id)).toBe(2);
    });

    it('is not callable by authenticated users', async () => {
      await rejects(() => asUser(db, PLANNER, () => db.query('select * from public.save_booking($1, $2, $3::jsonb, true)', [tripId, tripId, booking('flight|SB5')])), /permission denied/);
    });
  });

  describe('claiming an inbound message', () => {
    it('claims for one run only, and lets that run re-claim', async () => {
      const { id } = await asService(db, () =>
        one<{ id: string }>("insert into public.inbound_messages (trip_id, source, provider_message_id) values ($1, 'email', 'em_claim_1') returning id", [tripId]),
      );
      const claim = (run: string) =>
        asService(db, () =>
          db.query(
            "update public.inbound_messages set status = 'processing', claimed_by = $2 where id = $1 and (status = 'received' or (status = 'processing' and claimed_by = $2)) returning id",
            [id, run],
          ),
        );
      expect((await claim('run-1')).rows).toHaveLength(1);
      expect((await claim('run-1')).rows).toHaveLength(1);
      expect((await claim('run-2')).rows).toHaveLength(0);
    });
  });
});

describe('document facts and checks (Task 7)', () => {
  it('stores nothing beyond issuing country, expiry and the REAL ID answer', async () => {
    const columns = await db.query<{ column_name: string }>("select column_name from information_schema.columns where table_schema = 'public' and table_name = 'member_documents'");
    expect(columns.rows.map((c) => c.column_name).sort()).toEqual(['expires_on', 'id', 'issuing_country', 'keep_on_profile', 'kind', 'real_id_compliant', 'updated_at', 'user_id']);
  });

  it('lets a member write and read only their own document facts; the planner and outsiders see none', async () => {
    await asUser(db, MEMBER, () =>
      db.query("insert into public.member_documents (user_id, kind, issuing_country, expires_on) values ($1, 'passport', 'US', '2027-01-15')", [MEMBER]),
    );
    expect((await asUser(db, MEMBER, () => db.query('select * from public.member_documents'))).rows).toHaveLength(1);
    expect((await asUser(db, PLANNER, () => db.query('select * from public.member_documents'))).rows).toHaveLength(0);
    expect((await asUser(db, OUTSIDER, () => db.query('select * from public.member_documents'))).rows).toHaveLength(0);
    await rejects(() =>
      asUser(db, PLANNER, () => db.query("insert into public.member_documents (user_id, kind, issuing_country, expires_on) values ($1, 'passport', 'US', '2030-01-01')", [MEMBER])),
    );
    const edited = await asUser(db, PLANNER, () => db.query("update public.member_documents set expires_on = '2030-01-01' where user_id = $1 returning id", [MEMBER]));
    expect(edited.rows).toHaveLength(0);
    expect((await asService(db, () => one<{ expires_on: string }>('select expires_on::text from public.member_documents where user_id = $1', [MEMBER]))).expires_on).toBe('2027-01-15');
  });

  it('shows the planner each member’s check results, but members cannot write checks and outsiders read none', async () => {
    await asService(db, () =>
      db.query(
        `insert into public.document_checks (trip_id, member_id, user_id, rule_id, rule_version, result, detail) values
         ($1, $2, $3, 'fixture-passport-validity-pt', 1, 'action_needed', 'Passport validity for Portugal')`,
        [tripId, memberMemberId, MEMBER],
      ),
    );
    const seen = await asUser(db, PLANNER, () => db.query<Record<string, unknown>>('select * from public.document_checks where trip_id = $1', [tripId]));
    expect(seen.rows).toHaveLength(1);
    expect(JSON.stringify(seen.rows)).not.toMatch(/\d{4}-\d{2}-\d{2}T?\d{0,2}.*2027|2027-01-15/);
    expect((await asUser(db, MEMBER, () => db.query('select * from public.document_checks'))).rows).toHaveLength(1);
    expect((await asUser(db, OUTSIDER, () => db.query('select * from public.document_checks'))).rows).toHaveLength(0);
    await rejects(() =>
      asUser(db, MEMBER, () =>
        db.query("insert into public.document_checks (trip_id, member_id, user_id, result, detail) values ($1, $2, $3, 'ok', 'fine')", [tripId, memberMemberId, MEMBER]),
      ),
    );
    const updated = await asUser(db, MEMBER, () => db.query("update public.document_checks set result = 'ok' returning id"));
    expect(updated.rows).toHaveLength(0);
  });
});

describe('replace_document_checks (Task 7 fix round)', () => {
  const row = (result: string, detail: string) => ({ member_id: memberMemberId, user_id: MEMBER, rule_id: null, rule_version: null, result, detail });
  const replace = (rows: unknown[]) => asService(db, () => db.query('select public.replace_document_checks($1, $2::jsonb)', [tripId, JSON.stringify(rows)]));
  const count = () => asService(db, async () => (await one<{ n: number }>('select count(*)::int as n from public.document_checks where trip_id = $1', [tripId])).n);

  it('replaces the trip’s checks in one step', async () => {
    await replace([row('unknown', 'a'), row('ok', 'b')]);
    expect(await count()).toBe(2);
    await replace([row('ok', 'c')]);
    expect(await count()).toBe(1);
  });

  it('keeps the existing checks when a row is invalid', async () => {
    await replace([row('ok', 'keep me')]);
    await expect(replace([row('ok', 'fine'), row('bogus', 'bad')])).rejects.toThrow();
    expect(await count()).toBe(1);
    expect((await asService(db, () => one<{ detail: string }>('select detail from public.document_checks where trip_id = $1', [tripId]))).detail).toBe('keep me');
  });

  it('is closed to members, the planner and anon', async () => {
    await rejects(() => asUser(db, PLANNER, () => db.query('select public.replace_document_checks($1, $2::jsonb)', [tripId, '[]'])), /permission denied/);
    await rejects(() => asUser(db, MEMBER, () => db.query('select public.replace_document_checks($1, $2::jsonb)', [tripId, '[]'])), /permission denied/);
  });
});

describe('booking seats (Task 8)', () => {
  let bookingId: string;
  let otherTripBookingId: string;

  beforeAll(async () => {
    bookingId = await asService(db, async () =>
      (await one<{ id: string }>(
        `insert into public.bookings (trip_id, kind, provider, confirmation_code, extraction_confidence, dedupe_key)
         values ($1, 'flight', 'TAP Air Portugal', 'C2SEAT', 0.97, 'seat-test') returning id`,
        [tripId],
      )).id,
    );
    const otherTrip = await asUser(db, OUTSIDER, async () =>
      (await one<{ id: string }>(
        `select public.create_trip('Elsewhere', 'FR', '2026-12-01', '2026-12-08', 'trip-c2otherc2oth', 'Olly', null, '{}'::jsonb) as id`,
      )).id,
    );
    otherTripBookingId = await asService(db, async () =>
      (await one<{ id: string }>(
        `insert into public.bookings (trip_id, kind, provider, extraction_confidence, dedupe_key) values ($1, 'flight', 'Air France', 0.97, 'other-trip') returning id`,
        [otherTrip],
      )).id,
    );
  });

  it('a member claims their own seat, and claiming again changes nothing', async () => {
    const claimed = await asUser(db, MEMBER, () => one<{ member: string }>('select public.claim_booking_seat($1) as member', [bookingId]));
    expect(claimed.member).toBe(memberMemberId);
    await asUser(db, MEMBER, () => db.query('select public.claim_booking_seat($1)', [bookingId]));
    const rows = await asService(db, () => db.query<{ member_id: string }>('select member_id from public.booking_members where booking_id = $1', [bookingId]));
    expect(rows.rows).toEqual([{ member_id: memberMemberId }]);
  });

  it('a member cannot put anyone else on a booking', async () => {
    await rejects(() =>
      asUser(db, MEMBER, () => db.query('insert into public.booking_members (booking_id, member_id, trip_id) values ($1, $2, $3)', [bookingId, plannerMemberId, tripId])),
    );
    const planner = await asService(db, () => db.query('select 1 from public.booking_members where booking_id = $1 and member_id = $2', [bookingId, plannerMemberId]));
    expect(planner.rows).toHaveLength(0);
  });

  it('a non-member cannot claim a seat, here or on another trip', async () => {
    await rejects(() => asUser(db, OUTSIDER, () => db.query('select public.claim_booking_seat($1)', [bookingId])), /not a member of this trip/);
    await rejects(() => asUser(db, MEMBER, () => db.query('select public.claim_booking_seat($1)', [otherTripBookingId])), /not a member of this trip/);
  });

  it('a member takes themselves off; the planner assigns anyone; anon cannot call it', async () => {
    const off = await asUser(db, MEMBER, () => db.query('delete from public.booking_members where booking_id = $1 and member_id = $2', [bookingId, memberMemberId]));
    expect(off.affectedRows).toBe(1);
    await asUser(db, PLANNER, () => db.query('insert into public.booking_members (booking_id, member_id, trip_id) values ($1, $2, $3)', [bookingId, memberMemberId, tripId]));
    const anon = await asService(db, () => one<{ ok: boolean }>("select has_function_privilege('anon', 'public.claim_booking_seat(uuid)', 'execute') as ok"));
    expect(anon.ok).toBe(false);
  });

  const codeFor = (user: string) => asUser(db, user, async () => (await one<{ code: string | null }>('select public.booking_confirmation_code($1) as code', [bookingId])).code);

  it('a self-claimed seat does not unlock the code; a planner assignment does', async () => {
    await asService(db, () => db.query('delete from public.booking_members where booking_id = $1', [bookingId]));
    await asUser(db, MEMBER, () => db.query('select public.claim_booking_seat($1)', [bookingId]));
    expect(await codeFor(MEMBER)).toBeNull();
    expect(await codeFor(PLANNER)).toBe('C2SEAT');
    await asUser(db, PLANNER, () => db.query('select public.assign_booking_member($1, $2)', [bookingId, memberMemberId]));
    expect(await codeFor(MEMBER)).toBe('C2SEAT');
    const rows = await asService(db, () => db.query('select self_claimed from public.booking_members where booking_id = $1', [bookingId]));
    expect(rows.rows).toEqual([{ self_claimed: false }]);
  });

  it('a planner-assigned member keeps the code when they claim again', async () => {
    await asUser(db, MEMBER, () => db.query('select public.claim_booking_seat($1)', [bookingId]));
    expect(await codeFor(MEMBER)).toBe('C2SEAT');
  });

  it('a member cannot flip self_claimed, and only the planner can assign', async () => {
    await asService(db, () => db.query('update public.booking_members set self_claimed = true where booking_id = $1', [bookingId]));
    await rejects(() => asUser(db, MEMBER, () => db.query('update public.booking_members set self_claimed = false where booking_id = $1', [bookingId])));
    expect(await codeFor(MEMBER)).toBeNull();
    await rejects(() => asUser(db, MEMBER, () => db.query('select public.assign_booking_member($1, $2)', [bookingId, memberMemberId])), /only the planner/);
    await rejects(() => asUser(db, OUTSIDER, () => db.query('select public.assign_booking_member($1, $2)', [bookingId, memberMemberId])), /only the planner/);
  });
});

describe('operating carrier (Task 10 fix round 1)', () => {
  it('accepts a null or two-character operator_iata and rejects anything else', async () => {
    const booking = await asService(db, () =>
      one<{ id: string }>("insert into public.bookings (trip_id, kind, provider, extraction_confidence, dedupe_key) values ($1, 'flight', 'TAP', 0.95, 'flight|OPER1') returning id", [tripId]),
    );
    const insert = (position: number, operator: string | null) =>
      db.query(
        "insert into public.booking_segments (booking_id, trip_id, position, carrier_iata, operator_iata, flight_number, origin_iata, destination_iata, departure_local) values ($1, $2, $3, 'KL', $4, '6101', 'EWR', 'LIS', '2026-11-03T18:15')",
        [booking.id, tripId, position, operator],
      );
    await asService(db, () => insert(1, null));
    await asService(db, () => insert(2, 'DL'));
    await rejects(() => asService(db, () => insert(3, 'dl')), /operator_iata|check/);
    await rejects(() => asService(db, () => insert(4, 'DLX')), /operator_iata|check/);
  });
});

describe('incident detection (Task 9)', () => {
  it('records an incident as detected once, however many writers report it', async () => {
    const booking = await asService(db, () =>
      one<{ id: string }>("insert into public.bookings (trip_id, kind, provider, extraction_confidence, dedupe_key) values ($1, 'flight', 'TAP', 0.95, 'flight|DET1') returning id", [tripId]),
    );
    const segment = await asService(db, () =>
      one<{ id: string }>(
        "insert into public.booking_segments (booking_id, trip_id, position, carrier_iata, flight_number, origin_iata, destination_iata, departure_local) values ($1, $2, 1, 'TP', '204', 'EWR', 'LIS', '2026-11-03T18:15') returning id",
        [booking.id, tripId],
      ),
    );
    const incident = await asService(db, () =>
      one<{ id: string }>("insert into public.incidents (trip_id, segment_id, event_type, dedupe_key) values ($1, $2, 'cancellation', 'det-1:cancellation') returning id", [tripId, segment.id]),
    );
    const insert = (kind: string) => db.query("insert into public.incident_events (incident_id, kind) values ($1, $2)", [incident.id, kind]);
    await asService(db, () => insert('detected'));
    await rejects(() => asService(db, () => insert('detected')), /incident_events_detected_once|duplicate key/);
    // Other kinds repeat freely.
    await asService(db, () => insert('notified'));
    await asService(db, () => insert('notified'));
    // ON CONFLICT DO NOTHING is a quiet no-op. (record.ts itself does a plain insert and reads the 23505 as success, because PostgREST cannot name a partial index.)
    await asService(db, () => db.query("insert into public.incident_events (incident_id, kind) values ($1, 'detected') on conflict do nothing", [incident.id]));
    const count = await asService(db, () => one<{ n: number }>("select count(*)::int as n from public.incident_events where incident_id = $1 and kind = 'detected'", [incident.id]));
    expect(count.n).toBe(1);
  });
});
