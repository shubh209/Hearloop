# 1. Executive Summary

Hearloop should make one small reliability improvement before attempting a broader platform: ensure that every accepted hosted QR recording is tied permanently to the exact object version that the pipeline processes.

The single Phase 1 production slice is:

> existing attributed QR link → existing hosted capture → a unique, integrity-checked, version-pinned S3 upload → exact-version reads by the existing validation/transcription pipeline → existing analysis, dashboard, webhook, and deletion routes.

Phase 1 changes only the media-evidence boundary. It adds unique upload grants, captures the S3 VersionId returned by upload, atomically pins one authoritative version at finalize, makes workers read that version, deletes that version on existing delete/expiry paths, sweeps unpinned versions, and ships the migration, tests, telemetry, rollout, and rollback. It does **not** redesign webhook delivery, webhook secrets, event schemas, queues, worker claims, general deletion, retention, authentication, the dashboard, or the SDK.

The falsifiable thesis is: **under retries and concurrency, one Session resolves to exactly one authoritative `{bucket,key,versionId,sha256}`; every accepted transcript is derived from those bytes; overwriting the same key cannot change the selected evidence; and legacy Sessions continue to process.** The slice is estimated at **90 focused developer hours plus 30 hours contingency, total 120 hours**. Contingency is 25% of the total and 33% of known work, leaving 80 hours below the cap.

The long-term feedback-event gateway, durable activation, deletion fencing, provider portability, RAG, and MCP remain a target architecture split into later independent gates. This sequencing prevents reliability work from becoming a platform rewrite.

# 2. Current Hearloop Baseline

| Baseline | Repository evidence | Phase 1 treatment |
| --- | --- | --- |
| QR/hosted capture is primary | `context/CAPTURE_SURFACES.md`; `POST /public/capture/:linkToken/session`; `/c/[link]` | Unchanged |
| Target attribution is shipped | migration `007_capture_links.sql`, `metadata_json.target`, dashboard By-Target | Unchanged |
| Hosted public lifecycle exists | `apps/api/src/routes/public.ts` | Change only upload URL and finalize media fields |
| Partner API lifecycle exists | `apps/api/src/routes/sessions.ts` | Same media changes to authenticated upload/finalize |
| Pipeline exists | validate → transcribe → analyze → webhook | Validate/transcribe fetch exact version; later stages unchanged |
| Dashboard is real-data-backed | `partner-dashboard.ts` | Unchanged |
| Signed webhook retries/dead rows exist | `deliver-webhook.ts`, `webhook_deliveries` | Unchanged; known limitations are later work |
| Delete/expiry remove audio | `DELETE /sessions/:id`, `expire-session.ts` | Pass exact VersionId; other semantics unchanged |

The precise defect is in `lib/storage.ts`: `buildStorageKey(sessionId,mimeType)` gives upload retries a stable key, while a presigned PUT can be reused until expiry and a PUT to an existing key replaces the current object. The recordings table persists a key but not an object VersionId. A later PUT can therefore change what `getAudioBuffer(storageKey)` returns after finalize. AWS documents both behaviors. [Presigned URL documentation](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) and [S3 versioning workflow](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html).

Finalize also performs read, recording upsert, Session transition, and enqueue as separate operations. Two finalizers can race, and the current upsert allows the selected recording key to change. Phase 1 serializes only this selection. It need not solve every queue/deletion race to eliminate the media-identity defect.

The repository landscape research shows that “all feedback in one place, analyzed by AI” is not a differentiated claim. The InsightLab evaluation supports preserving Hearloop’s fast, in-the-moment voice capture rather than cloning an AI interview/research workspace. These findings favor a narrow trust improvement now.

# 3. Research Findings and Evidence

Claims are labeled **Evidence**, **Inference**, or **Hypothesis**.

