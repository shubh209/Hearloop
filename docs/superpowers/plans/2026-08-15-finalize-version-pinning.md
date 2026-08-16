# Finalize-Time Exact-Version Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagent-driven-development is optional; this task already chose inline execution after plan approval.

**Goal:** Pin an exact S3 VersionId at public and authenticated finalize for `versioned-v1` Sessions, with `finalize_receipts` idempotency and HEAD integrity, while leaving `legacy-v0` finalize unchanged.

**Architecture:** A focused `finalize-pinning.ts` module validates and hashes versioned finalize requests, resolves receipts through migration 011's `(session_id, idempotency_key)` uniqueness, HEADs the grant's exact VersionId, inserts-or-updates the unique Recording row, marks the grant `pinned`, and returns the stored 200 body. Both route files keep Session lookup, authentication, expiry, and lifecycle checks; they dispatch by `sessions.upload_protocol` and delegate only `versioned-v1` pinning.

**Tech Stack:** Node.js 20, TypeScript, Fastify 5, Kysely, PostgreSQL, Jest, AWS SDK S3 `HeadObject`.

## Global Constraints

- Only Sessions whose `upload_protocol` is `versioned-v1` use the new contract.
- New Sessions remain `legacy-v0`; tests and the live probe set `versioned-v1` explicitly.
- Do not re-apply migrations 010/011, change workers, delete/cleanup, capture clients, merge to `main`, or deploy.
- Never accept Partner ID, Session ID, bucket, or storage key from the versioned body.
- Never expose or log signed URLs, storage identifiers, checksums, idempotency keys, Session tokens, VersionIds, or raw provider errors.
- Integrity failure: HTTP 422 `integrity_mismatch`; do not pin; do not enqueue; leave Session unfinalized.
- Conflicts: 422 `idempotency_key_reused`; 409 `upload_attempt_conflict`.
- Versioned success is HTTP 200 `{ sessionId, status: "submitted" }` to match current finalize.
- Live S3 probe is authorized on `hearloop-audio-prod` under a disposable prefix; delete only probe versions.
- Run every `../../node_modules/.bin/jest` command below from `apps/api`.

Spec: `docs/superpowers/specs/2026-08-15-finalize-version-pinning-design.md`. Issue: #4.

---

### Task 1: Request Validation and Canonical Hashing

**Files:**
- Create: `apps/api/src/lib/finalize-pinning.ts`
- Create: `apps/api/src/lib/__tests__/finalize-pinning.test.ts`

**Interfaces:**
- Consumes: Node `createHash`.
- Produces: `parseFinalizePinRequest`, `hashFinalizePinRequest`, `FinalizePinError`.

```ts
export interface VersionedFinalizePinRequest {
  uploadId: string;
  versionId: string;
  etag: string;
  languageHint: string;
  promptText: string;
  durationMs: number | null;
}

export interface ParsedFinalizePinRequest {
  idempotencyKey: string;
  request: VersionedFinalizePinRequest;
}

export class FinalizePinError extends Error {
  readonly name = "FinalizePinError";
  constructor(
    readonly statusCode: 400 | 409 | 422 | 503,
    readonly errorCode:
      | "invalid_finalize_request"
      | "upload_attempt_conflict"
      | "idempotency_key_reused"
      | "integrity_mismatch"
      | "storage_unavailable"
  ) {
    super(errorCode);
  }
}
```

- [ ] **Step 1: Write failing validation and hash tests**

```ts
const VALID_BODY = {
  uploadId: "55555555-5555-4555-8555-555555555555",
  versionId: "s3-version-abc",
  etag: "\"etag-1\"",
};

expect(parseFinalizePinRequest("final-key-0001", VALID_BODY)).toEqual({
  idempotencyKey: "final-key-0001",
  request: {
    ...VALID_BODY,
    languageHint: "",
    promptText: "",
    durationMs: null,
  },
});
expect(hashFinalizePinRequest(parseFinalizePinRequest("final-key-0001", VALID_BODY).request))
  .toMatch(/^[0-9a-f]{64}$/);
```

