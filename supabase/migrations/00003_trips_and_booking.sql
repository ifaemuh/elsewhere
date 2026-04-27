create type trip_status as enum ('draft', 'booked', 'in_progress', 'completed', 'canceled');
create type booking_flow_state as enum (
  'idle', 'quote_created', 'reserving_inventory',
  'payment_pending', 'confirmed', 'failed', 'rolled_back'
);

create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id),
  destination_id uuid not null references public.destinations(id),
  status trip_status not null default 'draft',
  traveler_count int not null default 1,
  total_cost numeric(10,2),
  start_date date,
  end_date date,
  booking_flow_state booking_flow_state not null default 'idle',
  booking_flow_attempt_count int not null default 0,
  booking_flow_error text,
  booking_flow_checkout_url text,
  booking_flow_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trips enable row level security;
create policy "Users manage own trips" on public.trips for all using (auth.uid() = owner_id);

create table public.trip_quotes (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id),
  total numeric(10,2) not null,
  currency_code text not null default 'USD',
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.trip_quotes enable row level security;
create policy "Users read own trip quotes" on public.trip_quotes
  for select using (
    exists (select 1 from public.trips where trips.id = trip_quotes.trip_id and trips.owner_id = auth.uid())
  );

create type payment_state as enum ('pending', 'paid', 'overdue');

create table public.travelers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid references public.profiles(id),
  name text not null,
  payment_state payment_state not null default 'pending',
  created_at timestamptz not null default now()
);

alter table public.travelers enable row level security;
create policy "Trip members see travelers" on public.travelers
  for select using (
    exists (select 1 from public.trips where trips.id = travelers.trip_id and trips.owner_id = auth.uid())
    or travelers.user_id = auth.uid()
  );

create type message_author_type as enum ('traveler', 'system');

create table public.trip_room_messages (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  author_id uuid references public.profiles(id),
  author_name text not null,
  author_type message_author_type not null default 'traveler',
  text text not null,
  created_at timestamptz not null default now()
);

alter table public.trip_room_messages enable row level security;
create policy "Trip members see messages" on public.trip_room_messages
  for select using (
    exists (select 1 from public.travelers where travelers.trip_id = trip_room_messages.trip_id and travelers.user_id = auth.uid())
    or exists (select 1 from public.trips where trips.id = trip_room_messages.trip_id and trips.owner_id = auth.uid())
  );
