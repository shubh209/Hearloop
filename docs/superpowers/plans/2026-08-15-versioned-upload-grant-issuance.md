# Versioned Upload-Grant Issuance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add idempotent, version-aware upload-grant issuance to the public and authenticated upload-URL routes while preserving the complete legacy upload contract and leaving finalize unchanged.

**Architecture:** A focused `upload-grants.ts` module validates and hashes versioned requests, resolves idempotency/concurrency through migration 011's two uniqueness constraints, calls Task 3's checksum-bound presigner, and persists the exact replay response. Both route files continue to own Session lookup, authentication, expiry, and lifecycle checks; they dispatch by `sessions.upload_protocol` and delegate only `versioned-v1` issuance.

**Tech Stack:** Node.js 20, TypeScript, Fastify 5, Kysely, PostgreSQL, Jest, AWS SDK S3 presigning.

## Global Constraints

- Only Sessions whose `upload_protocol` is `versioned-v1` use the new contract.
- New Sessions and existing `legacy-v0` Sessions retain current behavior; do not change Session creation defaults.
- Do not apply migration 011 or make any database, AWS, deployment, client, finalize, worker, queue, metric, or alert change.
- Never accept Partner ID, Session ID, bucket, or storage key from the request body.
- Never expose or log signed URLs, storage identifiers, checksums, idempotency keys, Session tokens, VersionIds, or raw provider errors.
- Versioned request limits are: idempotency key 8–128 visible ASCII characters, UUID upload attempt, supported audio MIME type, 1,000–10,485,760 bytes, canonical Base64 SHA-256, and serialized JSON no larger than 1 KiB.
- Preserve the legacy `{mimeType}` request and `{uploadUrl,storageKey,expiresIn}` response exactly.

---

### Task 1: Request Validation and Canonical Hashing

**Files:**
- Create: `apps/api/src/lib/upload-grants.ts`
- Create: `apps/api/src/lib/__tests__/upload-grants.test.ts`

**Interfaces:**
- Consumes: Node `createHash`; Task 3's accepted audio MIME types through `buildVersionedStorageKey` validation.
- Produces: `parseUploadGrantRequest(idempotencyKey: unknown, body: unknown): ParsedUploadGrantRequest`, `hashUploadGrantRequest(request: VersionedUploadGrantRequest): string`, and `UploadGrantError` with public `statusCode` and `errorCode`.

```ts
export interface ParsedUploadGrantRequest {
  idempotencyKey: string;
  request: VersionedUploadGrantRequest;
}

export interface VersionedUploadGrantResponse {
  uploadId: string;
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: {
    "Content-Type": string;
    "x-amz-checksum-sha256": string;
  };
}
```

- [ ] **Step 1: Write failing validation and hash tests**

Add table-driven tests that call the wished-for API and assert:

```ts
const validBody = {
  uploadAttemptId: "22222222-2222-4222-8222-222222222222",
  mimeType: "audio/webm",
  sizeBytes: 4096,
  checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

expect(parseUploadGrantRequest("grant-key-0001", validBody)).toEqual({
  idempotencyKey: "grant-key-0001",
  request: validBody,
});
expect(hashUploadGrantRequest(validBody)).toMatch(/^[0-9a-f]{64}$/);
```

Cover idempotency keys that are missing, shorter than 8, longer than 128, contain spaces/control/non-ASCII characters; malformed UUID shapes; unsupported MIME types; fractional/out-of-range sizes; malformed/non-canonical/wrong-length checksums; non-object bodies; and JSON bodies whose serialized UTF-8 form exceeds 1,024 bytes. Assert every invalid case throws `UploadGrantError(400, "invalid_upload_grant_request")` without echoing the rejected value.

Add a property test using `fast-check` proving identical semantic fields produce the same hash and changing any of the four fields changes the hash. Add a fixed-order test proving insertion order and unrelated prototype state cannot affect the hash.

- [ ] **Step 2: Run the new test and verify RED**

Run:

```bash
npm test --workspace=apps/api -- --runInBand src/lib/__tests__/upload-grants.test.ts
```

Expected: FAIL because `../upload-grants` does not exist.

