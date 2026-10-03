-- Group-trip Assist restructure.
-- Spec: docs/superpowers/specs/2026-10-01-group-trip-web-app-design.md
-- The project holds seed data only, so parked tables are dropped outright.

-- 1. Drop parked features -----------------------------------------------------
drop table if exists public.preview_jobs cascade;
drop table if exists public.reference_photos cascade;
drop table if exists public.consent_audit_entries cascade;
drop table if exists public.branded_destination_packs cascade;
drop table if exists public.support_override_actions cascade;
drop table if exists public.financing_status_events cascade;
drop table if exists public.financing_disclosure_records cascade;
drop table if exists public.financing_checkouts cascade;
drop table if exists public.financing_offers cascade;
drop table if exists public.wallet_installments cascade;
drop table if exists public.assist_action_recommendations cascade;
drop table if exists public.assist_timeline cascade;
drop table if exists public.assist_incidents cascade;
drop table if exists public.assist_disruption_events cascade;
drop table if exists public.assist_policy_rules cascade;
drop table if exists public.travel_admin_applications cascade;
drop table if exists public.travel_admin_partner_routes cascade;
drop table if exists public.travel_document_records cascade;
drop table if exists public.trip_quotes cascade;
drop table if exists public.trip_room_messages cascade;
drop table if exists public.travelers cascade;
drop table if exists public.attribution_touchpoints cascade;
drop table if exists public.experiment_assignments cascade;
drop table if exists public.funnel_telemetry_events cascade;

drop policy if exists "Users manage own trips" on public.trips;
alter table public.trips
  drop column destination_id,
  drop column traveler_count,
  drop column total_cost,
  drop column booking_flow_state,
  drop column booking_flow_attempt_count,
  drop column booking_flow_error,
  drop column booking_flow_checkout_url,
  drop column booking_flow_updated_at;
drop table if exists public.destinations cascade;

drop type if exists booking_flow_state, payment_state, message_author_type, financing_provider,
  installment_status, preview_job_status, preview_media_type, disruption_source, disruption_kind,
  disruption_severity, incident_resolution, policy_action_type, timeline_entry_type,
  partner_route_mode, travel_document_type;

-- 2. Profiles ------------------------------------------------------------------
alter table public.profiles
  drop column is_auto_rebook_enabled,
  drop column is_credit_protection_enabled,
  drop column is_calendar_connected,
  add column email text,
  add column phone text check (phone is null or phone ~ '^\+[1-9][0-9]{6,14}$'),
  add column sms_opt_in boolean not null default false,
  add column venmo_username text check (venmo_username is null or venmo_username ~ '^[A-Za-z0-9_-]{5,30}$'),
  add column cashtag text check (cashtag is null or cashtag ~ '^[A-Za-z][A-Za-z0-9]{0,19}$'),
  add column timezone text not null default 'America/New_York';

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, email, phone)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Traveler'
    ),
    lower(nullif(new.email, '')),
    case when coalesce(new.phone, '') = '' then null else '+' || ltrim(new.phone, '+') end
  );
  return new;
end;
$$;

-- 3. Trips and membership --------------------------------------------------------
create type pass_status as enum ('none', 'active', 'comp');
create type member_role as enum ('planner', 'member');

alter table public.trips
  add column name text not null default 'New trip',
  add column destination_country text check (destination_country is null or destination_country ~ '^[A-Z]{2}$'),
  add column inbound_code text unique,
  add column join_token_hash text unique,
  add column join_token_expires_at timestamptz,
  add column pass_status pass_status not null default 'none',
  add column created_anonymous_id text,
  add column created_utm jsonb not null default '{}',
  -- Set by /admin's comp action: the founder runs this trip by hand, so its playbooks wait for review.
  -- A 100% promotion code also makes a comp pass, but not a hand-run trip.
  add column hand_run boolean not null default false;
update public.trips set inbound_code = 'trip-' || replace(gen_random_uuid()::text, '-', '') where inbound_code is null;
alter table public.trips alter column inbound_code set not null;

create table public.trip_members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role member_role not null default 'member',
  display_name text not null check (length(display_name) between 1 and 80),
  joined_at timestamptz not null default now(),
  unique (trip_id, user_id),
  unique (id, trip_id)
);

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid());
$$;

create or replace function public.is_trip_planner(p_trip_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.trip_members where trip_id = p_trip_id and user_id = auth.uid() and role = 'planner'
  );
$$;

