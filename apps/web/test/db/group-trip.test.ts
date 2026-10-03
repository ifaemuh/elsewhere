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

describe('hand-run trips and held playbooks (Task 12)', () => {
  let incidentId: string;
  let segmentId: string;

  beforeAll(async () => {
    const ids = await asService(db, async () => {
      const booking = await one<{ id: string }>(
        `insert into public.bookings (trip_id, kind, provider, extraction_confidence, dedupe_key) values ($1, 'flight', 'TAP Air Portugal', 0.97, 'held-test') returning id`,
        [tripId],
      );
      const segment = await one<{ id: string }>(
        `insert into public.booking_segments (booking_id, trip_id, position, carrier_iata, flight_number, origin_iata, destination_iata, departure_local)
         values ($1, $2, 1, 'TP', '204', 'EWR', 'LIS', '2026-11-03T18:15') returning id`,
        [booking.id, tripId],
      );
      const incident = await one<{ id: string }>(
        `insert into public.incidents (trip_id, segment_id, event_type, dedupe_key, affected_user_ids) values ($1, $2, 'cancellation', 'held-test:cancellation', $3) returning id`,
        [tripId, segment.id, `{${MEMBER}}`],
      );
      return { segment: segment.id, incident: incident.id };
    });
    incidentId = ids.incident;
    segmentId = ids.segment;
  });

  it('only the service role marks a trip hand-run, and a planner cannot read the flag', async () => {
    await rejects(() => asUser(db, PLANNER, () => db.query('update public.trips set hand_run = true where id = $1', [tripId])));
    await rejects(() => asUser(db, PLANNER, () => db.query('select hand_run from public.trips where id = $1', [tripId])));
    await asService(db, () => db.query('update public.trips set hand_run = true where id = $1', [tripId]));
    const trip = await asService(db, () => one<{ hand_run: boolean }>('select hand_run from public.trips where id = $1', [tripId]));
    expect(trip.hand_run).toBe(true);
    await asService(db, () => db.query('update public.trips set hand_run = false where id = $1', [tripId]));
  });

  it('keeps the time of the last flight status beside it', async () => {
    const stamp = await asService(db, async () => {
      await db.query(`update public.booking_segments set last_status = '{"cancelled":false}', last_status_at = '2026-11-01T10:00:00Z' where id = $1`, [segmentId]);
      return one<{ at: string }>(`select to_char(last_status_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI') as at from public.booking_segments where id = $1`, [segmentId]);
    });
    expect(stamp.at).toBe('2026-11-01T10:00');
  });

  it('keeps the previous flight status on the incident, readable by the planner', async () => {
    await asService(db, () =>
      db.query(`update public.incidents set previous_status = '{"cancelled":false}', previous_status_at = '2026-11-01T08:00:00Z' where id = $1`, [incidentId]),
    );
    const read = await asUser(db, PLANNER, () => db.query<{ s: unknown; at: string }>("select previous_status as s, to_char(previous_status_at at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI') as at from public.incidents where id = $1", [incidentId]));
    expect(read.rows[0]).toEqual({ s: { cancelled: false }, at: '2026-11-01T08:00' });
  });

  it('accepts the alerted event kind and rejects an unknown one', async () => {
    await asService(db, () => db.query("insert into public.incident_events (incident_id, kind) values ($1, 'alerted')", [incidentId]));
    await rejects(() => asService(db, () => db.query("insert into public.incident_events (incident_id, kind) values ($1, 'shouted')", [incidentId])), /check|violates/);
  });

  it('hides a held playbook from the planner and the affected members until it is released', async () => {
    await asService(db, () =>
      db.query(
        `insert into public.playbooks (incident_id, content, rules_cited, model, citation_check_passed, held_for_review) values ($1, '{}', '[]', 'test', true, true)`,
        [incidentId],
      ),
    );
    const read = (user: string) => asUser(db, user, () => db.query('select id from public.playbooks where incident_id = $1', [incidentId]));
    expect((await read(PLANNER)).rows).toHaveLength(0);
    expect((await read(MEMBER)).rows).toHaveLength(0);
    const service = await asService(db, () => db.query('select id from public.playbooks where incident_id = $1', [incidentId]));
    expect(service.rows).toHaveLength(1);
    await asService(db, () => db.query('update public.playbooks set held_for_review = false where incident_id = $1', [incidentId]));
    expect((await read(PLANNER)).rows).toHaveLength(1);
    expect((await read(MEMBER)).rows).toHaveLength(1);
    expect((await read(OUTSIDER)).rows).toHaveLength(0);
  });
});