- [ ] **Step 3: Implement minimal validation, error, and hashing code**

Create these public types and behavior:

```ts
export interface VersionedUploadGrantRequest {
  uploadAttemptId: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export class UploadGrantError extends Error {
  constructor(
    readonly statusCode: 400 | 409 | 422 | 503,
    readonly errorCode:
      | "invalid_upload_grant_request"
      | "upload_attempt_conflict"
      | "idempotency_key_reused"
      | "storage_unavailable"
  ) {
    super(errorCode);
  }
}
```

Validate the body before destructuring it. Use `Buffer.byteLength(JSON.stringify(body), "utf8")` for the 1 KiB semantic JSON limit, `/^[\x21-\x7e]{8,128}$/` for the header, the repository UUID pattern, `Number.isSafeInteger`, and a decode/re-encode check for the checksum. Construct the canonical hash from a newly created fixed-order object:

```ts
return createHash("sha256")
  .update(JSON.stringify({
    uploadAttemptId: request.uploadAttemptId,
    mimeType: request.mimeType,
    sizeBytes: request.sizeBytes,
    checksumSha256: request.checksumSha256,
  }))
  .digest("hex");
```

Keep accepted MIME types aligned with Task 3: `audio/webm`, `audio/mp4`, `audio/mpeg`, `audio/ogg`, `audio/wav`, `audio/x-m4a`, and `audio/m4a`.

- [ ] **Step 4: Run Task 1 tests and verify GREEN**

Run the command from Step 2. Expected: all upload-grant validation and hashing tests pass with no warnings.

- [ ] **Step 5: Commit Task 1**

```bash
git add apps/api/src/lib/upload-grants.ts apps/api/src/lib/__tests__/upload-grants.test.ts
git commit -m "feat(api): validate versioned upload grants"
```

---

### Task 2: Idempotent Grant Issuance and Race Resolution

**Files:**
- Modify: `apps/api/src/lib/upload-grants.ts`
- Modify: `apps/api/src/lib/__tests__/upload-grants.test.ts`

**Interfaces:**
- Consumes: `db`, `buildVersionedStorageKey`, `getVersionedUploadSignedUrl`, migration 011's `upload_grants` columns and uniqueness constraints.
- Produces:

```ts
issueVersionedUploadGrant(input: {
  partnerId: string;
  sessionId: string;
  idempotencyKey: unknown;
  body: unknown;
}): Promise<{
  response: VersionedUploadGrantResponse;
  replayed: boolean;
}>
```

- [ ] **Step 1: Write failing issuance and conflict tests**

Inject narrow dependencies through an exported `createUploadGrantIssuer(deps)` factory, with the exported production function bound to Kysely/storage dependencies. The factory is public only to keep service tests independent from PostgreSQL and S3. Use in-memory Jest fakes to cover:

```ts
const first = await issuer.issue(validInput);
const replay = await issuer.issue(validInput);

expect(first.replayed).toBe(false);
expect(replay).toEqual({ response: first.response, replayed: true });
expect(signUpload).toHaveBeenCalledTimes(1);
expect(insertGrant).toHaveBeenCalledTimes(1);
```

Add separate failing tests for:

- Exact persisted columns: Partner, Session, attempt, idempotency key, request hash, exact `response_json`, bucket, key, expected media fields, and the same expiry returned by the presigner.
- Same attempt and payload under a different key replays the stored response without signing.
- Same key and a changed request throws 422 `idempotency_key_reused`.
- Same attempt and changed MIME, size, or checksum throws 409 `upload_attempt_conflict`.
- A simulated PostgreSQL `23505` insert race reloads and returns the winning equivalent row.
- A `23505` race reload with conflicting key content returns 422; conflicting attempt content returns 409.
- Non-unique database failures propagate for the route's existing 500 handling.
- Any storage error becomes 503 `storage_unavailable`; its message excludes the fake provider message, bucket, key, checksum, and URL.
- Corrupt stored `response_json` becomes a sanitized 503 rather than leaking parser details.

- [ ] **Step 2: Run issuance tests and verify RED**

Run:

```bash
npm test --workspace=apps/api -- --runInBand src/lib/__tests__/upload-grants.test.ts
```

