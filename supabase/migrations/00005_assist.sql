create type disruption_source as enum ('flight', 'hotel', 'activity');
create type disruption_kind as enum ('delayed', 'canceled', 'overbooked', 'connection_risk');
create type disruption_severity as enum ('low', 'medium', 'high');
create type incident_resolution as enum ('monitoring', 'auto_resolved', 'escalation_prepared');
create type policy_action_type as enum ('auto_rebook', 'protect_credit', 'escalate');
create type timeline_entry_type as enum ('ingested_event', 'evaluated_policy', 'executed_action');

create table public.assist_disruption_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  source disruption_source not null,
  kind disruption_kind not null,
  severity disruption_severity not null,
  description text not null,
  reference_code text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.assist_policy_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  applies_to_source disruption_source not null,
  applies_to_kinds disruption_kind[] not null,
  minimum_severity disruption_severity not null,
  allowed_action policy_action_type not null,
  requires_auto_rebook boolean not null default false,
  requires_credit_protection boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.assist_incidents (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  event_id uuid not null references public.assist_disruption_events(id),
  title text not null,
  detail text not null,
  severity disruption_severity not null,
  resolution_state incident_resolution not null default 'monitoring',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.assist_timeline (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.assist_incidents(id),
  entry_type timeline_entry_type not null,
  title text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create table public.assist_action_recommendations (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references public.assist_incidents(id),
  event_id uuid not null references public.assist_disruption_events(id),
  action_type policy_action_type not null,
  status text not null,
  reason text not null,
  priority int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.assist_disruption_events enable row level security;
alter table public.assist_incidents enable row level security;
alter table public.assist_timeline enable row level security;
alter table public.assist_action_recommendations enable row level security;
alter table public.assist_policy_rules enable row level security;

create policy "Owner reads disruption events" on public.assist_disruption_events for select using (
  exists (select 1 from public.trips where trips.id = assist_disruption_events.trip_id and trips.owner_id = auth.uid())
);
create policy "Owner reads incidents" on public.assist_incidents for select using (
  exists (select 1 from public.trips where trips.id = assist_incidents.trip_id and trips.owner_id = auth.uid())
);
create policy "Owner reads timeline" on public.assist_timeline for select using (
  exists (
    select 1 from public.assist_incidents i
    join public.trips t on t.id = i.trip_id
    where i.id = assist_timeline.incident_id and t.owner_id = auth.uid()
  )
);
create policy "Owner reads recommendations" on public.assist_action_recommendations for select using (
  exists (
    select 1 from public.assist_incidents i
    join public.trips t on t.id = i.trip_id
    where i.id = assist_action_recommendations.incident_id and t.owner_id = auth.uid()
  )
);
create policy "Anyone reads active policy rules" on public.assist_policy_rules for select using (is_active = true);