Cover missing/short/long/space/control/non-ASCII idempotency keys; non-object bodies; body UTF-8 > 1024 bytes; malformed `uploadId`; empty/`versionId` over 1024 UTF-8 bytes; empty/`etag` over 128 chars; non-integer/`durationMs` < 0. Optional `languageHint`/`promptText` must be strings when present. Every invalid case throws `FinalizePinError(400, "invalid_finalize_request")` without echoing the rejected value.

Property test with `fast-check`: identical semantic fields → same hash; changing any of `uploadId`, `versionId`, `etag`, `languageHint`, `promptText`, `durationMs` changes the hash. Fixed-order test: insertion order must not change the hash.

- [ ] **Step 2: Run the new test and verify RED**

```bash
../../node_modules/.bin/jest --runInBand src/lib/__tests__/finalize-pinning.test.ts
```

Expected: FAIL because `../finalize-pinning` does not exist.

- [ ] **Step 3: Implement minimal validation, error, and hashing**

Idempotency: `/^[\x21-\x7e]{8,128}$/`. UUID: repository regex. `versionId`: `Buffer.byteLength` 1–1024. `etag`: trim length 1–128. Body size: `Buffer.byteLength(JSON.stringify(body), "utf8") <= 1024`. Hash:

```ts
return createHash("sha256")
  .update(JSON.stringify({
    uploadId: request.uploadId,
    versionId: request.versionId,
    etag: request.etag,
    languageHint: request.languageHint,
    promptText: request.promptText,
    durationMs: request.durationMs,
  }))
  .digest("hex");
```

- [ ] **Step 4: Run tests and verify GREEN**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/finalize-pinning.ts apps/api/src/lib/__tests__/finalize-pinning.test.ts
git commit -m "feat(api): validate versioned finalize pin requests"
```

---

### Task 2: Pinning Service (Receipts, HEAD, Persist)

**Files:**
- Modify: `apps/api/src/lib/finalize-pinning.ts`
- Modify: `apps/api/src/lib/__tests__/finalize-pinning.test.ts`

**Interfaces:**
- Consumes: `headVersion` (`StorageVersionRef` → `VersionedObjectMetadata`), `StorageError`, Kysely tables `upload_grants`, `finalize_receipts`, `recordings`, `sessions`.
- Produces: `createFinalizePinner(deps)`, `pinVersionedFinalize(input)`.

```ts
export interface FinalizePinInput {
  partnerId: string;
  sessionId: string;
  maxDurationSec: number;
  idempotencyKey: unknown;
  body: unknown;
}

export interface FinalizePinResult {
  response: { sessionId: string; status: "submitted" };
  responseStatus: 200;
  replayed: boolean;
}

export interface FinalizeGrantRow {
  id: string;
  partner_id: string;
  session_id: string;
  storage_bucket: string;
  storage_key: string;
  expected_mime_type: string;
  expected_size_bytes: number;
  expected_checksum_sha256: string;
  state: "available" | "cleanup_claimed" | "pinned" | "cleaned";
}

export interface FinalizeReceiptRow {
  id: string;
  partner_id: string;
  session_id: string;
  upload_grant_id: string;
  idempotency_key: string;
  request_hash: string;
  status: "verifying" | "completed";
  response_status: number | null;
  response_json: string | null;
  verification_lease_until: Date | null;
}

export interface RecordingPinRow {
  id: string;
  session_id: string;
  upload_grant_id: string | null;
  object_version_id: string | null;
}