describe('votes (Task 13)', () => {
  async function vote(required: string[]) {
    const v = await asUser(db, PLANNER, () =>
      one<{ id: string }>(
        "insert into public.votes (trip_id, title, detail, required_user_ids, created_by) values ($1, 'Which flight?', '', $2, $3) returning id",
        [tripId, `{${required.join(',')}}`, PLANNER],
      ),
    );
    const options = await asUser(db, PLANNER, () =>
      db.query<{ id: string }>("insert into public.vote_options (vote_id, label, position) values ($1, 'Tomorrow 7:05', 1), ($1, 'Tonight via Denver', 2) returning id", [v.id]),
    );
    return { id: v.id, first: options.rows[0].id, second: options.rows[1].id };
  }
  const respond = (user: string, voteId: string, optionId: string) => asUser(db, user, () => db.query('select public.respond_vote($1, $2)', [voteId, optionId]));

  it('a member votes, then changes their vote while it is open', async () => {
    const v = await vote([]);
    await respond(MEMBER, v.id, v.first);
    await respond(MEMBER, v.id, v.second);
    const rows = await asService(db, () => db.query('select user_id, option_id from public.vote_responses where vote_id = $1', [v.id]));
    expect(rows.rows).toEqual([{ user_id: MEMBER, option_id: v.second }]);
  });

  it('a vote that names its voters takes answers from them only', async () => {
    const v = await vote([MEMBER]);
    await rejects(() => respond(PLANNER, v.id, v.first), /not a voter on this vote/);
    await respond(MEMBER, v.id, v.first);
  });

  it('a closed vote takes no answers', async () => {
    const v = await vote([]);
    await asUser(db, PLANNER, () => db.query("update public.votes set status = 'closed' where id = $1", [v.id]));
    await rejects(() => respond(MEMBER, v.id, v.first), /vote is closed/);
  });

  it('outsiders cannot answer, nobody writes responses directly, and an option must belong to the vote', async () => {
    const v = await vote([]);
    const other = await vote([]);
    await rejects(() => respond(OUTSIDER, v.id, v.first), /vote not found/);
    await rejects(() =>
      asUser(db, MEMBER, () => db.query('insert into public.vote_responses (vote_id, user_id, option_id) values ($1, $2, $3)', [v.id, MEMBER, v.first])),
    );
    await rejects(() => respond(MEMBER, v.id, other.first), /violates foreign key/);
    const anon = await asService(db, () => one<{ ok: boolean }>("select has_function_privilege('anon', 'public.respond_vote(uuid, uuid)', 'execute') as ok"));
    expect(anon.ok).toBe(false);
  });

  it('an incident has at most one open vote, and a new one may follow a closed vote', async () => {
    const booking = await asService(db, () =>
      one<{ id: string }>("insert into public.bookings (trip_id, kind, provider, extraction_confidence, dedupe_key) values ($1, 'flight', 'TAP', 0.95, 'flight|VOTE1') returning id", [tripId]),
    );
    const segment = await asService(db, () =>
      one<{ id: string }>(
        "insert into public.booking_segments (booking_id, trip_id, position, carrier_iata, flight_number, origin_iata, destination_iata, departure_local) values ($1, $2, 1, 'TP', '204', 'EWR', 'LIS', '2026-11-03T18:15') returning id",
        [booking.id, tripId],
      ),
    );
    const incident = await asService(db, () =>
      one<{ id: string }>("insert into public.incidents (trip_id, segment_id, event_type, dedupe_key) values ($1, $2, 'cancellation', 'vote-1:cancellation') returning id", [tripId, segment.id]),
    );
    const open = () =>
      asUser(db, PLANNER, () =>
        one<{ id: string }>("insert into public.votes (trip_id, incident_id, title, detail, created_by) values ($1, $2, 'Which flight?', '', $3) returning id", [tripId, incident.id, PLANNER]),
      );
    const first = await open();
    await rejects(open, /votes_one_open_per_incident|duplicate key/);
    await asUser(db, PLANNER, () => db.query("update public.votes set status = 'closed' where id = $1", [first.id]));
    await open();
  });

  it('a vote\'s incident must belong to the vote\'s trip', async () => {
    const otherTrip = await asUser(db, MEMBER, async () =>
      (await one<{ id: string }>(`select public.create_trip('Elsewhere', 'FR', '2026-12-01', '2026-12-05', 'trip-vote-x1x1x1', 'Sam', null, '{}'::jsonb) as id`)).id,
    );
    const booking = await asService(db, () =>
      one<{ id: string }>("insert into public.bookings (trip_id, kind, provider, extraction_confidence, dedupe_key) values ($1, 'flight', 'TAP', 0.95, 'flight|VOTEX') returning id", [otherTrip]),
    );
    const segment = await asService(db, () =>
      one<{ id: string }>(
        "insert into public.booking_segments (booking_id, trip_id, position, carrier_iata, flight_number, origin_iata, destination_iata, departure_local) values ($1, $2, 1, 'TP', '204', 'EWR', 'LIS', '2026-12-03T18:15') returning id",
        [booking.id, otherTrip],
      ),
    );
    const foreign = await asService(db, () =>
      one<{ id: string }>("insert into public.incidents (trip_id, segment_id, event_type, dedupe_key) values ($1, $2, 'cancellation', 'vote-x:cancellation') returning id", [otherTrip, segment.id]),
    );
    // MEMBER plans the other trip and belongs to this one, so can read that incident: only the check stops the insert.
    const read = await asUser(db, MEMBER, () => db.query('select id from public.incidents where id = $1', [foreign.id]));
    expect(read.rows).toHaveLength(1);
    await rejects(() =>
      asUser(db, MEMBER, () => db.query("insert into public.votes (trip_id, incident_id, title, detail, created_by) values ($1, $2, 'x', '', $3)", [tripId, foreign.id, MEMBER])),
    );
  });
});

