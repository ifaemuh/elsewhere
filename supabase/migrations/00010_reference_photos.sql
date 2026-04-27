-- Reference photos for face-personalized previews
create table public.reference_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  file_name text not null,
  storage_path text not null,
  content_type text not null,
  status text not null default 'validated',
  rejection_reason text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_reference_photos_user on public.reference_photos(user_id)
  where deleted_at is null;

alter table public.reference_photos enable row level security;

create policy "Users manage own reference photos"
  on public.reference_photos
  for all
  using (auth.uid() = user_id);