Expected: FAIL because the issuer factory and `issueVersionedUploadGrant` do not exist.

- [ ] **Step 3: Implement lookup, signing, insert, and replay resolution**

Define a narrow row shape and dependency contract:

```ts
interface UploadGrantDependencies {
  findByIdempotencyKey(sessionId: string, key: string): Promise<UploadGrantRow | undefined>;
  findByAttemptId(sessionId: string, attemptId: string): Promise<UploadGrantRow | undefined>;
  insertGrant(row: NewUploadGrantRow): Promise<void>;
  signUpload(input: VersionedUploadSignedUrlInput): Promise<VersionedUploadSignedUrlResult>;
  createId(): string;
}
```

Resolve an existing key before an existing attempt. Compare the canonical request hash, not client objects. Parse only stored `response_json`, require the response's `uploadId`, `uploadUrl`, `storageKey`, `expiresAt`, and exact required headers to have the expected primitive shapes, and otherwise throw sanitized 503.

For a new grant:

1. Generate the grant UUID.
2. Build `recordings/{partnerId}/{sessionId}/{uploadAttemptId}.{ext}` through Task 3.
3. Presign for 900 seconds with the requested MIME and checksum.
4. Construct a response whose `uploadId` is the grant UUID and whose other fields come from the presigner.
5. Insert the exact response JSON and authoritative expected fields.
6. On PostgreSQL `23505`, reload by key first and attempt second, then apply the same replay/conflict decision table.

Implement the default dependencies with Kysely queries limited to `upload_grants`. Do not log or wrap non-storage/non-unique database failures.

- [ ] **Step 4: Run Task 2 tests and verify GREEN**

Run the command from Step 2. Expected: all Task 1 and Task 2 tests pass.

- [ ] **Step 5: Refactor while green**