1. **Evidence:** S3 Versioning assigns an opaque VersionId to each version. A GET or HEAD specifying `versionId` addresses that version; DELETE with that VersionId deletes precisely it. [AWS versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html), [GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html), and [version metadata](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RetMetaOfObjVersion.html). **Inference:** `{bucket,key,versionId}` is a stable evidence identity even after later PUTs. This is logical immutability by identity, not WORM.
2. **Evidence:** SigV4 presigned uploads support SHA-256 checksum headers, and S3 validates a supplied checksum for a single-part upload. [AWS presigned uploads](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html) and [integrity checks](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html). **Inference:** the hosted recorder can hash a five-second clip without multipart machinery.
3. **Evidence:** S3 returns `x-amz-version-id` for versioned object responses; version-specific HEAD returns VersionId, ETag, length, and type. [VersionId response](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/postVersions.html) and [version metadata](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RetMetaOfObjVersion.html). **Inference:** bucket CORS can expose VersionId and ETag to the browser, which supplies them to finalize; the server still HEAD-verifies them.
4. **Evidence:** PostgreSQL unique constraints enforce uniqueness, while `SELECT ... FOR UPDATE` locks a row against conflicting writers through transaction end. [Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) and [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html). **Inference:** a Session lock plus `recordings.session_id UNIQUE` can select one authoritative version under different idempotency keys.
5. **Evidence:** BullMQ recommends atomic, idempotent retryable jobs. [BullMQ idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs). **Inference:** exact-version reads make media fetching deterministic under retry; broader job fencing remains later.
6. **Evidence:** Bedrock inference selects an explicit model/inference-profile ID and model-specific parameters. [Bedrock inference](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-api.html). **Inference:** later provenance should record model/prompt/taxonomy identifiers. Phase 1 does not change AI.
7. **Evidence:** Bedrock Knowledge Bases can return generated spans and retrieved references. [RetrieveAndGenerate](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-retrieve-generate.html). **Inference:** later RAG can be cited, after reliable evidence identity and tenant filtering exist.
8. **Evidence:** MCP uses host/client/server architecture and exposes resources/tools. [MCP architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture) and [tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools). **Inference:** MCP fits later authenticated query/actions, not anonymous QR upload.
9. **Evidence:** OpenTelemetry treats traces, metrics, and logs as complementary signals. [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/). **Inference:** correlate grant, finalize, and fetch without logging media or capabilities.

**Unproven hypothesis:** engineers value explicit evidence identity enough to prefer Hearloop’s pipeline over direct upload plus webhook. Phase 1 validates technical trustworthiness, not demand.

# 4. Product Boundary and User Roles

**Product proposition:** Hearloop turns a short, attributed QR voice recording into structured feedback while preserving the exact source-media identity used for processing.

| Role | Phase 1 workflow | Hearloop interface | Boundary |
| --- | --- | --- | --- |
| Feedback giver | Scan, consent, record, upload, submit | Existing QR bridge and hosted recorder | No account, survey builder, chatbot, or adaptive follow-up |
| Integrating/maintaining engineer | Observe a result and identify its source bytes | Existing Partner API/webhook plus media-identity docs/telemetry | No new control UI, secret lifecycle, connector, or replay API |
| Business user | View transcript, sentiment, topics, urgency, Target | Existing dashboard | No new analytics, help desk, workflow, or knowledge UI |

Voice remains required. Text/rating are later modes. The webhook remains a delivery convenience, not a newly proven exactly-once activation system. The delete route remains a privacy operation, but linearizing deletion against every provider/save/delivery is a later subtask.

# 5. Platform Approaches Compared

| Approach | Boundary | AI/dashboard/integration | Advantage | Risk / fit |
| --- | --- | --- | --- | --- |
| **A. Media-evidence pinning** | Existing QR path; change upload identity, selection, reads, exact deletion | Existing AI, dashboard, webhook | Small reliability invariant; maximum reuse | Does not solve all pipeline reliability. **Recommended now.** |
| **B. Trustworthy activation** | Transactional completion event, tenant keys, durable delivery/replay/deletion fences | Same analysis; engineer delivery surface | Makes outbound events trustworthy | Requires outbox, secrets, claims, deletion lifecycle; separate phase |
| **C. General gateway/knowledge layer** | Multi-source contract, provider ports, RAG/MCP | AI enrichment and cited investigation | Tests platform thesis | Several products at once; infeasible now |

Approach A is independently deployable and creates the evidence reference that B and C need.

# 6. Recommended Direction

Enable S3 Versioning and verify `Enabled` before new-style grants. Give each upload attempt a server-created key such as `recordings/{partnerId}/{sessionId}/{uploadId}.webm`. The browser computes Base64 SHA-256, requests a grant signing exact `Content-Type` and `x-amz-checksum-sha256`, performs one PUT, reads `x-amz-version-id` and ETag from exposed CORS headers, and finalizes with `{uploadId,versionId,etag}`.

