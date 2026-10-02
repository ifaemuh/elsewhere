-- Track D: partner API keys and rules API analytics.
-- Service role only: RLS is on with no policies, so anon/authenticated clients can't read or write.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  partner_id text not null,
  key_hash text not null unique,              -- sha256 hex of the full key; the key itself is never stored
  rate_limit_rule text not null default 'rules-partner',  -- Vercel Firewall rate-limit rule ID
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.api_keys enable row level security;

create table public.rules_api_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  surface text not null check (surface in ('api', 'mcp')),
  endpoint text not null,
  status integer not null,
  client_name text,
  client_version text,
  tier text not null check (tier in ('anonymous', 'partner')),
  key_id uuid references public.api_keys(id),
  rule_ids text[] not null default '{}',
  fact_names text[] not null default '{}',
  event_type text,
  missing_facts text[] not null default '{}',
  query text check (query is null or char_length(query) <= 200),
  result_count integer not null default 0,
  library_version text,
  latency_ms integer not null
);

create index rules_api_events_created_at_idx on public.rules_api_events (created_at desc);

alter table public.rules_api_events enable row level security;