create or replace function public.create_trip(
  p_name text, p_destination_country text, p_start_date date, p_end_date date,
  p_inbound_code text, p_display_name text, p_anonymous_id text, p_utm jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_trip uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.trips (owner_id, name, destination_country, start_date, end_date, inbound_code,
                            created_anonymous_id, created_utm)
  values (auth.uid(), p_name, p_destination_country, p_start_date, p_end_date, p_inbound_code,
          p_anonymous_id, coalesce(p_utm, '{}'::jsonb))
  returning id into v_trip;
  insert into public.trip_members (trip_id, user_id, role, display_name)
  values (v_trip, auth.uid(), 'planner', p_display_name);
  return v_trip;
end;
$$;

-- Takes the RAW invite token and hashes it here (built-in sha256, no extension needed), so the
-- stored hash is never a usable credential even if it leaked.
create or replace function public.join_trip(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_trip uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  select id into v_trip from public.trips
   where join_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
     and join_token_expires_at > now();
  if v_trip is null then
    raise exception 'invalid or expired link' using errcode = 'P0002';
  end if;
  insert into public.trip_members (trip_id, user_id, role, display_name)
  values (v_trip, auth.uid(), 'member', p_display_name)
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;
  return v_trip;
end;
$$;

-- inbound_code is not column-readable; planners fetch it here.
create or replace function public.trip_inbound_code(p_trip_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select t.inbound_code from public.trips t where t.id = p_trip_id and public.is_trip_planner(p_trip_id);
$$;

-- Planners set or rotate the invite link here, because join_token_hash is not column-writable
-- (section 11). The app derives the raw token; only its hash is stored, hashed exactly as join_trip
-- hashes the token a visitor presents.
create or replace function public.set_join_token(p_trip_id uuid, p_token text, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_trip_planner(p_trip_id) then
    raise exception 'only the planner can invite' using errcode = '42501';
  end if;
  if length(coalesce(p_token, '')) < 16 or p_expires_at is null or p_expires_at <= now() then
    raise exception 'invalid invite token' using errcode = '22023';
  end if;
  -- A reset must retire the old link, so an unchanged token is refused rather than silently kept.
  if exists (
    select 1 from public.trips
     where id = p_trip_id and join_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'invite token unchanged' using errcode = '22023';
  end if;
  update public.trips
     set join_token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'),
         join_token_expires_at = p_expires_at
   where id = p_trip_id;
end;
$$;
revoke execute on function public.set_join_token(uuid, text, timestamptz) from public, anon;
grant execute on function public.set_join_token(uuid, text, timestamptz) to authenticated;

create or replace function public.trip_directory(p_trip_id uuid)
returns table (member_id uuid, user_id uuid, display_name text, role member_role, venmo_username text, cashtag text)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, m.display_name, m.role, p.venmo_username, p.cashtag
  from public.trip_members m
  join public.profiles p on p.id = m.user_id
  where m.trip_id = p_trip_id and public.is_trip_member(p_trip_id)
  order by m.role, m.display_name;
$$;

-- 4. Documents and travel-admin routes --------------------------------------------
create type member_document_kind as enum ('passport', 'real_id', 'global_entry', 'tsa_precheck');

create table public.member_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind member_document_kind not null,
  issuing_country text check (issuing_country is null or issuing_country ~ '^[A-Z]{2}$'),
  expires_on date,
  real_id_compliant boolean,
  keep_on_profile boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (user_id, kind)
);

-- Per document kind: the free official route (always shown) and an optional affiliate fallback.
create table public.travel_admin_partner_routes (
  id uuid primary key default gen_random_uuid(),
  kind member_document_kind not null unique,
  official_label text not null,
  official_url text not null,
  official_note text,
  routine_processing_days int check (routine_processing_days > 0),
  expedited_processing_days int check (expedited_processing_days > 0),
  processing_source_url text,
  affiliate_label text,
  affiliate_url text,
  affiliate_disclosure text,
  is_active boolean not null default true,
  updated_at timestamptz not null default now(),
  check (affiliate_url is null or (affiliate_label is not null and affiliate_disclosure is not null))
);

-- 5. Intake and bookings -------------------------------------------------------
create type booking_kind as enum ('flight', 'hotel', 'rental', 'car', 'rail', 'activity');
create type inbound_status as enum ('received', 'parsed', 'needs_confirmation', 'quarantined', 'failed', 'processing');

create table public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  source text not null check (source in ('email', 'screenshot')),
  provider_message_id text unique,
  sender text,
  subject text,
  storage_path text,
  status inbound_status not null default 'received',
  error text,
  claimed_by text,
  received_at timestamptz not null default now()
);

create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  inbound_message_id uuid references public.inbound_messages(id) on delete set null,
  kind booking_kind not null,
  provider text not null,
  confirmation_code text,
  booked_via text,
  -- When the booking was made, as the confirmation printed it: a date, or a local date and time.
  booked_at text check (
    booked_at is null
    or case
         when booked_at ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(T([01][0-9]|2[0-3]):[0-5][0-9])?$'
           then to_char(substr(booked_at, 1, 10)::date, 'YYYY-MM-DD') = substr(booked_at, 1, 10)
         else false
       end
  ),
  passenger_names text[] not null default '{}',
  extraction_confidence numeric(3,2) not null check (extraction_confidence between 0 and 1),
  dedupe_key text not null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (trip_id, dedupe_key),
  unique (id, trip_id)
);
-- Confirmation codes are readable only through booking_confirmation_code(). dedupe_key is derived
-- and written by the service role (it may embed provider identifiers), so it is not exposed either.
-- Planners may correct only provider, booked_via, passenger_names, and confirmed_at.
revoke select, update on public.bookings from anon, authenticated;
grant select (id, trip_id, inbound_message_id, kind, provider, booked_via, passenger_names,
              extraction_confidence, confirmed_at, created_at)
  on public.bookings to authenticated;
grant update (provider, booked_via, passenger_names, confirmed_at) on public.bookings to authenticated;

create table public.booking_segments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null,
  trip_id uuid not null,
  position int not null check (position >= 1),
  carrier_iata text not null check (carrier_iata ~ '^[A-Z0-9]{2}$'),
  -- The airline that operates the flight, from AeroAPI. The confirmation shows the marketing carrier, which can differ on a codeshare.
  operator_iata text check (operator_iata is null or operator_iata ~ '^[A-Z0-9]{2}$'),
  flight_number text not null check (flight_number ~ '^[0-9]{1,4}$'),
  origin_iata text not null check (origin_iata ~ '^[A-Z]{3}$'),
  destination_iata text not null check (destination_iata ~ '^[A-Z]{3}$'),
  departure_local text not null,
  arrival_local text,
  scheduled_out timestamptz,
  scheduled_in timestamptz,
  origin_country text check (origin_country is null or origin_country ~ '^[A-Z]{2}$'),
  destination_country text check (destination_country is null or destination_country ~ '^[A-Z]{2}$'),
  distance_km int,
  fa_flight_id text,
  aeroapi_alert_id text,
  last_status jsonb,
  -- When last_status was taken: the observation time that notice-days facts need. Written in the same update as last_status.
  last_status_at timestamptz,
  monitor_state text not null default 'idle' check (monitor_state in ('idle', 'monitoring', 'polling_only', 'ended')),
  foreign key (booking_id, trip_id) references public.bookings(id, trip_id) on delete cascade,
  unique (booking_id, position)
);

create table public.booking_members (
  booking_id uuid not null,
  member_id uuid not null,
  trip_id uuid not null,
  -- True when the member put themselves on the booking. A self-claim shows them the booking but not its
  -- confirmation code; the planner's assignment (or intake's passenger match) is what unlocks the code.
  self_claimed boolean not null default false,
  primary key (booking_id, member_id),
  foreign key (booking_id, trip_id) references public.bookings(id, trip_id) on delete cascade,
  foreign key (member_id, trip_id) references public.trip_members(id, trip_id) on delete cascade
);

