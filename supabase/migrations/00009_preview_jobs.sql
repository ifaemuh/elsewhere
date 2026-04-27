create type preview_job_status as enum ('pending', 'processing', 'completed', 'failed', 'canceled');
create type preview_media_type as enum ('image', 'video');

create table public.preview_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  destination_id uuid references public.destinations(id),
  destination_name text not null,
  prompt text not null,
  media_type preview_media_type not null default 'image',
  status preview_job_status not null default 'pending',
  playback_url text,
  thumbnail_url text,
  error_message text,
  consent_id text references public.consent_audit_entries(consent_id),
  provider_job_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.preview_jobs enable row level security;
create policy "Users manage own preview jobs" on public.preview_jobs for all using (auth.uid() = user_id);