Finalize HEADs the exact version, checks the grant, then starts one transaction. It locks the Session, compares/stores narrow finalize idempotency data, inserts the unique recording, marks the grant pinned, and transitions to submitted. After commit it enqueues existing validation. A narrow reconciler for submitted Sessions missing their deterministic validate job closes only this new commit/enqueue seam; it is not a generalized outbox.

Media consumers receive `recordingId`, load `{key,versionId}`, and GET that version. Existing delete/expiry passes VersionId to DELETE. A sweeper deletes expired unpinned versions. Dashboard, analysis schema, webhook payload/signature/delivery, general lifecycle, auth, and Partner settings do not change.

No conditional-write bucket policy, `CopyObject`, or copy/seal step is proposed.

# 7. Target Architecture

Long term, five modules remain:

1. **Capture/ingestion:** hosted QR/widget first; later typed text/rating/API adapters with source, subject, actor/account, context, consent, evidence.
2. **Evidence store:** tenant-scoped media/text, stable evidence references, retention/deletion policy, audit, and a `BlobStore` port.
3. **Enrichment:** transcriber/classifier adapters and append-only runs identifying exact evidence, provider, model, prompt, taxonomy, parameters, confidence, eval version.
4. **Activation:** versioned events, transactional outbox, endpoint-scoped signing, retry/dead/replay, later outcomes.
5. **Query/control:** current dashboard; later engineer log, tenant-filtered retrieval, MCP adapter.

PostgreSQL should ultimately own correctness and BullMQ be replaceable coordination. “Interchangeable” means conformance tests and persisted provider identity, not multiple providers now. Self-hostability means clean ports/migrations, not a self-hosted v1.

## Phase 1 physical additions only

- `upload_grants`: IDs for Partner/Session/upload attempt/idempotency key, canonical request hash, exact response JSON, bucket/key, expected MIME/size/checksum, expiry, pinned recording, timestamps; unique `(session_id,upload_attempt_id)` and `(session_id,idempotency_key)`.
- `recordings`: nullable `bucket`, `object_version_id`, `etag`, `checksum_sha256`, `upload_grant_id`, `pinned_at`; retain unique Session; unique `(bucket,storage_key,object_version_id)` where VersionId is non-null.
- `sessions`: nullable, narrowly scoped `finalize_idempotency_key`, `finalize_request_hash`, `finalize_response_json`.
- Storage methods accept optional VersionId for GET/HEAD/DELETE. Legacy null-VersionId rows retain key-only reads until drained.

There is no Phase 1 generic mutation table, processing claim, outbox, canonical event table, webhook endpoint table, deletion state machine, vector store, or technical UI.

# 8. Canonical Feedback Event and Lifecycle

## Target event, not a Phase 1 delivery change

A future `FeedbackEventV1` separates source, subject, actor/account, context, consent, evidence, and derived provenance:

```json
{
  "specVersion":"1.0",
  "id":"c4a2a2ba-4d84-4b5d-98f5-07b7b3e62e4d",
  "type":"hearloop.feedback.completed.v1",
  "partnerId":"b61cd68d-730c-4afe-a7f4-0b6f922ec33f",
  "feedbackId":"9eaa63fc-9904-4ddd-b3ce-b24e9603bcad",
  "source":{"kind":"hosted_qr","captureLinkId":"120ea135-2f87-4ab2-a19f-30031d71dbee"},
  "subject":{"kind":"service","key":"north-ave-oil-change"},
  "consent":{"recording":true,"capturedAt":"2026-08-14T18:29:42.000Z"},
  "content":{"media":{"assetId":"rec_9eaa63fc","versionId":"opaque-s3-version","sha256":"base64-sha256"},"transcript":"The wait was longer than expected."},
  "analysis":{"sentiment":"negative","topics":["wait_time"],"provenance":{"sttModel":"whisper-large-v3-turbo","classifierProvider":"aws-bedrock","promptVersion":"classify-v1","inputAssetId":"rec_9eaa63fc"}}
}
```

