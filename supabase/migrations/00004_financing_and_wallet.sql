create type financing_provider as enum ('uplift', 'klarna', 'affirm', 'unknown');
create type installment_status as enum ('pending', 'paid', 'late');

create table public.financing_offers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  provider_name financing_provider not null,
  months int not null,
  apr_percent numeric(5,2) not null default 0,
  monthly_amount numeric(10,2) not null,
  created_at timestamptz not null default now()
);

create table public.financing_checkouts (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.financing_offers(id),
  trip_id uuid not null references public.trips(id),
  checkout_id text not null,
  provider_name financing_provider not null,
  provider_reference text,
  status text not null,
  idempotency_key text not null unique,
  policy_version text not null,
  created_at timestamptz not null default now()
);

create table public.wallet_installments (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  traveler_id uuid not null references public.travelers(id),
  reference_key text,
  due_date date not null,
  amount numeric(10,2) not null,
  status installment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financing_status_events (
  id uuid primary key default gen_random_uuid(),
  installment_id uuid not null references public.wallet_installments(id),
  event_type text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.financing_disclosure_records (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  user_id uuid not null references public.profiles(id),
  accepted_at timestamptz not null,
  policy_version text not null,
  terms_summary text not null
);

alter table public.financing_offers enable row level security;
alter table public.wallet_installments enable row level security;
alter table public.financing_checkouts enable row level security;
alter table public.financing_status_events enable row level security;
alter table public.financing_disclosure_records enable row level security;

create policy "Owner reads financing offers" on public.financing_offers for select using (
  exists (select 1 from public.trips where trips.id = financing_offers.trip_id and trips.owner_id = auth.uid())
);
create policy "Owner reads wallet" on public.wallet_installments for select using (
  exists (select 1 from public.trips where trips.id = wallet_installments.trip_id and trips.owner_id = auth.uid())
);
create policy "Owner reads financing checkouts" on public.financing_checkouts for select using (
  exists (select 1 from public.trips where trips.id = financing_checkouts.trip_id and trips.owner_id = auth.uid())
);
create policy "Owner reads financing events" on public.financing_status_events for select using (
  exists (
    select 1 from public.wallet_installments wi
    join public.trips t on t.id = wi.trip_id
    where wi.id = financing_status_events.installment_id and t.owner_id = auth.uid()
  )
);
create policy "Owner reads disclosure records" on public.financing_disclosure_records for select using (
  user_id = auth.uid()
);
