create table public.consent_audit_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  consent_id text not null unique,
  destination_name text not null,
  prompt text not null,
  has_identity_consent boolean not null,
  has_rights_confirmation boolean not null,
  has_reference_media boolean not null,
  policy_version text not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.consent_audit_entries enable row level security;
create policy "Users read own consents" on public.consent_audit_entries for select using (auth.uid() = user_id);