This is not Phase 1’s webhook and does not claim CloudEvents conformance. A later activation phase must migrate the current `session.completed` payload deliberately. [CloudEvents](https://cloudevents.io/) supports the value of consistent descriptions but does not mandate adoption.

## Phase 1 lifecycle delta

The lifecycle remains `created → opened → recording/uploaded → submitted → processing → completed | failed | expired`. Only evidence selection changes: grant → one or more PUT versions → exact HEAD → one atomic authoritative pin → exact GET by validate/transcribe → unchanged analyze/dashboard/webhook → exact DELETE by existing delete/expiry; sweeper removes unpinned versions.

This slice does not claim deletion is linearized against every in-flight stage or webhook. It only ensures deletion names the authoritative version rather than “latest.” Tombstones, provider-result fences, delivery leases, and deletion status are later.

# 9. AI, Provider, RAG, and MCP Design

Phase 1 does not change prompts, models, follow-up, outputs, providers, or webhook analysis. It guarantees only that transcription reads the authoritative VersionId.

Target ports are `Transcriber.transcribe(evidenceRef,config)`, `Classifier.classify(transcriptRef,context,config)`, `Embedder.embed`, and `Retriever.search(partnerId,...)`. Future append-only runs record inputs/hashes, provider/model, parameters, prompt/taxonomy/schema, timing, tokens, confidence, error.

Adaptive follow-up is later, capped at two non-leading questions with Skip/Stop and no submission dependency. RAG is later with pre-generation tenant filters, source links, abstention threshold, retrieval/citation/isolation/deletion evals. MCP is later authenticated query/action, not ingestion; Partner identity is derived server-side and mutations separately authorized.

# 10. Dashboard and Integration Design

The dashboard remains unchanged: Partner-scoped metrics, Sessions, Targets, transcripts, topics, sentiment, urgency, and latency. Additive recording columns do not affect its joins.

Integration behavior also remains: current `webhook_url`, `session.completed` body, global `WEBHOOK_SIGNING_SECRET`, headers, seven attempts, delivery table, and dead status. Phase 1 provisions no secret, event, outbox, replay route, or technical UI. Urgent email is not used as Phase 1 proof.

This is compatibility, not target endorsement. Endpoint-scoped secrets, exact-body guidance, durable outbox, claims/replay, and event versioning are a separate activation subtask. [GitHub webhook validation](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries) and [Stripe signature guidance](https://docs.stripe.com/webhooks/signature) guide that later work.

# 11. Reliability, Privacy, Security, Observability, and Evals

Only changed operations receive new contracts. Existing capture-link mint, resolve/open, Partner status/result/dashboard, analysis, and webhook retain current behavior.

## Upload grant: `POST /v1/public/session/{sessionToken}/upload-url`

- **Caller/auth:** hosted capture; opaque Session capability.
- **Headers/request:** `Idempotency-Key` (8–128 visible ASCII); `{uploadAttemptId:UUID,mimeType,sizeBytes,checksumSha256}`; current MIME set; 1,000–10,485,760 bytes; Base64 SHA-256; JSON ≤1 KiB.
- **Success:** `201 {uploadId,uploadUrl,storageKey,expiresAt,requiredHeaders}`; replay returns stored status/body plus `Idempotent-Replayed:true`.
- **Errors:** 400 invalid request/MIME/size/checksum; 404 Session; 410 expired; 409 state; 422 key reuse; 429; 503 storage.
- **Concurrency:** protected resource is `(sessionId,uploadAttemptId)`, not the idempotency key. Unique attempt and key constraints select one grant. Same resource/payload with another key returns it; different expected media gets 409; same key/different hash gets 422. Different upload attempts may create physical grants because finalize selects authority.
- **Responsibilities:** recorder persists attempt ID, hashes bytes, uses required headers; server derives tenant/session and unique key; S3 assigns VersionId.
- **Compatibility:** legacy Sessions accept `{mimeType}`. New Sessions receive additive `uploadProtocol:"versioned-v1"` from resolve and require new fields.

Authenticated `POST /v1/sessions/{id}/upload-url` has identical media/concurrency semantics under existing Partner secret-key auth and tenant check.

## Presigned S3 PUT

- Browser sends single-part bytes with exact signed content type/checksum. S3 `200` returns ETag/VersionId exposed by CORS; 400 BadDigest, 403, and 5xx retain S3 meaning.
- Retry after unknown outcome may create another version. Each VersionId is a valid physical result; none is authoritative until finalize. There is no Hearloop receipt around S3. The sweeper owns every unpinned version.

## Finalize: `POST /v1/public/session/{sessionToken}/finalize`

- **Caller/auth:** hosted capture; Session capability.
- **Headers/request:** `Idempotency-Key`; `{uploadId,versionId,etag,consentGiven,languageHint?,promptText?}`. VersionId 1–1024 UTF-8 bytes; ETag ≤128; language ≤16; prompt ≤500. Server trusts grant/HEAD, not client key/MIME/size/checksum.
- **Success:** `202 {sessionId,status:"submitted",recordingId}`; equivalent replay returns stored response.
- **Errors:** 400; 403 consent; 404 Session/grant; 410 expired; 409 state/already pinned/wrong grant version; 422 key reuse; 429; 503 verification.
- **Verification/serialization:** HEAD exact version with checksum mode; require VersionId, ETag, type, length, checksum match. Transaction locks Session. If unpinned, store narrow key/hash/response, insert unique recording, mark grant pinned, set submitted. If same version already won, any equivalent key replays. If another version won, return durable 409 with recording ID only. Same key/different hash is 422.
- **Retry/queue:** enqueue deterministic `validate-{sessionId}` after commit. On enqueue failure the committed 202 remains; a narrow reconciler enqueues missing validation without changing the pin.
- **Compatibility:** legacy Sessions retain old body and null VersionId; new Sessions reject client `storageKey`. Public/authenticated finalize share one helper.

## Internal exact-version operations

`headVersion/getVersion/deleteVersion({bucket,key,versionId})` use server credentials. Jobs carry recording ID, load the row, and GET exact version; legacy rows use old key-only GET. Existing DELETE/expiry statuses remain, but storage calls exact DELETE for new rows. No tombstone, cancellation, deletion status, or webhook cancellation is added. The sweeper handles only expired grant keys, deletes explicit unreferenced VersionIds, and never deletes by prefix.

## Resource controls and concurrency

| Mutation | Protected resource | Constraint/lock | Winner/losers | Owner |
| --- | --- | --- | --- | --- |
| Grant | Session + uploadAttemptId | two grant uniques | first grant; equivalent replay; 409 different media; 422 key mismatch | browser/sweeper |
| S3 PUT | each VersionId | S3 Versioning | every success is physical; no authority | browser/sweeper |
| Finalize | Session authoritative recording | Session lock + unique recording | first pin; equivalent replay; 409 other version; 422 key mismatch | caller/reconciler |
| Delete | explicit stored or expired-grant VersionId | VersionId + DB reference recheck | repeated delete converges absent; pinned skipped by sweep | delete/expiry/sweeper |

| Case | Grant | Finalize | Storage |
| --- | --- | --- | --- |
| same key/same payload | 20 calls, one stored grant | 20 calls, one stored 202 | repeated GET same checksum; DELETE converges absent |
| same key/different payload | one hash; others 422 | one hash; others 422 | mismatch rejected before pin |
| different keys/same resource | one equivalent grant or 409 | one pin; equivalents replay; other version 409 | two deleters leave same VersionId absent |
| different resources | independent grants | 20 Sessions pin once without global lock | one VersionId operation never changes another |

Security retains tenant checks, opaque tokens, MIME/size validation, SSRF checks, consent. Never log capabilities, signed URLs, media, transcript, checksum, object key, or VersionId. Storage IAM is prefix-limited. CORS exposes only ETag/VersionId to the app origin.

Metrics: versioning health; grant failures/expiry; PUT-to-finalize age; finalize replay/conflict; missing VersionId; checksum mismatch; orphan cleanup; legacy count; reconcile count; success by protocol. Alert on versioning not Enabled, any checksum mismatch, expired orphan >30 minutes, rising legacy count, or submitted versioned Session missing validation >5 minutes.

Tests: schema/contracts; request-hash properties; real PostgreSQL four-case races; real S3 repeated PUT/HEAD/GET/DELETE; browser CORS; crash after commit/before enqueue; cleanup safety; mixed legacy/new; tenant isolation; migration rollback; existing pipeline/dashboard/webhook regression.

# 12. Phased Roadmap

| Phase | Deliverable | Entry | Exit | Exclusions |
| --- | --- | --- | --- | --- |
| **0** | storage capability spike | current suite green | distinct VersionIds; browser headers; exact operations proven | no migration |
| **1** | media-evidence pinning | Phase 0/rollback approved | Section 13 gates within 120 hours | no webhook/deletion/AI/UI redesign |
| **2A** | pipeline lifecycle fencing | deletion race prioritized | no post-tombstone save or post-complete delivery | no event redesign |
| **2B** | trustworthy activation | receiver reliability demand | outbox, endpoint key, signature/replay tests | no connectors |
| **2C** | analysis provenance/evals | model changes require trust | reproducible append-only selection | no RAG |
| **3** | general ingestion API | two real flows need second source | QR voice/API text fit stable contract | no external connector |
| **4** | retention policies | two Partners need distinct policies | lifecycle/restore tests | no certification |
| **5** | evidence RAG | sufficient corpus/demand | retrieval/citation/abstention/isolation | no autonomy |
| **6** | MCP adapter | query API used | auth/tenant/action red-team | no ingestion |
| **7** | bounded follow-up | baseline and depth demand | detail uplift without completion harm | no interviewer |
| **8** | self-host proof | deployment-control demand | independent install/upgrade/restore | no supported self-host v1 |

# 13. First Thin Slice

Included: prove S3 capability; additive grant/recording/finalize schema; new hosted/auth upload/finalize for new Sessions with legacy fallback; one exact verified pin; exact worker reads; exact existing delete/expiry; unpinned cleanup; concurrency/S3/regression/security tests; telemetry/docs/canary/rollback.

Excluded: canonical event, webhook changes, tenant secret, outbox, replay, generic idempotency, generalized job claim, deletion tombstone/fencing/status, retention UI, urgent email work, new provider, AI provenance migration, RAG, MCP, SDK/widget redesign, external ingestion, dashboard work, auth/SSO, billing, self-host packaging.

| Work | Hours |
| --- | ---: |
| Storage spike/config/health/CORS | 10 |
| Schema/migration/dual access | 12 |
| Unique grants and two route surfaces | 16 |
| Atomic finalize/verification/reconcile | 18 |
| Exact reads/delete/expiry/orphan sweep | 14 |
| Concurrency/S3/regression/security/synthetic tests | 14 |
| Telemetry/docs/canary/rollback | 6 |
| **Known** | **90** |
| **Contingency** | **30** |
| **Total** | **120** |

Contingency is 25% of total. Human observation is separate: three 45-minute engineer sessions plus scheduling/analysis, about six elapsed hours and up to two weeks.

Proof: repeated PUT versions but one exact read; all four-case races at 20-way parallelism; 100 synthetic Sessions match manifest hash and reach unchanged dashboard/webhook; crash recovery preserves pin; exact deletion/cleanup never touches another version; 20 legacy fixtures work; 20 canary submissions include retries; rollback disables new grants while version-aware readers remain.

# 14. Validation Using a Synthetic Realistic Dataset

Generate 100 short clips for two fictional automotive Partners, four locations, eight services, and three languages. Include praise, neutral facts, wait complaints, safety-sensitive comments, negation, mixed sentiment, silence, malformed headers, noise, retries, and consent denial. Use licensed/local TTS or consented project recordings. Pre-author a manifest with Partner, Target, MIME, length, SHA-256, expected accept/reject, transcript terms, labels, attempt pattern, and fault.

| Evaluation | Gate |
| --- | --- |
| Evidence identity | 100% accepted pins match manifest SHA-256; zero latest-version reads |
| Concurrency | all four cases at 20-way; zero duplicate authoritative rows; every caller defined |
| Retry overwrite | three versions for 20 grants; transcript always chosen version, not newest |
| Cleanup | every expired orphan removed; every pinned/unrelated version retained |
| Legacy | 20 null-VersionId fixtures finish and delete |
| Regression | existing AI aggregates reported; dashboard/webhook snapshots unchanged |
| Isolation | cross-Partner access preserves 404/403; no storage detail leaks |
| Human | three engineers explain key/version/retry pinning and identify authority in median <30 minutes |

Run deterministic/concurrency tests per pull request, provider tests pre-release, and browser/CORS/canary/rollback in staging. Publish fixture/config/revision/results/limitations. These are project gates, not market benchmarks.

# 15. Risks and Non-Goals

| Risk | Consequence | Mitigation |
| --- | --- | --- |
| store lacks semantics | no pin | Phase 0; use AWS S3 if current provider fails |
| CORS hides headers | cannot finalize | browser test/health gate |
| PUT response lost | VersionId unknown | retry; pin retry version; sweep others |
| competing finalize | wrong evidence | Session lock/unique recording/409 |
| commit/enqueue gap | stall | narrow reconciler |
| sweep deletes pin | loss | explicit VersionId + immediate DB reference recheck |
| legacy/new mix | regression | per-Session protocol, dual reader, legacy metric |
| current delete races worker | possible post-delete save | inherited limitation disclosed; Phase 2A |
| current global webhook secret/enqueue gap | activation gap | inherited limitation disclosed; Phase 2B |
| scope regrowth | time waste | exclusions and independent gates |

Non-goals include the complete Phase 1 exclusions plus survey building, AI interviewing, connector marketplace, probabilistic identity, cases, reputation tools, compliance certification, or commercial outcome claims.

# 16. Decision Register

## Fixed

| Decision | Choice | Proof |
| --- | --- | --- |
| Slice | media pinning only | 120-hour plan |
| Authority | VersionId + checksum selected once in PostgreSQL | repeated-PUT/race tests |
| Keys | unique grant key; retry versions allowed | S3 tests/sweep |
| Finalize | Session lock + unique recording + narrow response | matrix |
| Worker | recording ID resolves version; legacy fallback | mixed tests |
| Delete | explicit version, no new lifecycle | isolation tests |
| Downstream | current AI/dashboard/webhook | snapshots |

## Owner decisions

| Decision | Options | Recommendation | Evidence |
| --- | --- | --- | --- |
| object store | documented AWS S3 vs current S3-compatible deployment | AWS S3 unless current provider passes | actual versioning/CORS/checksum/exact operations |
| grant multiplicity | one active vs multiple recovery attempts | multiple unique attempts, one pin, 30-minute expiry | browser failures/orphan count |
| legacy drain | short simplicity vs long safety | no unexpired legacy Session + seven days; keep read fallback | production counts |
| next phase | deletion fencing vs activation | 2A first due lifecycle obligation | race reproduction/privacy review |
| activation breadth | minimal outbox/key vs UI/connectors | minimal only | receiver interviews/failure evidence |
| event contract | migrate current vs canonical | wait for second source | two real flow diagrams |
| RAG store | managed vs PostgreSQL/vector | defer | corpus/query/isolation/deletion eval |
| MCP actions | read-only vs replay | read-only first | threat/compatibility/demand |

# 17. Sources

Repository: `AGENTS.md`; `CONTEXT.md`; capture/Target designs; landscape and InsightLab research; public/session/Partner/dashboard routes; storage/queue/schema; validate/transcribe/analyze/webhook/expiry jobs; migrations 001, 003, 007, 010.

Primary sources:

- S3: [presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), [versioning](https://docs.aws.amazon.com/AmazonS3/latest/userguide/versioning-workflows.html), [VersionId response](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/postVersions.html), [GetObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_GetObject.html), [version metadata](https://docs.aws.amazon.com/AmazonS3/latest/userguide/RetMetaOfObjVersion.html), [integrity](https://docs.aws.amazon.com/AmazonS3/latest/userguide/checking-object-integrity-upload.html), [PutObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_PutObject.html)
- PostgreSQL: [constraints](https://www.postgresql.org/docs/current/ddl-constraints.html), [locking](https://www.postgresql.org/docs/current/explicit-locking.html), [INSERT](https://www.postgresql.org/docs/current/sql-insert.html)
- BullMQ: [idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs), [retries](https://docs.bullmq.io/guide/retrying-failing-jobs), [job IDs](https://docs.bullmq.io/guide/jobs/job-ids)
- Later-target references: [GitHub webhooks](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries), [Stripe signatures](https://docs.stripe.com/webhooks/signature), [OWASP SSRF](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html), [Bedrock inference](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-api.html), [Bedrock model parameters](https://docs.aws.amazon.com/bedrock/latest/userguide/model-parameters.html), [Bedrock RAG citations](https://docs.aws.amazon.com/bedrock/latest/userguide/kb-test-retrieve-generate.html), [CloudEvents](https://cloudevents.io/), [MCP architecture](https://modelcontextprotocol.io/docs/2026-07-28/learn/architecture), [MCP tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [OpenTelemetry signals](https://opentelemetry.io/docs/concepts/signals/)
