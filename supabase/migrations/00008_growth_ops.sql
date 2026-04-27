create table public.branded_destination_packs (
  id uuid primary key default gen_random_uuid(),
  sponsor_name text not null,
  title text not null,
  destination_id uuid not null references public.destinations(id),
  headline text not null,
  cta_label text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.attribution_touchpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  channel text not null,
  campaign_code text not null,
  destination_name text not null,
  booked_trip_id uuid references public.trips(id),
  conversion_value numeric(10,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.experiment_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  flag_key text not null,
  variant text not null,
  assigned_at timestamptz not null default now()
);

create table public.support_override_actions (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references public.profiles(id),
  kind text not null,
  target_reference text not null,
  reason text not null,
  status text not null default 'submitted',
  created_at timestamptz not null default now()
);

create table public.funnel_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  stage text not null,
  event_name text not null,
  destination_name text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.branded_destination_packs enable row level security;
alter table public.attribution_touchpoints enable row level security;
alter table public.experiment_assignments enable row level security;
alter table public.support_override_actions enable row level security;
alter table public.funnel_telemetry_events enable row level security;

create policy "Anyone reads active packs" on public.branded_destination_packs for select using (is_active = true);
create policy "Users read own attribution" on public.attribution_touchpoints for select using (auth.uid() = user_id);
create policy "Users read own experiments" on public.experiment_assignments for select using (auth.uid() = user_id);
create policy "Users read own overrides" on public.support_override_actions for select using (auth.uid() = requested_by);
create policy "Users read own telemetry" on public.funnel_telemetry_events for select using (auth.uid() = user_id);
