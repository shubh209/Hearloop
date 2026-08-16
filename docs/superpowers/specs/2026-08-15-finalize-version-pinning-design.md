# Finalize-Time Exact-Version Pinning Design

## Scope

This slice adds exact-version pinning at finalize for:

- `POST /v1/public/session/:token/finalize`
- `POST /v1/sessions/:id/finalize`

Only Sessions whose `upload_protocol` is `versioned-v1` use the new contract. `legacy-v0` Sessions keep the current request, response, and status codes. Extra JSON fields on a `legacy-v0` Session do not switch protocols. New Sessions continue to default to `legacy-v0`.

This slice uses migration 011, version-aware `headVersion`, and upload-grant issuance. It does not apply migrations, change capture clients, change workers to read VersionId, implement delete/expiry/abandoned-grant cleanup, deploy, merge to `main`, or change AWS bucket configuration.

GitHub Issue: #4.

## Versioned Contract

A versioned finalize request has:

- `Idempotency-Key`: 8–128 visible ASCII characters.
- JSON body no larger than 1 KiB.
- `uploadId`: UUID of an `upload_grants` row for this Partner and Session.
- `versionId`: 1–1024 UTF-8 bytes (S3 VersionId from the PUT).
- `etag`: 1–128 characters.
- Optional `languageHint`, `promptText`, `durationMs`.

The client must not supply `storageKey`, MIME type, size, or checksum. Those come from the grant and from HEAD.

Success returns HTTP 200:

```json
{ "sessionId": "<uuid>", "status": "submitted" }
```

An equivalent replay returns the stored status and exact stored JSON body and adds `Idempotent-Replayed: true`.

Validation failures return 400 `invalid_finalize_request`. Same idempotency key with a different canonical request returns 422 `idempotency_key_reused`. This Session already pinned a different grant or VersionId, or another finalize holds a live verifying lease, returns 409 `upload_attempt_conflict`. Integrity failure (missing object, VersionId mismatch, checksum/size/MIME vs grant, ETag vs request) returns 422 `integrity_mismatch`. Existing Session-not-found, expiry, ownership, and state responses remain unchanged. Retryable storage failures return 503 `storage_unavailable` without exposing bucket names, keys, checksums, VersionIds, or provider errors.

`consentGiven` remains unused, as on `legacy-v0`.

## Shared Module

A new finalize-pinning module owns validation, canonical hashing, receipt persistence, grant lookup, exact-version HEAD, Recording pin, grant `pinned` transition, and response/error types. Both routes remain responsible for authentication or token resolution and for checking Session ownership, expiry, and lifecycle state. They pass the trusted Partner ID, Session ID, pipeline fields (`max_duration_sec`), idempotency key, and request body to the shared module.

The canonical request hash is SHA-256 hex over a fixed-order JSON representation of:

```text
uploadId, versionId, etag, languageHint, promptText, durationMs
```

Omitted `languageHint` and `promptText` hash as empty strings. Omitted `durationMs` hashes as `null`. The idempotency key is excluded from the hash.

The module loads the grant by `uploadId` scoped to Partner and Session. It HEADs `{storage_bucket, storage_key, versionId}` through `headVersion` (`ChecksumMode: ENABLED`). It does not GET the object body in this slice. HEAD MIME, size, and checksum must match the grant; HEAD ETag must match the request; HEAD VersionId must match the request.

## Idempotency and Concurrency

The receipt table is `finalize_receipts` only. Unique `(session_id, idempotency_key)`.

| Existing row | Incoming request | Result |
| --- | --- | --- |
| Same Session and idempotency key, `completed`, same hash | Replay | Stored 200 JSON + `Idempotent-Replayed: true`. No HEAD, no enqueue. |
| Same Session and idempotency key, different hash | Conflict | 422 `idempotency_key_reused` |
| Same Session and idempotency key, `verifying`, live lease | In-flight | 409 `upload_attempt_conflict` |
| Same Session and idempotency key, `verifying`, expired lease | Takeover | Re-run HEAD+pin under a new lease |
| Neither identity exists | Valid request | Insert `verifying`, then pin |

The protected pin is one Recording per Session (`session_id` unique). If that row already has a different `upload_grant_id` or `object_version_id`, return 409 `upload_attempt_conflict`.

Grant rules:

- Missing or not owned by this Partner+Session: 400 `invalid_finalize_request`
- `cleaned` or `cleanup_claimed`: 409 `upload_attempt_conflict`
- `expires_at` in the past: still pin if the object exists (abandoned-grant cleanup is a later slice)
- `pinned` to this VersionId: treat as success path / replay if the receipt matches

Integrity failure does not pin, does not enqueue, does not set Session `failed`, and does not complete a receipt. Delete or abandon the `verifying` row so the same idempotency key can retry.

## Persistence

On integrity success, persist then enqueue:

1. Insert the Recording if none exists for the Session; otherwise update that unique row.
2. Set `storage_key` from the grant; `mime_type`, `size_bytes`, `sha256_hash` / `checksum_sha256`, `etag`, `storage_bucket`, `object_version_id`, `upload_grant_id`, `pinned_at` from grant + HEAD; `duration_ms` from the request.
3. Mark the grant `state=pinned`, `pinned_at=now`, cleanup lease fields null.
4. Set Session `status=submitted`.
5. Complete the receipt (`response_status=200`, `response_json`, clear verification lease).
6. After commit, `enqueueValidate` with the grant `storage_key`. Workers remain key-only until the next ordered action.

`legacy-v0` finalize keeps its current upsert, `storage_key_mismatch` check, and `{sessionId, status}` replay for already-submitted Sessions. It does not write `finalize_receipts`.

## Protocol Compatibility

Each finalize query includes `sessions.upload_protocol`.

- `legacy-v0`: existing code path.
- `versioned-v1`: require the new header and body, then pin or replay.

No Session creation path changes. Tests and the live probe set `upload_protocol=versioned-v1` explicitly.

## Testing Strategy

Red–green–refactor.

Unit tests: request validation and deterministic hashing.

Module tests with mocked `headVersion`: new pin, exact replay, 422 key reuse, 409 other pin / live lease, 422 integrity mismatch, sanitized storage 503, grant ownership.

Route tests for public and authenticated finalize: protocol dispatch, unchanged `legacy-v0` (including extra JSON that must not switch protocols), 200 pin, replay header, integrity and conflict mapping.

Live S3 probe (authorized this slice): PUT a disposable prefix on `hearloop-audio-prod` (us-east-2), HEAD that VersionId through the pin path, delete only probe versions. Gated like the existing storage live suite (`RUN_LIVE_S3_STORAGE_CONTRACT=1` or an equivalent finalize flag). No unrelated deletes.

Scoped verification does not include full API/web/React suites or production `versioned-v1` traffic.

## Security and Observability

Partner and Session identity come from authenticated or server-resolved context. The service never accepts a client storage key or bucket on `versioned-v1`. Error bodies and logs must not include storage identifiers, signed URLs, checksums, idempotency keys, Session tokens, VersionIds, or raw provider errors.

This slice adds no new production alerts. `context/BACKLOG.md` and `context/METRICS.md` record the slice (tests + probe), not production versioned traffic.

## Rollback

No production schema rollback. If this code is deployed later, `legacy-v0` Sessions must keep working without the new finalize path. Production rollback SQL is not this task.