export interface FinalizePinDependencies {
  now(): Date;
  createId(): string;
  findReceipt(sessionId: string, idempotencyKey: string): Promise<FinalizeReceiptRow | undefined>;
  insertVerifyingReceipt(row: {
    id: string;
    partner_id: string;
    session_id: string;
    upload_grant_id: string;
    idempotency_key: string;
    request_hash: string;
    verification_lease_token: string;
    verification_lease_until: Date;
  }): Promise<void>;
  completeReceipt(id: string, responseStatus: number, responseJson: string): Promise<void>;
  deleteReceipt(id: string): Promise<void>;
  findGrant(partnerId: string, sessionId: string, uploadId: string): Promise<FinalizeGrantRow | undefined>;
  findRecording(sessionId: string): Promise<RecordingPinRow | undefined>;
  persistPin(input: {
    sessionId: string;
    grant: FinalizeGrantRow;
    metadata: VersionedObjectMetadata;
    durationMs: number | null;
    recordingId: string;
    pinnedAt: Date;
  }): Promise<void>;
  headVersion(ref: StorageVersionRef): Promise<VersionedObjectMetadata>;
  enqueueValidate(payload: {
    sessionId: string;
    storageKey: string;
    mimeType: string;
    languageHint?: string;
    promptText?: string;
    maxDurationSec?: number;
  }): Promise<void>;
}
```

`persistPin` must: upsert Recording (insert if missing, else update the unique `session_id` row) with grant `storage_key`, HEAD mime/size/etag/checksum/version/bucket, `upload_grant_id`, `pinned_at`, `duration_ms`; set grant `state='pinned'`, `pinned_at`, cleanup lease fields null; set Session `status='submitted'`. Default production deps wrap these in one Kysely transaction.

- [ ] **Step 1: Write failing service tests with in-memory deps**

Cover:

1. Happy path: grant `available`, HEAD matches grant + request ETag → persistPin once, completeReceipt 200, enqueueValidate with grant `storage_key` and HEAD mime, `replayed: false`.
2. Replay: completed receipt same hash → return stored JSON, no HEAD, no persist, no enqueue, `replayed: true`.
3. 422 `idempotency_key_reused`: completed or verifying receipt different hash.
4. 409 live verifying lease (`verification_lease_until` in the future).
5. Expired verifying lease: takeover, HEAD+pin.
6. Missing/wrong-tenant grant → 400 `invalid_finalize_request`.
7. Grant `cleaned` or `cleanup_claimed` → 409.
8. Recording already pinned to a different grant or VersionId → 409.
9. HEAD `not_found` / `integrity_mismatch` / metadata mismatch vs grant or ETag → 422 `integrity_mismatch`; delete verifying receipt; no persistPin; no enqueue.
10. Retryable `StorageError` → 503 `storage_unavailable`; do not log VersionId/checksum.
11. Unique-violation on receipt insert → reload winner and apply replay/422 rules.
12. Already-pinned grant for the same VersionId with completed matching receipt → replay.

Do not call real S3 or Neon.

- [ ] **Step 2: Run tests and verify RED**

```bash
../../node_modules/.bin/jest --runInBand src/lib/__tests__/finalize-pinning.test.ts
```

Expected: FAIL because `createFinalizePinner` / `pinVersionedFinalize` do not exist.

- [ ] **Step 3: Implement the pinner**

Flow:

1. Parse + hash.
2. `findReceipt`. If `completed` and same hash, replay. If different hash, 422. If `verifying` and lease live, 409. If `verifying` and lease expired, continue with that receipt id (takeover).
3. `findGrant`. Apply grant rules.
4. `findRecording`. If pinned to a different grant/VersionId, 409.
5. Insert verifying receipt unless taking over (lease 30s). Catch `23505` and reload.
6. `headVersion({ bucket: grant.storage_bucket, key: grant.storage_key, versionId: request.versionId })`. Map `StorageError`: retryable/`upstream_error` → 503; else 422 `integrity_mismatch`. After catch, `deleteReceipt` then throw.
7. Compare HEAD mime/size/checksum to grant and ETag to request (normalize quoted ETags). Mismatch → delete receipt, 422.
8. `persistPin`, `completeReceipt`, `enqueueValidate` (languageHint/promptText omitted from enqueue when empty).
9. Return `{ response: { sessionId, status: "submitted" }, responseStatus: 200, replayed: false }`.

Wire `pinVersionedFinalize` to production deps using `db`, `headVersion`, `enqueueValidate`, `randomUUID`.

- [ ] **Step 4: Run tests and verify GREEN**

Same command as Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/finalize-pinning.ts apps/api/src/lib/__tests__/finalize-pinning.test.ts
git commit -m "feat(api): pin exact S3 VersionId at versioned finalize"
```

