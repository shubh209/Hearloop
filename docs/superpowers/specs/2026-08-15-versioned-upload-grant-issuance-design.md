# Versioned Upload-Grant Issuance Design

## Scope

Task 4 adds idempotent upload-grant issuance to both existing upload-URL routes:

- `POST /v1/public/session/:token/upload-url`
- `POST /v1/sessions/:id/upload-url`

Only Sessions whose `upload_protocol` is `versioned-v1` use the new contract. `legacy-v0` Sessions retain the current `{mimeType}` request and `{uploadUrl,storageKey,expiresIn}` response unchanged. New Sessions continue to default to `legacy-v0`; client rollout and changing that default are later work.

This task uses migration 011 and the version-aware storage primitives from Tasks 2 and 3. It does not apply the migration, update capture clients, implement finalize pinning, change workers, deploy, or change AWS configuration.

## Versioned Contract

A versioned request has:

- `Idempotency-Key`: 8–128 visible ASCII characters.
- JSON body no larger than 1 KiB.
- `uploadAttemptId`: UUID.
- `mimeType`: a MIME type supported by the versioned storage key builder.
- `sizeBytes`: an integer from 1,000 through 10,485,760.
- `checksumSha256`: canonical Base64 for exactly 32 bytes.

Success returns HTTP 201:

```json
{
  "uploadId": "upload-grant UUID",
  "uploadUrl": "short-lived signed URL",
  "storageKey": "tenant/session/attempt-scoped key",
  "expiresAt": "ISO-8601 timestamp",
  "requiredHeaders": {
    "Content-Type": "audio/webm",
    "x-amz-checksum-sha256": "Base64 SHA-256"
  }
}
```

An equivalent replay returns the stored status and exact stored JSON body and adds `Idempotent-Replayed: true`.

Validation failures return 400. A reused idempotency key with a different canonical request returns 422. Reusing an upload attempt for different media returns 409. Existing Session-not-found, expiry, ownership, and state responses remain unchanged. Storage signing failures return 503 without exposing bucket names, keys, signed URLs, checksums, VersionIds, or provider error details.

## Shared Module

A new upload-grant module owns validation, canonical hashing, persistence, concurrency resolution, and response/error types. Both routes remain responsible for authentication or token resolution and for checking Session ownership, expiry, and lifecycle state. They pass the trusted Partner ID, Session ID, idempotency key, and request body to the shared module.

The canonical request hash is SHA-256 hex over a fixed-order JSON representation of:

```text
uploadAttemptId, mimeType, sizeBytes, checksumSha256
```

The idempotency key is deliberately excluded: two keys describing the same protected upload attempt and media must converge on the same grant.

The module derives the storage key from Partner ID, Session ID, upload-attempt ID, and MIME type. It asks the Task 3 storage primitive for a checksum-bound presigned PUT, creates the response, and persists all authoritative request and response fields in `upload_grants`. `response_json` is the replay authority; replay does not generate a fresh URL or timestamp.

## Idempotency and Concurrency

The protected resource is `(session_id, upload_attempt_id)`. The module uses both migration 011 uniqueness constraints:

- `(session_id, idempotency_key)` detects idempotency-key reuse.
- `(session_id, upload_attempt_id)` selects a single grant for an upload attempt.

Resolution rules are:

| Existing row | Incoming request | Result |
| --- | --- | --- |
| Same Session and idempotency key | Same request hash | Replay stored 201 response |
| Same Session and idempotency key | Different request hash | 422 `idempotency_key_reused` |
| Same Session and upload attempt | Same request hash, different key | Replay stored 201 response |
| Same Session and upload attempt | Different request hash | 409 `upload_attempt_conflict` |
| Neither identity exists | Valid request | Insert and return new 201 response |

The insert treats either unique-constraint loss as an expected race, then reloads the winning row and applies the table above. Only the stored winner is returned. A losing contender may have generated an unused presigned URL, but it cannot upload unless disclosed; no object is created by signing alone.

Different upload-attempt IDs remain independent and may create separate grants. Finalize will choose the authoritative object in a later task.

## Protocol Compatibility

Each upload-URL query includes `sessions.upload_protocol`.

- `legacy-v0`: execute the existing code path and preserve its request defaults, response body, and status.
- `versioned-v1`: require the new header and full body, then issue or replay a grant.

No Session creation path is changed in Task 4. Tests may seed or mock a `versioned-v1` Session to exercise the new route behavior.

## Testing Strategy

Implementation follows red–green–refactor.

Unit tests cover request validation and deterministic canonical hashing, including malformed UUIDs, MIME types, sizes, checksums, idempotency keys, and body-size enforcement. Grant-service tests cover new issuance, exact replay, same-attempt/different-key convergence, 422 key reuse, 409 media conflict, unique-constraint races, persisted expiry/response consistency, and sanitized storage failure mapping.

Route tests cover both public and authenticated entry points, tenant isolation, Session expiry/state checks, protocol dispatch, 201 issuance, replay headers, and unchanged legacy responses. Scoped regression tests include the Task 3 storage suite and existing public/authenticated route tests. The API TypeScript build is the final static verification.

Migration 011 remains unapplied, so database-backed tests must use an isolated test database when available and must not target Neon or production.

## Security and Observability Constraints

Partner and Session identity always come from authenticated or server-resolved context, never the request body. The service never accepts a client storage key or bucket. Error bodies and logs must not include storage identifiers, signed URLs, checksums, idempotency keys, Session tokens, or raw provider errors.

Task 4 introduces no new metrics or alerts; those remain part of the broader rollout task. Existing rate limiting continues to apply to both routes.