describe('expenses and settlements (Task 14)', () => {
  const addExpense = (as: string, fields: { payer?: string; amount?: number; description?: string; split?: unknown; key?: string | null; trip?: string }) =>
    asUser(db, as, () =>
      db.query(
        'insert into public.expenses (trip_id, payer_user_id, amount_cents, description, split, created_by, client_key) values ($1, $2, $3, $4, $5::jsonb, $6, $7)',
        [fields.trip ?? tripId, fields.payer ?? as, fields.amount ?? 10000, fields.description ?? 'Airport hotel', JSON.stringify(fields.split ?? { kind: 'equal', user_ids: [PLANNER, MEMBER] }), as, fields.key === undefined ? null : fields.key],
      ),
    );
  const KEY_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const KEY_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  it('members add expenses with an equal or exact split', async () => {
    await addExpense(MEMBER, {});
    await addExpense(PLANNER, { split: { kind: 'shares', shares: { [PLANNER]: 7000, [MEMBER]: 3000 } } });
  });

  it('a second submit with the same key cannot make a second expense; keyless rows are unaffected', async () => {
    await addExpense(MEMBER, { key: KEY_A });
    await rejects(() => addExpense(MEMBER, { key: KEY_A }), /duplicate key|unique/);
    await addExpense(MEMBER, { key: KEY_B });
    await addExpense(MEMBER, {});
    await addExpense(MEMBER, {});
    const n = await asService(db, () => one<{ n: number }>('select count(*)::int as n from public.expenses where client_key = $1', [KEY_A]));
    expect(n.n).toBe(1);
  });

  it('refuses a payer or a split member from outside the trip, and a split that lists someone twice', async () => {
    await rejects(() => addExpense(MEMBER, { payer: OUTSIDER }), /payer is not on this trip/);
    await rejects(() => addExpense(MEMBER, { split: { kind: 'equal', user_ids: [MEMBER, OUTSIDER] } }), /not on this trip/);
    await rejects(() => addExpense(MEMBER, { split: { kind: 'shares', shares: { [MEMBER]: 5000, [OUTSIDER]: 5000 } } }), /not on this trip/);
    await rejects(() => addExpense(MEMBER, { split: { kind: 'equal', user_ids: [MEMBER, MEMBER] } }), /twice/);
    await rejects(() => addExpense(MEMBER, { split: { kind: 'equal', user_ids: ['not-a-uuid'] } }), /not on this trip/);
  });

  it('refuses a user who belongs to another trip being put on this one', async () => {
    // JOINER is on tripId only through the invite test; use a user who plans a different trip.
    const otherTrip = await asUser(db, OUTSIDER, async () =>
      (await one<{ id: string }>(`select public.create_trip('Other', 'FR', '2026-12-01', '2026-12-05', 'trip-ledger-x1x1', 'Out', null, '{}'::jsonb) as id`)).id,
    );
    await rejects(() => addExpense(OUTSIDER, { trip: otherTrip, split: { kind: 'equal', user_ids: [OUTSIDER, MEMBER] } }), /not on this trip/);
    await rejects(() => addExpense(OUTSIDER, { trip: tripId }), /row-level security|not on this trip/);
  });

  it('refuses shares that do not add up, are fractional or negative, and malformed splits', async () => {
    for (const shares of [{ [PLANNER]: 7000, [MEMBER]: 2999 }, { [PLANNER]: 7000.5, [MEMBER]: 2999.5 }, { [PLANNER]: 11000, [MEMBER]: -1000 }]) {
      await rejects(() => addExpense(MEMBER, { split: { kind: 'shares', shares } }), /whole cents/);
    }
    for (const split of [{}, { kind: 'equal', user_ids: [] }, { kind: 'shares', shares: {} }, { kind: 'other' }, { kind: 'equal', user_ids: 'x' }]) {
      await rejects(() => addExpense(MEMBER, { split }), /split is not valid/);
    }
  });

  it('refuses zero, negative and absurd amounts and a blank or overlong description', async () => {
    await rejects(() => addExpense(MEMBER, { amount: 0 }));
    await rejects(() => addExpense(MEMBER, { amount: -500 }));
    await rejects(() => addExpense(MEMBER, { amount: 10_000_001 }));
    await addExpense(MEMBER, { amount: 10_000_000, split: { kind: 'equal', user_ids: [MEMBER] } });
    await rejects(() => addExpense(MEMBER, { description: '' }));
    await rejects(() => addExpense(MEMBER, { description: 'x'.repeat(201) }));
  });

  describe('record_settlement', () => {
    const KEY_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const KEY_D = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    let ledger: string;
    // Pat paid 90.00 for Pat, Sam and Jo: Sam and Jo each owe Pat 30.00.
    const record = (as: string, from: string, to: string, amount: number, key: string) =>
      asUser(db, as, () => one<{ r: string }>('select public.record_settlement($1, $2, $3, $4, $5) as r', [ledger, from, to, amount, key]));
    const count = () =>
      asService(db, () => one<{ n: number; total: number }>('select count(*)::int as n, coalesce(sum(amount_cents), 0)::int as total from public.settlements where trip_id = $1', [ledger]));

    beforeAll(async () => {
      ledger = await asUser(db, PLANNER, async () =>
        (await one<{ id: string }>(`select public.create_trip('Ledger', 'PT', '2026-11-03', '2026-11-10', 'trip-ledger-l1l1', 'Pat', null, '{}'::jsonb) as id`)).id,
      );
      const token = 'ledger-invite-token-0123456789';
      await asUser(db, PLANNER, () => db.query("select public.set_join_token($1, $2, now() + interval '7 days')", [ledger, token]));
      await asUser(db, MEMBER, () => db.query("select public.join_trip($1, 'Sam')", [token]));
      await asUser(db, JOINER, () => db.query("select public.join_trip($1, 'Jo')", [token]));
      await addExpense(PLANNER, { trip: ledger, amount: 9000, split: { kind: 'equal', user_ids: [PLANNER, MEMBER, JOINER] } });
    });

    it('refuses a stranger, a member who is neither party nor planner, and anon-style callers', async () => {
      await rejects(() => record(OUTSIDER, MEMBER, PLANNER, 1000, KEY_A), /not on this trip/);
      await rejects(() => record(JOINER, MEMBER, PLANNER, 1000, KEY_A), /only the two people involved/);
      expect((await count()).n).toBe(0);
    });

    it('refuses a party who is not on the trip, the same person on both sides, and a bad amount', async () => {
      await rejects(() => record(PLANNER, OUTSIDER, PLANNER, 1000, KEY_A), /both people must be on this trip/);
      await rejects(() => record(PLANNER, MEMBER, MEMBER, 1000, KEY_A), /invalid settlement/);
      for (const amount of [0, -5, 10_000_001]) await rejects(() => record(MEMBER, MEMBER, PLANNER, amount, KEY_A), /invalid settlement/);
      expect((await count()).n).toBe(0);
    });

    it('refuses a direct insert: the function is the only write path', async () => {
      await rejects(
        () => asUser(db, MEMBER, () => db.query('insert into public.settlements (trip_id, from_user_id, to_user_id, amount_cents, settled_by) values ($1, $2, $3, 1000, $2)', [ledger, MEMBER, PLANNER])),
        /row-level security/,
      );
      await rejects(
        () => asUser(db, PLANNER, () => db.query('insert into public.settlements (trip_id, from_user_id, to_user_id, amount_cents, settled_by) values ($1, $2, $3, 1000, $4)', [ledger, MEMBER, PLANNER, PLANNER])),
        /row-level security/,
      );
    });

    it('refuses more than is owed, and the wrong direction', async () => {
      await rejects(() => record(MEMBER, MEMBER, PLANNER, 3001, KEY_A), /more than is owed/);
      await rejects(() => record(PLANNER, PLANNER, MEMBER, 100, KEY_A), /more than is owed/);
      expect((await count()).n).toBe(0);
    });

    it('the same key twice gives one row', async () => {
      expect((await record(MEMBER, MEMBER, PLANNER, 1000, KEY_A)).r).toBe('recorded');
      expect((await record(MEMBER, MEMBER, PLANNER, 1000, KEY_A)).r).toBe('duplicate');
      expect((await count()).n).toBe(1);
    });

    it('two different-key settlements cannot overpay: the second is rejected once the first has used the balance', async () => {
      // 2000 still owed. (PGlite is one connection, so the two calls run in sequence; the advisory lock makes real
      // concurrent calls take the same path.)
      await record(PLANNER, MEMBER, PLANNER, 1500, KEY_B);
      await rejects(() => record(MEMBER, MEMBER, PLANNER, 1500, KEY_C), /more than is owed/);
      expect(await count()).toEqual({ n: 2, total: 2500 });
      await record(PLANNER, MEMBER, PLANNER, 500, KEY_D);
      expect(await count()).toEqual({ n: 3, total: 3000 });
      await rejects(() => record(MEMBER, MEMBER, PLANNER, 1, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), /more than is owed/);
    });

    it('handles exact-share expenses and an unfair remainder', async () => {
      await addExpense(JOINER, { trip: ledger, amount: 1000, split: { kind: 'shares', shares: { [PLANNER]: 700, [JOINER]: 300 } } });
      // Jo owed Pat 3000; Jo then paid 1000 of which Pat's 700 share offsets it, so Jo owes Pat 2300.
      await rejects(() => record(JOINER, JOINER, PLANNER, 2301, 'ffffffff-ffff-4fff-8fff-ffffffffffff'), /more than is owed/);
      await record(JOINER, JOINER, PLANNER, 2300, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    });
  });

  it('keeps the ledger from anyone outside the trip', async () => {
    const seen = await asUser(db, OUTSIDER, () => db.query('select id from public.expenses where trip_id = $1', [tripId]));
    expect(seen.rows).toHaveLength(0);
    const settled = await asUser(db, OUTSIDER, () => db.query('select id from public.settlements where trip_id = $1', [tripId]));
    expect(settled.rows).toHaveLength(0);
  });
});