---

### Task 3: Authenticated Finalize Dispatch

**Files:**
- Modify: `apps/api/src/routes/sessions.ts`
- Modify: `apps/api/src/routes/__tests__/sessions.test.ts`

**Interfaces:**
- Consumes: `pinVersionedFinalize`, `FinalizePinError`.
- Produces: protocol dispatch on `POST /sessions/:id/finalize`.

- [ ] **Step 1: Write failing authenticated finalize tests**

Mock `pinVersionedFinalize`. After existing UUID/ownership/state checks would pass:

```ts
mockExecuteTakeFirst.mockResolvedValue({
  id: VALID_ID,
  partner_id: "partner-1",
  status: "opened",
  upload_protocol: "versioned-v1",
  max_duration_sec: 5,
});
mockPinVersionedFinalize.mockResolvedValue({
  response: { sessionId: VALID_ID, status: "submitted" },
  responseStatus: 200,
  replayed: false,
});
```

Assert trusted `partner.id` + path id are passed; 200 body; no `Idempotent-Replayed` on first pin; header `true` on replay; `FinalizePinError` mapped to `{ error }`. `legacy-v0` still uses `buildStorageKey` and never calls the pinner. Extra JSON (`uploadId`) on `legacy-v0` must not call the pinner. Invalid UUID / 404 / invalid state / already-submitted replay stay current and never call the pinner.

- [ ] **Step 2: Run authenticated tests and verify RED**

```bash
../../node_modules/.bin/jest --runInBand src/routes/__tests__/sessions.test.ts
```

Expected: FAIL because finalize does not dispatch.

- [ ] **Step 3: Implement dispatch after existing not-found and state checks**

```ts
if (session.upload_protocol === "versioned-v1") {
  try {
    const result = await pinVersionedFinalize({
      partnerId: partner.id,
      sessionId: id,
      maxDurationSec: session.max_duration_sec,
      idempotencyKey: req.headers["idempotency-key"],
      body: req.body,
    });
    if (result.replayed) reply.header("Idempotent-Replayed", "true");
    return reply.code(result.responseStatus).send(result.response);
  } catch (error) {
    if (error instanceof FinalizePinError) {
      return reply.code(error.statusCode).send({ error: error.errorCode });
    }
    throw error;
  }
}
```

Leave the `legacy-v0` branch behavior unchanged. `selectAll()` already includes `upload_protocol`.

- [ ] **Step 4: Run tests and verify GREEN**

Same command as Step 2. Expected: PASS including existing `storage_key_mismatch` test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/sessions.ts apps/api/src/routes/__tests__/sessions.test.ts
git commit -m "feat(api): dispatch versioned finalize pinning on authenticated route"
```

---

### Task 4: Public Finalize Dispatch

**Files:**
- Modify: `apps/api/src/routes/public.ts`
- Modify: `apps/api/src/routes/__tests__/public.test.ts`

**Interfaces:**
- Consumes: `pinVersionedFinalize`, `FinalizePinError`.
- Produces: protocol dispatch on `POST /public/session/:token/finalize`.

- [ ] **Step 1: Write failing public finalize tests**

Same pin/replay/error/legacy/extra-JSON assertions as Task 3. Expired Session (410) and invalid state must not call the pinner. Pass `session.partner_id` and `session.id` from the token lookup, never from the body.

- [ ] **Step 2: Run public tests and verify RED**

```bash
../../node_modules/.bin/jest --runInBand src/routes/__tests__/public.test.ts
```

Expected: FAIL because public finalize does not select `upload_protocol` or call the pinner.

- [ ] **Step 3: Implement public dispatch**

Add `upload_protocol` to the Session select. After expiry and state checks, use the same try/catch as the authenticated route. Keep `legacy-v0` on `buildStorageKey`.

- [ ] **Step 4: Run tests and verify GREEN**

Same command as Step 2. Expected: PASS including existing `storage_key_mismatch` test.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/public.ts apps/api/src/routes/__tests__/public.test.ts
git commit -m "feat(api): dispatch versioned finalize pinning on public token route"
```

---

