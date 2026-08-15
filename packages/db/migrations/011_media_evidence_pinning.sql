-- Hearloop Phase 1: additive schema for version-pinned media evidence.
-- Existing sessions and recordings remain legacy-v0 with nullable version fields.

begin;

alter table sessions
  add column upload_protocol text not null default 'legacy-v0'
    check (upload_protocol in ('legacy-v0', 'versioned-v1'));

create table upload_grants (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  upload_attempt_id uuid not null,
  idempotency_key text not null
    check (char_length(idempotency_key) between 8 and 128),
  request_hash text not null
    check (request_hash ~ '^[0-9a-f]{64}$'),
  response_json text not null,
  storage_bucket text not null,
  storage_key text not null,
  expected_mime_type text not null,
  expected_size_bytes integer not null
    check (expected_size_bytes between 1000 and 10485760),
  expected_checksum_sha256 text not null
    check (expected_checksum_sha256 ~ '^[A-Za-z0-9+/]{43}=$'),
  expires_at timestamptz not null,
  state text not null default 'available'
    check (state in ('available', 'cleanup_claimed', 'pinned', 'cleaned')),
  cleanup_lease_token uuid,
  cleanup_lease_until timestamptz,
  cleanup_attempts integer not null default 0
    check (cleanup_attempts >= 0),
  pinned_at timestamptz,
  cleaned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, upload_attempt_id),
  unique (session_id, idempotency_key),
  check (
    (state = 'available'
      and cleanup_lease_token is null
      and cleanup_lease_until is null
      and pinned_at is null
      and cleaned_at is null)
    or
    (state = 'cleanup_claimed'
      and cleanup_lease_token is not null
      and cleanup_lease_until is not null
      and pinned_at is null
      and cleaned_at is null)
    or
    (state = 'pinned'
      and cleanup_lease_token is null
      and cleanup_lease_until is null
      and pinned_at is not null
      and cleaned_at is null)
    or
    (state = 'cleaned'
      and cleanup_lease_token is null
      and cleanup_lease_until is null
      and pinned_at is null
      and cleaned_at is not null)
  )
);

create index idx_upload_grants_partner_id
  on upload_grants(partner_id);
create index idx_upload_grants_session_id
  on upload_grants(session_id);
create index idx_upload_grants_cleanup_due
  on upload_grants(state, expires_at, cleanup_lease_until);

alter table recordings
  add column storage_bucket text,
  add column object_version_id text,
  add column etag text,
  add column checksum_sha256 text
    check (
      checksum_sha256 is null
      or checksum_sha256 ~ '^[A-Za-z0-9+/]{43}=$'
    ),
  add column upload_grant_id uuid references upload_grants(id),
  add column pinned_at timestamptz;

create unique index uq_recordings_upload_grant_id
  on recordings(upload_grant_id)
  where upload_grant_id is not null;

create unique index uq_recordings_storage_version
  on recordings(storage_bucket, storage_key, object_version_id)
  where object_version_id is not null;

create table finalize_receipts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references partners(id) on delete cascade,
  session_id uuid not null references sessions(id) on delete cascade,
  upload_grant_id uuid not null references upload_grants(id),
  idempotency_key text not null
    check (char_length(idempotency_key) between 8 and 128),
  request_hash text not null
    check (request_hash ~ '^[0-9a-f]{64}$'),
  status text not null
    check (status in ('verifying', 'completed')),
  response_status integer
    check (response_status is null or response_status between 100 and 599),
  response_json text,
  verification_lease_token uuid,
  verification_lease_until timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, idempotency_key),
  check (
    (status = 'verifying'
      and response_status is null
      and response_json is null
      and verification_lease_token is not null
      and verification_lease_until is not null)
    or
    (status = 'completed'
      and response_status is not null
      and response_json is not null
      and verification_lease_token is null
      and verification_lease_until is null)
  )
);

create index idx_finalize_receipts_partner_id
  on finalize_receipts(partner_id);
create index idx_finalize_receipts_session_id
  on finalize_receipts(session_id);
create index idx_finalize_receipts_expiry
  on finalize_receipts(expires_at);

commit;

-- Manual rollback, only before versioned-v1 traffic exists:
-- begin;
-- drop table finalize_receipts;
-- drop index uq_recordings_storage_version;
-- drop index uq_recordings_upload_grant_id;
-- alter table recordings
--   drop column pinned_at,
--   drop column upload_grant_id,
--   drop column checksum_sha256,
--   drop column etag,
--   drop column object_version_id,
--   drop column storage_bucket;
-- drop table upload_grants;
-- alter table sessions drop column upload_protocol;
-- commit;
