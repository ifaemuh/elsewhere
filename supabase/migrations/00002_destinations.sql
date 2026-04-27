create table public.destinations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  teaser text not null,
  flight_cost numeric(10,2) not null,
  hotel_cost numeric(10,2) not null,
  activity_cost numeric(10,2) not null,
  transfer_cost numeric(10,2) not null,
  partner_fee numeric(10,2) not null,
  is_featured boolean not null default false,
  preview_image_url text,
  created_at timestamptz not null default now()
);

alter table public.destinations enable row level security;
create policy "Anyone can read destinations" on public.destinations for select using (true);
