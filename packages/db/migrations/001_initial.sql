-- hearloop/packages/db/migrations/001_initial.sql

-- Partners
create table partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'suspended')),
  webhook_url text,
  allowed_origins text,
  default_config_json text,
  created_at timestamptz not null default now()
);

-- API Keys
create table api_keys (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  type text not null default 'secret' check (type in ('secret', 'public')),
  key_prefix text not null,
  key_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_api_keys_key_hash on api_keys(key_hash);
create index idx_api_keys_partner_id on api_keys(partner_id);

-- Sessions
create table sessions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  public_token uuid not null unique default gen_random_uuid(),
  status text not null default 'created' check (
    status in (
      'created', 'opened', 'recording', 'uploaded',
      'submitted', 'processing', 'completed', 'failed', 'expired'
    )
  ),
  failure_reason text,
  external_event_id text,
  max_duration_sec int not null default 5,
  metadata_json text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_sessions_partner_id on sessions(partner_id);
create index idx_sessions_public_token on sessions(public_token);
create index idx_sessions_status on sessions(status);
create index idx_sessions_expires_at on sessions(expires_at);

-- Recordings
create table recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  storage_key text not null,
  mime_type text not null,
  duration_ms int,
  size_bytes int not null default 0,
  sha256_hash text not null default '',
  created_at timestamptz not null default now()
);

create index idx_recordings_session_id on recordings(session_id);

-- Analyses
create table analyses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references sessions(id) on delete cascade,
  transcript text,
  detected_language text,
  confidence text check (confidence in ('high', 'low')),
  sentiment_label text check (sentiment_label in ('positive', 'neutral', 'negative')),
  sentiment_score numeric(4, 3),
  topics_json text,
  moderation_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_analyses_session_id on analyses(session_id);
create index idx_analyses_sentiment_label on analyses(sentiment_label);

-- Webhook Deliveries
create table webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  event_type text not null,
  payload_json text not null,
  status text not null default 'pending' check (
    status in ('pending', 'delivered', 'failed', 'dead')
  ),
  attempt_count int not null default 0,
  response_code int,
  last_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (partner_id, session_id, event_type)
);

create index idx_webhook_deliveries_partner_id on webhook_deliveries(partner_id);
create index idx_webhook_deliveries_session_id on webhook_deliveries(session_id);
create index idx_webhook_deliveries_status on webhook_deliveries(status);