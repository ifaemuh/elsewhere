create type travel_document_type as enum ('passport', 'tsa_pre_check', 'global_entry');
create type partner_route_mode as enum ('referral', 'api');

create table public.travel_document_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  document_type travel_document_type not null,
  encrypted_reference text not null,
  expiration_date date,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.travel_admin_partner_routes (
  id uuid primary key default gen_random_uuid(),
  document_type travel_document_type not null,
  partner_name text not null,
  mode partner_route_mode not null,
  action_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.travel_admin_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  document_type travel_document_type not null,
  application_id text not null,
  status text not null,
  partner_name text not null,
  created_at timestamptz not null default now()
);

alter table public.travel_document_records enable row level security;
alter table public.travel_admin_partner_routes enable row level security;
alter table public.travel_admin_applications enable row level security;

create policy "Users read own docs" on public.travel_document_records for select using (auth.uid() = user_id);
create policy "Anyone reads active routes" on public.travel_admin_partner_routes for select using (is_active = true);
create policy "Users read own applications" on public.travel_admin_applications for select using (auth.uid() = user_id);