Extract only these focused helpers if needed: `resolveExistingGrant`, `parseStoredResponse`, and `isPostgresUniqueViolation`. Re-run the Task 2 command after refactoring.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/api/src/lib/upload-grants.ts apps/api/src/lib/__tests__/upload-grants.test.ts
git commit -m "feat(api): issue idempotent upload grants"
```

---

### Task 3: Protocol-Gated Public and Authenticated Routes

**Files:**
- Modify: `apps/api/src/routes/sessions.ts`
- Modify: `apps/api/src/routes/public.ts`
- Modify: `apps/api/src/routes/__tests__/sessions.test.ts`
- Modify: `apps/api/src/routes/__tests__/public.test.ts`

**Interfaces:**
- Consumes: `issueVersionedUploadGrant`, `UploadGrantError`, and existing legacy `getUploadSignedUrl`.
- Produces: HTTP 201 issuance/replay behavior for `versioned-v1` Sessions at both existing upload-URL endpoints.

- [ ] **Step 1: Write failing authenticated-route tests**

Extend the DB and storage mocks only enough to exercise `/sessions/:id/upload-url`. Mock `issueVersionedUploadGrant` separately. Assert:

```ts
mockExecuteTakeFirst.mockResolvedValue({
  id: VALID_ID,
  partner_id: "partner-1",
  status: "opened",
  upload_protocol: "versioned-v1",
});
mockIssueVersionedUploadGrant.mockResolvedValue({
  response: versionedResponse,
  replayed: false,
});
```

The route must pass trusted `partner.id` and path Session ID, return 201 with the service response, omit `Idempotent-Replayed` for a new grant, set it to `true` on replay, and map `UploadGrantError` status/error code exactly. Verify a `legacy-v0` row still calls `getUploadSignedUrl` and returns the existing 200 body. Verify wrong Partner, missing Session, invalid UUID, and invalid lifecycle state retain current responses and never call the issuer.

- [ ] **Step 2: Run authenticated route tests and verify RED**

Run:

```bash
npm test --workspace=apps/api -- --runInBand src/routes/__tests__/sessions.test.ts
```

Expected: FAIL because the route does not select `upload_protocol` or call the issuer.

- [ ] **Step 3: Implement authenticated protocol dispatch**

Select `upload_protocol` with the existing Session fields. After current UUID, ownership, and status checks:

```ts
if (session.upload_protocol === "versioned-v1") {
  try {
    const result = await issueVersionedUploadGrant({
      partnerId: partner.id,
      sessionId: id,
      idempotencyKey: req.headers["idempotency-key"],
      body: req.body,
    });
    if (result.replayed) reply.header("Idempotent-Replayed", "true");
    return reply.code(201).send(result.response);
  } catch (error) {
    if (error instanceof UploadGrantError) {
      return reply.code(error.statusCode).send({ error: error.errorCode });
    }
    throw error;
  }
}
```

Leave the legacy signing branch byte-for-byte equivalent in behavior.

- [ ] **Step 4: Run authenticated route tests and verify GREEN**

Run the command from Step 2. Expected: all authenticated route tests pass.

- [ ] **Step 5: Write failing public-route tests**

Add the same protocol, issuance, replay-header, error mapping, and legacy assertions for `/public/session/:token/upload-url`. Also prove expired and invalid-state Sessions never call the issuer and that `partner_id` is selected and passed from the resolved Session rather than the body.

- [ ] **Step 6: Run public route tests and verify RED**

Run:

```bash
npm test --workspace=apps/api -- --runInBand src/routes/__tests__/public.test.ts
```

Expected: FAIL because the public route does not select Partner/protocol or call the issuer.

- [ ] **Step 7: Implement public protocol dispatch**

Select `partner_id` and `upload_protocol` alongside existing Session fields. Preserve the existing not-found, expiry, and state ordering. For `versioned-v1`, use the same error mapping and response/header logic as the authenticated route, passing `session.partner_id` and `session.id`. Keep `legacy-v0` on `getUploadSignedUrl`.

- [ ] **Step 8: Run both route suites and verify GREEN**

Run:

```bash
npm test --workspace=apps/api -- --runInBand src/routes/__tests__/sessions.test.ts src/routes/__tests__/public.test.ts
```

Expected: both route suites pass without warnings.

- [ ] **Step 9: Commit Task 3**

```bash
git add apps/api/src/routes/sessions.ts apps/api/src/routes/public.ts apps/api/src/routes/__tests__/sessions.test.ts apps/api/src/routes/__tests__/public.test.ts
git commit -m "feat(api): wire versioned upload-grant routes"
```

---

### Task 4: Scoped Regression and Static Verification

**Files:**
- Verify only; modify a production or test file only in response to a reproduced failure and repeat its red–green cycle.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: fresh evidence that Task 4 behavior, Task 3 storage primitives, existing route behavior, and API types agree.

- [ ] **Step 1: Run upload-grant and route suites together**

```bash
npm test --workspace=apps/api -- --runInBand src/lib/__tests__/upload-grants.test.ts src/routes/__tests__/sessions.test.ts src/routes/__tests__/public.test.ts
```

Expected: all tests pass, zero failures.

- [ ] **Step 2: Run the complete Task 3 storage unit suite**

```bash
npm test --workspace=apps/api -- --runInBand src/lib/__tests__/storage.test.ts
```

Expected: 20 tests pass. Do not run the live S3 test unless explicitly authorized with its live-test environment.

- [ ] **Step 3: Run scoped API regressions**

```bash
npm test --workspace=apps/api -- --runInBand src/lib/__tests__/storage.test.ts src/lib/__tests__/upload-grants.test.ts src/routes/__tests__/sessions.test.ts src/routes/__tests__/public.test.ts
```

Expected: all selected suites pass with zero failures.

- [ ] **Step 4: Build the API**

```bash
npm run build --workspace=apps/api
```

Expected: TypeScript exits 0 with no diagnostics.

- [ ] **Step 5: Verify scope and cleanliness**

```bash
git diff --check
git status --short
git log --oneline -6
```

Confirm that no finalize, client, worker, migration, deployment, AWS, or main-workspace file changed. Confirm the only Task 4 implementation files are the shared module/tests and two route/test pairs.

- [ ] **Step 6: Commit any verification-driven correction**

Only if Step 1–5 required a correction after a failing regression, stage the exact corrected files and commit:

```bash
git commit -m "fix(api): complete upload-grant regressions"
```

Otherwise make no empty commit.
