#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${TEST_DATABASE_URL:-}" ]]; then
  echo "TEST_DATABASE_URL is required" >&2
  exit 2
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
migrations_dir="$repo_root/packages/db/migrations"
migration="$migrations_dir/011_media_evidence_pinning.sql"

if [[ ! -f "$migration" ]]; then
  echo "missing migration: $migration" >&2
  exit 1
fi

psql_cmd=(psql "$TEST_DATABASE_URL" -X -v ON_ERROR_STOP=1)

"${psql_cmd[@]}" -c 'drop schema if exists public cascade; create schema public;'

for file in \
  001_initial.sql \
  002_partner_auth.sql \
  003_metrics_columns.sql \
  004_session_create_tokens.sql \
  005_business_context.sql \
  006_api_key_types.sql \
  007_capture_links.sql \
  009_business_context_import.sql \
  010_webhook_delivery_event_id.sql; do
  "${psql_cmd[@]}" -f "$migrations_dir/$file" >/dev/null
done

partner_id='00000000-0000-4000-8000-000000000001'
legacy_session_id='00000000-0000-4000-8000-000000000011'
second_session_id='00000000-0000-4000-8000-000000000012'

"${psql_cmd[@]}" <<SQL >/dev/null
insert into partners (id, name) values ('$partner_id', 'Migration test partner');
insert into sessions (id, partner_id, expires_at)
values
  ('$legacy_session_id', '$partner_id', now() + interval '1 hour'),
  ('$second_session_id', '$partner_id', now() + interval '1 hour');
insert into recordings (session_id, storage_key, mime_type)
values ('$legacy_session_id', 'recordings/legacy/audio.webm', 'audio/webm');
SQL

"${psql_cmd[@]}" -f "$migration" >/dev/null

legacy_result="$("${psql_cmd[@]}" -Atc "
  select upload_protocol || '|' ||
         (r.storage_bucket is null)::text || '|' ||
         (r.object_version_id is null)::text || '|' ||
         (r.upload_grant_id is null)::text
  from sessions s
  join recordings r on r.session_id = s.id
  where s.id = '$legacy_session_id'
")"

[[ "$legacy_result" == 'legacy-v0|true|true|true' ]] || {
  echo "legacy compatibility failed: $legacy_result" >&2
  exit 1
}

grant_id='00000000-0000-4000-8000-000000000021'
grant_attempt_id='00000000-0000-4000-8000-000000000022'

"${psql_cmd[@]}" <<SQL >/dev/null
insert into upload_grants (
  id, partner_id, session_id, upload_attempt_id, idempotency_key,
  request_hash, response_json, storage_bucket, storage_key,
  expected_mime_type, expected_size_bytes, expected_checksum_sha256,
  expires_at
) values (
  '$grant_id', '$partner_id', '$second_session_id', '$grant_attempt_id',
  'grant-key-0001', repeat('a', 64), '{"uploadId":"test"}',
  'hearloop-audio-prod', 'recordings/test/versioned.webm',
  'audio/webm', 4096, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  now() + interval '15 minutes'
);

insert into recordings (
  session_id, storage_key, mime_type, size_bytes, sha256_hash,
  storage_bucket, object_version_id, etag, checksum_sha256,
  upload_grant_id, pinned_at
) values (
  '$second_session_id', 'recordings/test/versioned.webm', 'audio/webm',
  4096, repeat('b', 64), 'hearloop-audio-prod', 's3-version-1',
  '"etag-1"', 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  '$grant_id', now()
);

update upload_grants set state = 'pinned', pinned_at = now()
where id = '$grant_id';

insert into finalize_receipts (
  partner_id, session_id, upload_grant_id, idempotency_key,
  request_hash, status, response_status, response_json, expires_at
) values (
  '$partner_id', '$second_session_id', '$grant_id', 'finalize-key-0001',
  repeat('c', 64), 'completed', 202,
  '{"sessionId":"00000000-0000-4000-8000-000000000012"}',
  now() + interval '24 hours'
);
SQL

assert_rejected() {
  local sql="$1"
  if "${psql_cmd[@]}" -c "$sql" >/dev/null 2>&1; then
    echo "expected constraint rejection: $sql" >&2
    exit 1
  fi
}

assert_rejected "
  insert into upload_grants (
    partner_id, session_id, upload_attempt_id, idempotency_key,
    request_hash, response_json, storage_bucket, storage_key,
    expected_mime_type, expected_size_bytes, expected_checksum_sha256,
    expires_at
  ) values (
    '$partner_id', '$second_session_id', '$grant_attempt_id', 'grant-key-0002',
    repeat('d', 64), '{}', 'hearloop-audio-prod', 'recordings/test/other.webm',
    'audio/webm', 4096, 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    now() + interval '15 minutes'
  )"

assert_rejected "
  insert into finalize_receipts (
    partner_id, session_id, upload_grant_id, idempotency_key,
    request_hash, status, response_status, response_json, expires_at
  ) values (
    '$partner_id', '$second_session_id', '$grant_id', 'finalize-key-0001',
    repeat('e', 64), 'completed', 409, '{}', now() + interval '24 hours'
  )"

assert_rejected "
  update upload_grants
  set state = 'cleanup_claimed', cleanup_lease_token = null, cleanup_lease_until = null
  where id = '$grant_id'"

assert_rejected "
  update sessions set upload_protocol = 'unknown-v2'
  where id = '$second_session_id'"

echo '011_media_evidence_pinning migration contract: PASS'