### Task 5: Live S3 Probe

**Files:**
- Create: `apps/api/src/lib/__tests__/finalize-pinning.live.test.ts`

**Interfaces:**
- Consumes: real `headVersion` / `getVersionedUploadSignedUrl`; in-memory grant/receipt/recording deps from Task 2; disposable prefix on `hearloop-audio-prod`.

- [ ] **Step 1: Write the live test skipped unless `RUN_LIVE_S3_STORAGE_CONTRACT=1`**

Follow `storage.live.test.ts`: PUT under `phase1-finalize-probe/${randomUUID()}/audio.webm`, build in-memory grant matching PUT checksum/size/`audio/webm`, call `createFinalizePinner` with real `headVersion` and fake persist/receipts, assert pin succeeds, then `removeEveryProbeVersion`. Also assert a wrong checksum on the grant yields 422 and still cleans the prefix. Timeout 60s. No deletes outside the prefix.

- [ ] **Step 2: Run skipped by default**

```bash
../../node_modules/.bin/jest --runInBand src/lib/__tests__/finalize-pinning.live.test.ts
```

Expected: skipped (0 tests run or suite skipped), not failed.

- [ ] **Step 3: Run live probe**

```bash
RUN_LIVE_S3_STORAGE_CONTRACT=1 ../../node_modules/.bin/jest --runInBand src/lib/__tests__/finalize-pinning.live.test.ts
```

Expected: PASS. If credentials/bucket missing, stop and page the user — do not retarget another bucket.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/__tests__/finalize-pinning.live.test.ts
git commit -m "test(api): live S3 probe for finalize VersionId HEAD pinning"
```

---

### Task 6: Docs, Typed Build, Scoped Verification

**Files:**
- Modify: `context/BACKLOG.md`
- Modify: `context/METRICS.md`

- [ ] **Step 1: Update BACKLOG**

Mark P1 item 1 (finalize pinning) done in this branch. Leave items 2–4 (workers, delete/cleanup, telemetry/rollout) unfinished. Do not claim production `versioned-v1` traffic.

- [ ] **Step 2: Add METRICS entry dated 2026-08-15**

Record: mocked public+authenticated pin/replay/conflict/integrity tests; live probe result; `legacy-v0` finalize still green; production Sessions still default `legacy-v0` (not measured as flipped). How measured: the jest commands in this plan.

- [ ] **Step 3: Fresh scoped verification**

From `apps/api`:

```bash
../../node_modules/.bin/jest --runInBand \
  src/lib/__tests__/finalize-pinning.test.ts \
  src/lib/__tests__/finalize-pinning.live.test.ts \
  src/lib/__tests__/upload-grants.test.ts \
  src/lib/__tests__/storage.test.ts \
  src/routes/__tests__/sessions.test.ts \
  src/routes/__tests__/public.test.ts
../../node_modules/.bin/tsc --noEmit
```

Expected: all listed suites green (live skipped unless env set). Do not run full API/web/React suites. Do not “fix” `env.test.ts` or React `apiKey` wording.

- [ ] **Step 4: Commit docs**

```bash
git add context/BACKLOG.md context/METRICS.md
git commit -m "docs: record finalize-time version pinning slice metrics"
```

---

## Spec coverage

| Spec section | Task |
| --- | --- |
| Versioned contract / hash / errors | 1, 2 |
| Shared module + HEAD integrity | 2 |
| Receipts idempotency | 2 |
| Recording insert-if-missing + grant pin | 2 |
| Protocol dispatch both routes | 3, 4 |
| `legacy-v0` unchanged | 3, 4, 6 |
| Mocked tests | 1–4, 6 |
| Live S3 probe | 5 |
| BACKLOG / METRICS | 6 |
| No workers/clients/migrations/deploy | Global constraints |

## Production implications (not this session)

- **Rollout:** later, after workers read VersionId and capture clients exist.
- **Rollback:** `legacy-v0` path remains; no schema rollback in this task.
- **Observability:** no new alerts this slice.
- **Release/Operate:** `not_applicable` — implemented only; no deploy; no versioned-v1 production traffic.