create or replace function public.booking_confirmation_code(p_booking_id uuid)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select b.confirmation_code
  from public.bookings b
  where b.id = p_booking_id
    and (
      public.is_trip_planner(b.trip_id)
      or exists (
        select 1 from public.booking_members bm
        join public.trip_members m on m.id = bm.member_id
        where bm.booking_id = b.id and m.user_id = auth.uid() and not bm.self_claimed
      )
    );
$$;

-- A member puts only themselves on a booking of a trip they belong to. Assignment decides who reads
-- a confirmation code, so members never insert booking_members rows directly ("Planners assign
-- bookings" in section 12). They take themselves off under "Planner or self unassigns bookings".
create or replace function public.claim_booking_seat(p_booking_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid; v_member uuid;
begin
  select b.trip_id into v_trip from public.bookings b where b.id = p_booking_id;
  select m.id into v_member from public.trip_members m where m.trip_id = v_trip and m.user_id = auth.uid();
  if v_member is null then
    raise exception 'not a member of this trip' using errcode = '42501';
  end if;
  -- A self-claim does not unlock the confirmation code. An existing planner or intake assignment keeps self_claimed = false.
  insert into public.booking_members (booking_id, member_id, trip_id, self_claimed)
  values (p_booking_id, v_member, v_trip, true)
  on conflict (booking_id, member_id) do nothing;
  return v_member;
end;
$$;
revoke execute on function public.claim_booking_seat(uuid) from public, anon;
grant execute on function public.claim_booking_seat(uuid) to authenticated;

-- The planner assigns anyone. Assigning a member who self-claimed is the planner confirming them, which unlocks the code.
create or replace function public.assign_booking_member(p_booking_id uuid, p_member_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_trip uuid;
begin
  select b.trip_id into v_trip from public.bookings b where b.id = p_booking_id;
  if v_trip is null or not public.is_trip_planner(v_trip) then
    raise exception 'only the planner can assign travelers' using errcode = '42501';
  end if;
  insert into public.booking_members (booking_id, member_id, trip_id, self_claimed)
  values (p_booking_id, p_member_id, v_trip, false)
  on conflict (booking_id, member_id) do update set self_claimed = false;
end;
$$;
revoke execute on function public.assign_booking_member(uuid, uuid) from public, anon;
grant execute on function public.assign_booking_member(uuid, uuid) to authenticated;
revoke update on public.booking_members from anon, authenticated;

-- 6. Checks, incidents, playbooks, action items ------------------------------------
create type check_result as enum ('ok', 'action_needed', 'unknown');
create type incident_status as enum ('open', 'needs_answer', 'playbook_ready', 'resolved');

create table public.document_checks (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  member_id uuid not null references public.trip_members(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  rule_id text,
  rule_version int,
  result check_result not null,
  detail text not null,
  checked_at timestamptz not null default now()
);

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  segment_id uuid not null references public.booking_segments(id) on delete cascade,
  event_type text not null,
  delay_minutes int,
  dedupe_key text not null unique,
  raw_payload jsonb not null default '{}',
  -- The flight's status just before the snapshot that opened this incident, and when that was taken. The segment's
  -- last_status is overwritten by the opening snapshot, so this is the only record of what the airline showed before.
  previous_status jsonb,
  previous_status_at timestamptz,
  affected_user_ids uuid[] not null default '{}',
  facts jsonb not null default '{}',
  pending_question jsonb,
  status incident_status not null default 'open',
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table public.incident_events (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  kind text not null check (kind in ('detected', 'alerted', 'question_asked', 'answered', 'playbook_generated', 'playbook_edited', 'notified', 'resolved')),
  actor_user_id uuid references public.profiles(id),
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.playbooks (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.incidents(id) on delete cascade,
  content jsonb not null,
  rules_cited jsonb not null,
  model text not null,
  citation_check_passed boolean not null,
  -- True while a hand-run trip's playbook waits for the founder. Only the service role sees it then.
  held_for_review boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.action_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  kind text not null check (kind in ('approval', 'payment', 'document', 'checklist', 'assist', 'booking', 'media')),
  title text not null,
  detail text not null,
  assigned_user_ids uuid[] not null default '{}',
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'snoozed', 'done')),
  source_kind text not null check (source_kind in ('document_check', 'incident', 'booking_confirmation', 'passenger_match', 'inbound_quarantine', 'flight_not_found')),
  related_entity_id uuid,
  created_at timestamptz not null default now(),
  unique (trip_id, source_kind, related_entity_id, title)
);

-- Replaces a trip's document checks in one transaction. The trip row lock serializes concurrent runs,
-- and a bad row raises, which rolls the delete back so the trip is never left with no checks.
create or replace function public.replace_document_checks(p_trip_id uuid, p_rows jsonb)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform 1 from public.trips where id = p_trip_id for update;
  delete from public.document_checks where trip_id = p_trip_id;
  insert into public.document_checks (trip_id, member_id, user_id, rule_id, rule_version, result, detail)
  select p_trip_id, r.member_id, r.user_id, r.rule_id, r.rule_version, r.result::check_result, r.detail
  from jsonb_to_recordset(p_rows) as r(member_id uuid, user_id uuid, rule_id text, rule_version int, result text, detail text);
end;
$$;
revoke execute on function public.replace_document_checks(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.replace_document_checks(uuid, jsonb) to service_role;

-- 7. Votes and money ------------------------------------------------------------
create table public.votes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  incident_id uuid references public.incidents(id) on delete set null,
  title text not null,
  detail text not null,
  required_user_ids uuid[] not null default '{}',
  deadline timestamptz,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.vote_options (
  id uuid primary key default gen_random_uuid(),
  vote_id uuid not null references public.votes(id) on delete cascade,
  label text not null,
  note text,
  position int not null,
  unique (id, vote_id)
);

create table public.vote_responses (
  vote_id uuid not null references public.votes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  option_id uuid not null,
  responded_at timestamptz not null default now(),
  primary key (vote_id, user_id),
  foreign key (option_id, vote_id) references public.vote_options(id, vote_id) on delete cascade
);

-- Members answer only through here. A direct upsert would also SET vote_id and user_id, which no column
-- grant allows, and this function decides who may answer: a vote that names required voters
-- (an incident vote names the affected travelers) takes answers from them only, any other vote from
-- any member, and a closed vote from no one.
create or replace function public.respond_vote(p_vote_id uuid, p_option_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_vote public.votes%rowtype;
begin
  select * into v_vote from public.votes where id = p_vote_id;
  if not found or not public.is_trip_member(v_vote.trip_id) then
    raise exception 'vote not found' using errcode = 'P0002';
  end if;
  if v_vote.status <> 'open' then
    raise exception 'vote is closed' using errcode = '22023';
  end if;
  if cardinality(v_vote.required_user_ids) > 0 and not (auth.uid() = any (v_vote.required_user_ids)) then
    raise exception 'not a voter on this vote' using errcode = '42501';
  end if;
  insert into public.vote_responses (vote_id, user_id, option_id)
  values (p_vote_id, auth.uid(), p_option_id)
  on conflict (vote_id, user_id) do update set option_id = excluded.option_id, responded_at = now();
end;
$$;
revoke execute on function public.respond_vote(uuid, uuid) from public, anon;
grant execute on function public.respond_vote(uuid, uuid) to authenticated;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  payer_user_id uuid not null references public.profiles(id),
  -- Integer cents, at most $100,000.00 a line.
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 10000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  description text not null check (char_length(description) between 1 and 200),
  split jsonb not null,
  incident_id uuid references public.incidents(id) on delete set null,
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  -- The form's one-time key: a double-submitted "add expense" lands on the row it already made.
  client_key uuid,
  unique (trip_id, client_key)
);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  from_user_id uuid not null references public.profiles(id),
  to_user_id uuid not null references public.profiles(id),
  amount_cents int not null check (amount_cents > 0 and amount_cents <= 10000000),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  settled_by uuid not null references public.profiles(id),
  settled_at timestamptz not null default now(),
  client_key uuid,
  unique (trip_id, client_key),
  check (from_user_id <> to_user_id)
);

-- A payer, a split, or a settlement party must belong to the trip the row is on. RLS only proves the caller
-- is a member, so without this a crafted insert could put another trip's users on this ledger.
create or replace function public.check_ledger_members() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ids text[];
  v_id text;
  v_total bigint;
begin
  if tg_table_name = 'expenses' then
    if not exists (select 1 from public.trip_members where trip_id = new.trip_id and user_id = new.payer_user_id) then
      raise exception 'payer is not on this trip' using errcode = '23514';
    end if;
    if new.split ->> 'kind' = 'equal' and jsonb_typeof(new.split -> 'user_ids') = 'array' and jsonb_array_length(new.split -> 'user_ids') > 0 then
      select array_agg(value) into v_ids from jsonb_array_elements_text(new.split -> 'user_ids');
      if (select count(distinct x) from unnest(v_ids) x) <> cardinality(v_ids) then
        raise exception 'split lists someone twice' using errcode = '23514';
      end if;
    elsif new.split ->> 'kind' = 'shares' and jsonb_typeof(new.split -> 'shares') = 'object' and new.split -> 'shares' <> '{}'::jsonb then
      select array_agg(key) into v_ids from jsonb_object_keys(new.split -> 'shares') key;
      select sum(case when jsonb_typeof(value) = 'number' and value::text ~ '^[0-9]+$' then value::text::bigint else -1 end)
        into v_total from jsonb_each(new.split -> 'shares');
      if v_total is distinct from new.amount_cents then
        raise exception 'shares must be whole cents that add up to the amount' using errcode = '23514';
      end if;
    else
      raise exception 'split is not valid' using errcode = '23514';
    end if;
    foreach v_id in array v_ids loop
      if v_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         or not exists (select 1 from public.trip_members where trip_id = new.trip_id and user_id = v_id::uuid) then
        raise exception 'split includes someone who is not on this trip' using errcode = '23514';
      end if;
    end loop;
  else
    if not exists (select 1 from public.trip_members where trip_id = new.trip_id and user_id = new.from_user_id)
       or not exists (select 1 from public.trip_members where trip_id = new.trip_id and user_id = new.to_user_id) then
      raise exception 'both people must be on this trip' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.check_ledger_members() from public, anon, authenticated;
create trigger expenses_members_check before insert or update on public.expenses
  for each row execute function public.check_ledger_members();
create trigger settlements_members_check before insert or update on public.settlements
  for each row execute function public.check_ledger_members();

-- 8. Notifications, consents, passes, webhooks ------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references public.trips(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('sms', 'email')),
  template text not null,
  subject text,
  body text not null,
  urgent boolean not null default false,
  send_after timestamptz not null default now(),
  provider_message_id text,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'delivered', 'failed', 'skipped')),
  related_entity_id uuid,
  claimed_at timestamptz,
  attempts int not null default 0,
  created_at timestamptz not null default now()
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('sms', 'email', 'documents')),
  policy_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table public.passes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  stripe_session_id text unique,
  price_variant text not null check (price_variant in ('p9', 'p19', 'comp')),
  amount_cents int not null check (amount_cents >= 0),
  status text not null default 'pending' check (status in ('pending', 'paid', 'comp', 'expired')),
  anonymous_id text,
  created_by uuid references public.profiles(id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.webhook_events (
  provider text not null,
  event_id text not null,
  received_at timestamptz not null default now(),
  primary key (provider, event_id)
);

-- 9. Payment test and attribution (service role only) ----------------------------
create table public.experiment_assignments (
  anonymous_id text not null,
  flag_key text not null,
  variant text not null,
  user_id uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (anonymous_id, flag_key)
);

create table public.funnel_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  user_id uuid references public.profiles(id) on delete set null,
  trip_id uuid references public.trips(id) on delete set null,
  event_name text not null check (event_name in ('rule_page_view', 'offer_click', 'trip_started', 'booking_forwarded', 'checkout_started', 'paid')),
  rule_id text,
  variant text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.attribution_touchpoints (
  id uuid primary key default gen_random_uuid(),
  anonymous_id text not null,
  post_id text not null check (post_id ~ '^[A-Za-z0-9_-]{1,64}$'),
  platform text not null check (platform in ('tiktok', 'instagram', 'youtube', 'facebook', 'pinterest', 'other')),
  landing_path text not null,
  utm jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index attribution_touchpoints_aid_idx on public.attribution_touchpoints (anonymous_id, created_at desc);
create index funnel_events_created_idx on public.funnel_telemetry_events (created_at);
-- One rule_page_view per visitor, rule and UTC day: refreshes and revisits must not inflate the
-- denominator. The funnel bar counts DISTINCT anonymous_id; this index is a write-time guard so
-- the raw rows stay sane too. recordEvent treats the unique violation (23505) as a no-op.
create unique index funnel_page_view_daily_idx on public.funnel_telemetry_events
  (anonymous_id, rule_id, ((created_at at time zone 'utc')::date))
  where event_name = 'rule_page_view';
-- Same guard for offer_click. The client click and the /start server backstop both record the
-- same click; the second insert hits this index and recordEvent treats the 23505 as a no-op.
-- A unique index (not check-then-insert) is atomic, so the two concurrent writes cannot both land.
create unique index funnel_offer_click_daily_idx on public.funnel_telemetry_events
  (anonymous_id, rule_id, ((created_at at time zone 'utc')::date))
  where event_name = 'offer_click';

-- One paid event per trip. The Stripe webhook retries, and a retry after recordPaid must not
-- double the revenue count; pass-store.recordPaid treats the 23505 as a no-op.
create unique index funnel_paid_trip_idx on public.funnel_telemetry_events (trip_id)
  where event_name = 'paid';

-- Same guard for booking_forwarded: the trip's first forwarded booking counts once, however many
-- emails follow. recordEvent treats the 23505 as a no-op.
create unique index funnel_forwarded_trip_idx on public.funnel_telemetry_events (trip_id)
  where event_name = 'booking_forwarded';

create or replace function public.attribution_summary(p_since timestamptz)
returns table (post_id text, clicks bigint, forwarded_bookings bigint, paid_passes bigint)
language sql stable security definer set search_path = public as $$
  with conv as (
    select e.event_name, e.trip_id,
      (select t.post_id from public.attribution_touchpoints t
        where t.anonymous_id = e.anonymous_id and t.created_at <= e.created_at
        order by t.created_at desc limit 1) as post_id
    from public.funnel_telemetry_events e
    where e.created_at >= p_since
      and e.event_name in ('booking_forwarded', 'paid')
      and coalesce(e.variant, '') <> 'comp'
  ),
  clk as (
    select t.post_id, count(*) as clicks
    from public.attribution_touchpoints t
    where t.created_at >= p_since
    group by t.post_id
  ),
  ids as (
    select clk.post_id from clk
    union
    select conv.post_id from conv where conv.post_id is not null
  )
  select ids.post_id,
    coalesce((select clk.clicks from clk where clk.post_id = ids.post_id), 0)::bigint,
    (select count(distinct conv.trip_id) from conv where conv.post_id = ids.post_id and conv.event_name = 'booking_forwarded')::bigint,
    (select count(distinct conv.trip_id) from conv where conv.post_id = ids.post_id and conv.event_name = 'paid')::bigint
  from ids
  order by ids.post_id;
$$;
revoke execute on function public.attribution_summary(timestamptz) from public, anon, authenticated;
grant execute on function public.attribution_summary(timestamptz) to service_role;

-- Atomically claims due notifications for sending, so overlapping runs never send the same row.
-- Rows stuck in 'sending' for over 10 minutes are crash leftovers and are reclaimed (at-least-once).
create or replace function public.claim_due_notifications(p_now timestamptz, p_limit int)
returns table (id uuid, channel text, subject text, body text, attempts int, email text, phone text, sms_opt_in boolean)
language sql security definer set search_path = public as $$
  with due as (
    select n.id from public.notifications n
     where (n.status = 'queued' and n.send_after <= p_now)
        or (n.status = 'sending' and n.claimed_at < p_now - interval '10 minutes')
     order by n.created_at
     limit p_limit
     for update skip locked
  ), claimed as (
    update public.notifications n
       set status = 'sending', claimed_at = p_now
      from due
     where n.id = due.id
    returning n.id, n.user_id, n.channel, n.subject, n.body, n.attempts, n.created_at
  )
  select c.id, c.channel, c.subject, c.body, c.attempts, p.email, p.phone, p.sms_opt_in
    from claimed c join public.profiles p on p.id = c.user_id
   order by c.created_at;
$$;
revoke execute on function public.claim_due_notifications(timestamptz, int) from public, anon, authenticated;
grant execute on function public.claim_due_notifications(timestamptz, int) to service_role;

-- Saves one extracted booking and its segments in a single transaction, for the intake workflow.
-- created = true means this message still has work to do on the booking: it was inserted now, or this
-- same message inserted it before a retry (any missing segments are filled in; existing ones are kept).
-- A booking another message already saved comes back created = false and is left alone.
create or replace function public.save_booking(p_trip_id uuid, p_message_id uuid, p_booking jsonb, p_confirmed boolean)
returns table (out_booking_id uuid, out_created boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_message uuid;
  v_segment jsonb;
  v_position int := 0;
begin
  insert into public.bookings (trip_id, inbound_message_id, kind, provider, confirmation_code, booked_via, booked_at,
                               passenger_names, extraction_confidence, dedupe_key, confirmed_at)
  values (p_trip_id, p_message_id, (p_booking->>'kind')::booking_kind, p_booking->>'provider', p_booking->>'confirmation_code',
          p_booking->>'booked_via', p_booking->>'booked_at',
          coalesce(array(select jsonb_array_elements_text(p_booking->'passenger_names')), '{}'),
          round((p_booking->>'confidence')::numeric, 2), p_booking->>'dedupe_key',
          case when p_confirmed then now() end)
  on conflict (trip_id, dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select b.id, b.inbound_message_id into v_id, v_message
      from public.bookings b where b.trip_id = p_trip_id and b.dedupe_key = p_booking->>'dedupe_key';
    if v_message is distinct from p_message_id then
      return query select v_id, false;
      return;
    end if;
  end if;

  for v_segment in select * from jsonb_array_elements(coalesce(p_booking->'segments', '[]'::jsonb)) loop
    v_position := v_position + 1;
    insert into public.booking_segments (booking_id, trip_id, position, carrier_iata, flight_number, origin_iata,
                                         destination_iata, departure_local, arrival_local)
    values (v_id, p_trip_id, v_position, v_segment->>'carrier_iata', v_segment->>'flight_number', v_segment->>'origin_iata',
            v_segment->>'destination_iata', v_segment->>'departure_local', v_segment->>'arrival_local')
    on conflict (booking_id, position) do nothing;
  end loop;
  return query select v_id, true;
end;
$$;
revoke execute on function public.save_booking(uuid, uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.save_booking(uuid, uuid, jsonb, boolean) to service_role;

-- 10. Indexes for RLS predicates and foreign keys ----------------------------------
create index trip_members_user_idx on public.trip_members (user_id);
create index inbound_messages_trip_idx on public.inbound_messages (trip_id);
create index booking_segments_trip_idx on public.booking_segments (trip_id);
create index booking_members_trip_idx on public.booking_members (trip_id);
create index document_checks_trip_idx on public.document_checks (trip_id);
create index incidents_trip_idx on public.incidents (trip_id);
create index incidents_affected_gin on public.incidents using gin (affected_user_ids);
create index incident_events_incident_idx on public.incident_events (incident_id);
-- An incident is detected once, however many alerts and polls report it at the same moment.
create unique index incident_events_detected_once on public.incident_events (incident_id) where kind = 'detected';
create index playbooks_incident_idx on public.playbooks (incident_id);
create index action_items_assigned_gin on public.action_items using gin (assigned_user_ids);
create index votes_trip_idx on public.votes (trip_id);
create index vote_options_vote_idx on public.vote_options (vote_id);
-- A double-submitted "start the vote" cannot open two votes for one incident.
create unique index votes_one_open_per_incident on public.votes (incident_id) where status = 'open' and incident_id is not null;
create index expenses_trip_idx on public.expenses (trip_id);
create index settlements_trip_idx on public.settlements (trip_id);
create index passes_trip_idx on public.passes (trip_id);
create index notifications_user_idx on public.notifications (user_id);
create index notifications_provider_message_idx on public.notifications (provider_message_id) where provider_message_id is not null;
create index notifications_due_idx on public.notifications (status, send_after) where status in ('queued', 'sending');

-- 11. Column-level grants -------------------------------------------------------------
-- RLS policies decide which rows; these grants decide which columns authenticated users may write.
-- Identity (trip_id, user_id, role), payment (pass_status), and provenance columns change only
-- through security definer functions or the service role.
revoke update on public.trips, public.trip_members, public.action_items, public.votes,
  public.vote_responses, public.consents from anon, authenticated;
grant update (name, destination_country, start_date, end_date) on public.trips to authenticated;
grant update (display_name) on public.trip_members to authenticated;
grant update (status, due_at) on public.action_items to authenticated;
grant update (title, detail, deadline, status) on public.votes to authenticated;
grant update (revoked_at) on public.consents to authenticated;
-- email and phone mirror auth.users (handle_new_user); users may not rewrite them, or the SMS opt-in
-- that depends on a verified phone would be forgeable.
revoke update on public.profiles from anon, authenticated;
grant update (display_name, venmo_username, cashtag, timezone, sms_opt_in) on public.profiles to authenticated;

-- The join-token hash and inbound code are not readable by members; see trip_inbound_code().
revoke select on public.trips from anon, authenticated;
grant select (id, owner_id, status, start_date, end_date, created_at, updated_at, name,
              destination_country, join_token_expires_at, pass_status, created_anonymous_id, created_utm)
  on public.trips to authenticated;

-- 12. Row-level security ---------------------------------------------------------
alter table public.trip_members enable row level security;
alter table public.member_documents enable row level security;
alter table public.travel_admin_partner_routes enable row level security;
alter table public.inbound_messages enable row level security;
alter table public.bookings enable row level security;
alter table public.booking_segments enable row level security;
alter table public.booking_members enable row level security;
alter table public.document_checks enable row level security;
alter table public.incidents enable row level security;
alter table public.incident_events enable row level security;
alter table public.playbooks enable row level security;
alter table public.action_items enable row level security;
alter table public.votes enable row level security;
alter table public.vote_options enable row level security;
alter table public.vote_responses enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.notifications enable row level security;
alter table public.consents enable row level security;
alter table public.passes enable row level security;
alter table public.webhook_events enable row level security;
alter table public.experiment_assignments enable row level security;
alter table public.funnel_telemetry_events enable row level security;
alter table public.attribution_touchpoints enable row level security;

create policy "Members read trips" on public.trips for select using (public.is_trip_member(id));
create policy "Planners update trips" on public.trips for update
  using (public.is_trip_planner(id)) with check (public.is_trip_planner(id));

create policy "Members read members" on public.trip_members for select using (public.is_trip_member(trip_id));
create policy "Members edit themselves" on public.trip_members for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Members leave" on public.trip_members for delete using (user_id = auth.uid() and role = 'member');

create policy "Owners manage documents" on public.member_documents for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Anyone reads active routes" on public.travel_admin_partner_routes for select using (is_active);

create policy "Planners read inbound" on public.inbound_messages for select using (public.is_trip_planner(trip_id));

create policy "Members read bookings" on public.bookings for select using (public.is_trip_member(trip_id));
create policy "Planners update bookings" on public.bookings for update
  using (public.is_trip_planner(trip_id)) with check (public.is_trip_planner(trip_id));

create policy "Members read segments" on public.booking_segments for select using (public.is_trip_member(trip_id));

create policy "Members read booking members" on public.booking_members for select using (public.is_trip_member(trip_id));
-- Assignment decides who can read a confirmation code, so only planners (or the service role) assign.
create policy "Planners assign bookings" on public.booking_members for insert
  with check (public.is_trip_planner(trip_id));
create policy "Planner or self unassigns bookings" on public.booking_members for delete using (
  public.is_trip_planner(trip_id)
  or exists (select 1 from public.trip_members m where m.id = member_id and m.user_id = auth.uid())
);

create policy "Planner or self reads checks" on public.document_checks for select
  using (public.is_trip_planner(trip_id) or user_id = auth.uid());

create policy "Affected or planner reads incidents" on public.incidents for select
  using (public.is_trip_planner(trip_id) or auth.uid() = any (affected_user_ids));
create policy "Readers of the incident read its events" on public.incident_events for select using (
  exists (select 1 from public.incidents i where i.id = incident_id
          and (public.is_trip_planner(i.trip_id) or auth.uid() = any (i.affected_user_ids)))
);
-- A playbook held for the founder's review stays hidden, from the planner too, until it is released.
create policy "Readers of the incident read its released playbooks" on public.playbooks for select using (
  not held_for_review
  and exists (select 1 from public.incidents i where i.id = incident_id
              and (public.is_trip_planner(i.trip_id) or auth.uid() = any (i.affected_user_ids)))
);

create policy "Assignees or planner read action items" on public.action_items for select
  using (public.is_trip_planner(trip_id) or auth.uid() = any (assigned_user_ids));
create policy "Assignees or planner update action items" on public.action_items for update
  using (public.is_trip_planner(trip_id) or auth.uid() = any (assigned_user_ids))
  with check (public.is_trip_planner(trip_id) or auth.uid() = any (assigned_user_ids));

create policy "Members read votes" on public.votes for select using (public.is_trip_member(trip_id));
create policy "Members create votes" on public.votes for insert
  with check (
    public.is_trip_member(trip_id) and created_by = auth.uid()
    and (incident_id is null or exists (select 1 from public.incidents i where i.id = incident_id and i.trip_id = votes.trip_id))
  );
create policy "Creator or planner updates votes" on public.votes for update
  using (created_by = auth.uid() or public.is_trip_planner(trip_id))
  with check (created_by = auth.uid() or public.is_trip_planner(trip_id));
create policy "Members read vote options" on public.vote_options for select using (
  exists (select 1 from public.votes v where v.id = vote_id and public.is_trip_member(v.trip_id))
);
create policy "Vote creator adds options" on public.vote_options for insert with check (
  exists (select 1 from public.votes v where v.id = vote_id and (v.created_by = auth.uid() or public.is_trip_planner(v.trip_id)))
);
create policy "Members read responses" on public.vote_responses for select using (
  exists (select 1 from public.votes v where v.id = vote_id and public.is_trip_member(v.trip_id))
);
-- No write policies on vote_responses: members answer through respond_vote().

create policy "Members read expenses" on public.expenses for select using (public.is_trip_member(trip_id));
create policy "Members add expenses" on public.expenses for insert
  with check (public.is_trip_member(trip_id) and created_by = auth.uid());
create policy "Creator or planner deletes expenses" on public.expenses for delete
  using (created_by = auth.uid() or public.is_trip_planner(trip_id));

create policy "Members read settlements" on public.settlements for select using (public.is_trip_member(trip_id));
create policy "Parties or planner record settlements" on public.settlements for insert with check (
  public.is_trip_member(trip_id) and settled_by = auth.uid()
  and (from_user_id = auth.uid() or to_user_id = auth.uid() or public.is_trip_planner(trip_id))
);

create policy "Users read their notifications" on public.notifications for select using (user_id = auth.uid());

create policy "Users read their consents" on public.consents for select using (user_id = auth.uid());
create policy "Users grant consents" on public.consents for insert with check (user_id = auth.uid());
create policy "Users revoke consents" on public.consents for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Members read passes" on public.passes for select using (public.is_trip_member(trip_id));
-- webhook_events, experiment_assignments, funnel_telemetry_events, attribution_touchpoints:
-- RLS on with no policies, so only the service role reads or writes them.
