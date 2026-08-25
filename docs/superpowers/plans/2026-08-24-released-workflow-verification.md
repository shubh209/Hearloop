# Released Workflow Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hearloop's released legacy capture workflow reproducible, repair every reproduced Specification 1 blocker or important finding, and leave fresh verification evidence without releasing or activating later work.

**Architecture:** Keep the existing Fastify, Next.js, React SDK, PostgreSQL, BullMQ, S3, SES, and webhook paths. Concentrate consent parsing and token claiming behind small interfaces, preserve `legacy-v0`, and verify external behavior at route/job/package seams. CI uses an isolated PostgreSQL service for the destructive migration contract; production remains untouched.

**Tech Stack:** TypeScript, Fastify 5, Next.js 15, React 19, Jest 29, Kysely/PostgreSQL, BullMQ, AWS SDK, GitHub Actions, Bash.

**Spec:** `docs/superpowers/specs/2026-08-24-released-workflow-verification-design.md`

**Task contract:** GitHub Issue #7

## Global Constraints

- Implement Specification 1 only; do not start media-pinning completion or Insights-query completion.
- New Sessions remain `legacy-v0`; do not activate `versioned-v1`.
- Reproduce each suspected defect before changing production behavior.
- Every behavior change uses one red test, one minimal implementation, and fresh green evidence.
- Partner identity comes only from authenticated state or the resolved capability; request bodies cannot select a Partner.
- Browser code and browser-facing examples use Widget embed keys, never Partner secret keys.
- Required consent is enforced by the server before Recording persistence or Pipeline enqueue.
- Production deployment, production smoke tests, migrations, infrastructure mutation, merge, push, and pull-request creation are excluded.
- Preserve `.cursor/settings.json`, `apps/web/tsconfig.tsbuildinfo`, `career/Hearloop-Project.md`, and all other unrelated work.
- Each task is implemented by a fresh sub-agent and passes separate task-scoped Spec and quality review before the next task starts.
- Test expectations use independent literals; mocks replace only slow or external adapters and assertions target observable behavior.

## File Structure

| Path | Responsibility |
| --- | --- |
| `apps/api/src/lib/session-capture-config.ts` | Build and read authoritative prompt/consent/Target metadata |
| `apps/api/src/lib/session-create-token.ts` | Atomically claim one short-lived Session-create token |
| `apps/api/src/lib/health-snapshot-cache.ts` | Coalesce and cache detailed-health snapshots |
| `apps/api/src/routes/__tests__/released-workflow.e2e.test.ts` | Controlled legacy capture-to-completed-Insights contract |
| `apps/web/components/__tests__/Recorder.test.tsx` | Hosted capture behavior at its UI/network seam |
| `scripts/check-browser-secret-examples.sh` | Static security guard for browser secret-key examples |
| `.github/workflows/docker-image.yml` | Release-blocking validation before the existing deploy job |
| `docs/superpowers/receipts/2026-08-24-released-workflow-verification.md` | Fresh implementation receipt and explicitly unrun checks |

---

### Task 1: Restore the Known Build and Test Baseline

**Files:**
- Modify: `apps/api/src/lib/__tests__/env.test.ts`
- Modify: `packages/react/src/__tests__/api-client.test.ts`
- Modify: `packages/react/src/__tests__/use-hearloop.test.ts`

**Interfaces:**
- Consumes: `validateEnv()`, `getSessionCreateToken()`, and `runApiFlow()` as already implemented.
- Produces: green API and React SDK suites without changing production behavior.

- [ ] **Step 1: Re-run the five existing red tests**

Run:

```bash
npm test --workspace=apps/api -- src/lib/__tests__/env.test.ts
npm test --workspace=packages/react -- src/__tests__/api-client.test.ts src/__tests__/use-hearloop.test.ts
```

Expected: two API failures caused by missing `PARTNER_SESSION_SECRET` in `VALID_ENV`; three SDK failures expecting `apiKey` where runtime browser guidance says `embedKey`.

- [ ] **Step 2: Repair only the stale fixtures and expectations**

Add the literal fixture entry:

```ts
PARTNER_SESSION_SECRET: "test-partner-session-secret-at-least-32-characters",
```

Change only the three stale expected strings to:

```ts
"Failed to get session token. Check your embed key."
"No authentication provided. Pass sessionCreateToken or embedKey."
```

- [ ] **Step 3: Run focused and full package verification**

```bash
npm test --workspace=apps/api -- src/lib/__tests__/env.test.ts
npm test --workspace=packages/react -- src/__tests__/api-client.test.ts src/__tests__/use-hearloop.test.ts
npm test --workspace=apps/api
npm test --workspace=packages/react
npm run build --workspace=apps/api
npm run build --workspace=packages/react
```

Expected: all commands exit 0; the known five failures are closed without production-code changes.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/lib/__tests__/env.test.ts packages/react/src/__tests__/api-client.test.ts packages/react/src/__tests__/use-hearloop.test.ts
git commit -m "test: restore API and React baselines"
```

### Task 2: Make Secret-Key Rotation Atomic and Verifiable

**Files:**
- Modify: `apps/api/src/lib/create-api-key.ts`
- Modify: `apps/api/src/routes/partner-me.ts`
- Create: `apps/api/src/routes/__tests__/partner-me.secret-keys.test.ts`
- Create: `apps/api/src/routes/__tests__/partner-auth.test.ts`
- Modify: `apps/web/components/ApiSettingsPanel.tsx`

**Interfaces:**
- Consumes: authenticated `req.partner.id` and the `api_keys` table.
- Produces: verified signup/login/dashboard-session isolation plus `rotateApiKeyForPartner(partnerId, "secret")` returning `{ rawKey, keyPrefix, keyId }`; one active secret remains after rotation.

- [ ] **Step 1: Write red authentication and rotation tests**

Test through the registered `POST /partners/me/secret-keys` handler with Partner A authenticated. Seed one active A secret and one active B secret. Assert the response exposes a new `sk-live_` key once, A's old key has `revoked_at`, A has exactly one active secret, and B is unchanged.

In `partner-auth.test.ts`, exercise registration and login through Fastify injection with a stateful Partner/key adapter. Assert registration stores a bcrypt password hash, returns an `hlps.` dashboard session and `pk-live_` embed key, login returns a new valid dashboard session, a public Session token receives 401 from `/partners/me`, and Partner A's authenticated request cannot read Partner B data.

```ts
expect(activeKeys("partner-a", "secret")).toHaveLength(1);
expect(oldPartnerAKey.revoked_at).toBeInstanceOf(Date);
expect(activeKeys("partner-b", "secret")).toEqual([partnerBKey]);
expect(response.secretKey).toMatch(/^sk-live_[0-9a-f]{48}$/);
```

- [ ] **Step 2: Run the test and verify the current create-only behavior fails**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/partner-auth.test.ts src/routes/__tests__/partner-me.secret-keys.test.ts
```

Expected: FAIL because two Partner A secrets remain active.

- [ ] **Step 3: Implement one transactional rotation interface**

In `create-api-key.ts`, keep material generation private and add:

```ts
export async function rotateApiKeyForPartner(
  partnerId: string,
  type: ApiKeyType
): Promise<{ rawKey: string; keyPrefix: string; keyId: string }> {
  return db.transaction().execute(async (trx) => {
    await trx.updateTable("api_keys")
      .set({ revoked_at: new Date() })
      .where("partner_id", "=", partnerId)
      .where("type", "=", type)
      .where("revoked_at", "is", null)
      .execute();
    return insertApiKey(trx, partnerId, type);
  });
}
```

Route secret creation through this function. Change the dashboard button to `Rotate secret key` when `secretPrefix` exists and update local state to the returned `keyPrefix`.

- [ ] **Step 4: Verify route behavior and API build**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/partner-auth.test.ts src/routes/__tests__/partner-me.secret-keys.test.ts
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/create-api-key.ts apps/api/src/routes/partner-me.ts apps/api/src/routes/__tests__/partner-auth.test.ts apps/api/src/routes/__tests__/partner-me.secret-keys.test.ts apps/web/components/ApiSettingsPanel.tsx
git commit -m "fix: rotate Partner secret keys atomically"
```

### Task 3: Atomically Claim Session-Create Tokens and Prove Origin Boundaries

**Files:**
- Create: `apps/api/src/lib/session-create-token.ts`
- Create: `apps/api/src/lib/__tests__/session-create-token.test.ts`
- Modify: `apps/api/src/routes/public.ts`
- Modify: `apps/api/src/routes/__tests__/public.test.ts`

**Interfaces:**
- Consumes: an opaque token and current time.
- Produces: `createSessionCreateTokenClaimer(database)` and its production-bound `claimSessionCreateToken(token, now)`; each token can succeed once.

- [ ] **Step 1: Write red claim and origin tests**

Use a stateful database adapter through `createSessionCreateTokenClaimer(database)` in the module test. Race two claims with `Promise.all`; assert exactly one non-null result and one persisted `used_at`. In the route test, exercise a `pk-live_` key with allowed, missing, and disallowed Origin headers and assert status `200`, `403`, and `403` respectively. Also prove a scoped public Session token receives 401 from `/partners/me`.

```ts
const results = await Promise.all([
  claimSessionCreateToken(TOKEN, NOW),
  claimSessionCreateToken(TOKEN, NOW),
]);
expect(results.filter(Boolean)).toEqual([{ partnerId: "partner-a" }]);
```

- [ ] **Step 2: Verify the read-then-write claim fails the race seam**

```bash
npm test --workspace=apps/api -- src/lib/__tests__/session-create-token.test.ts src/routes/__tests__/public.test.ts
```

Expected: FAIL because the module does not exist and the route owns a non-atomic helper.

- [ ] **Step 3: Implement an atomic update-returning claim**

The query must update only an unused, unexpired row and return its trusted Partner id:

```ts
export function createSessionCreateTokenClaimer(database = db) {
  return async (token: string, now: Date) => database
    .updateTable("session_create_tokens")
    .set({ used_at: now })
    .where("token", "=", token)
    .where("used_at", "is", null)
    .where("expires_at", ">", now)
    .returning("partner_id")
    .executeTakeFirst()
    .then((claimed) => claimed ? { partnerId: claimed.partner_id } : null);
}

export const claimSessionCreateToken = createSessionCreateTokenClaimer();
```

Delete the route-local validator and call this interface. Do not accept Partner id from the body.

- [ ] **Step 4: Verify focused and route suites**

```bash
npm test --workspace=apps/api -- src/lib/__tests__/session-create-token.test.ts src/routes/__tests__/public.test.ts
npm run build --workspace=apps/api
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/session-create-token.ts apps/api/src/lib/__tests__/session-create-token.test.ts apps/api/src/routes/public.ts apps/api/src/routes/__tests__/public.test.ts
git commit -m "fix: claim Session-create tokens atomically"
```

### Task 4: Enforce Authoritative Consent Before Finalize

**Files:**
- Create: `apps/api/src/lib/session-capture-config.ts`
- Create: `apps/api/src/lib/__tests__/session-capture-config.test.ts`
- Modify: `apps/api/src/routes/sessions.ts`
- Modify: `apps/api/src/routes/public.ts`
- Modify: `apps/api/src/routes/__tests__/public.test.ts`
- Modify: `apps/api/src/routes/__tests__/sessions.test.ts`

**Interfaces:**
- Consumes: Session-creation input, optional existing metadata, optional Target, and persisted `metadata_json`.
- Produces: `buildSessionMetadata(...)`, `readSessionCaptureConfig(...)`, and `isFinalizeConsentValid(config, consentGiven)`.

- [ ] **Step 1: Write red metadata and finalize tests**

Cover all four creation sources: authenticated, Session-create token, Capture link, and no custom prompt. The stored JSON must retain caller metadata and the reserved capture fields. At public finalize, required plus missing/false returns `400 { error: "consent_required" }` and performs zero Recording writes, Session transitions, or enqueue calls; required plus true and non-required plus missing proceed.

```ts
expect(isFinalizeConsentValid({ consentRequired: true }, undefined)).toBe(false);
expect(isFinalizeConsentValid({ consentRequired: true }, false)).toBe(false);
expect(isFinalizeConsentValid({ consentRequired: true }, true)).toBe(true);
expect(isFinalizeConsentValid({ consentRequired: false }, undefined)).toBe(true);
```

- [ ] **Step 2: Run the red seams**

```bash
npm test --workspace=apps/api -- src/lib/__tests__/session-capture-config.test.ts src/routes/__tests__/public.test.ts src/routes/__tests__/sessions.test.ts
```

Expected: FAIL because authenticated metadata drops consent and finalize ignores persisted consent.

- [ ] **Step 3: Implement the deep metadata module and route it everywhere**

Use one reserved object without adding a migration:

```ts
type SessionCaptureConfig = {
  promptText?: string;
  consentRequired: boolean;
  consentText?: string;
  target?: { label: string; key: string; source: "capture-link" } | null;
};
```

`buildSessionMetadata` merges arbitrary metadata first and writes reserved capture fields last so caller metadata cannot override them. `readSessionCaptureConfig` treats missing JSON as consent not required but throws `InvalidSessionCaptureConfigError` for malformed JSON. Public Session config reads this function. Finalize selects `metadata_json`; malformed authority returns `500 { error: "invalid_session_config" }`, and missing/false required consent returns `400 { error: "consent_required" }`, always before Recording persistence or enqueue.

- [ ] **Step 4: Verify focused tests and API build**

```bash
npm test --workspace=apps/api -- src/lib/__tests__/session-capture-config.test.ts src/routes/__tests__/public.test.ts src/routes/__tests__/sessions.test.ts
npm run build --workspace=apps/api
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/session-capture-config.ts apps/api/src/lib/__tests__/session-capture-config.test.ts apps/api/src/routes/sessions.ts apps/api/src/routes/public.ts apps/api/src/routes/__tests__/public.test.ts apps/api/src/routes/__tests__/sessions.test.ts
git commit -m "fix: enforce Session consent before finalize"
```

### Task 5: Repair Hosted Capture and Remove Browser Secret-Key Guidance

**Files:**
- Create: `apps/web/jest.config.js`
- Create: `apps/web/babel.config.js`
- Create: `apps/web/components/__tests__/Recorder.test.tsx`
- Create: `apps/web/components/__tests__/auth-routes.test.ts`
- Create: `apps/web/public/__tests__/widget.test.js`
- Modify: `apps/web/package.json`
- Modify: `apps/web/components/Recorder.tsx`
- Modify: `apps/web/public/widget.js`
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/app/docs/page.tsx`
- Create: `scripts/check-browser-secret-examples.sh`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Consumes: public Session config `{ allowedOrigins: string[] }` and Widget embed key `pk-live_…`.
- Produces: Hosted capture that reaches open/upload/finalize and a browser widget that posts `{ embedKey }`.

- [ ] **Step 1: Add the web test seam and write red behavior tests**

Declare these web dev dependencies using the repository's existing compatible versions: `@babel/core ^7.29.0`, `@babel/preset-env ^7.29.5`, `@babel/preset-react ^7.27.1`, `@babel/preset-typescript ^7.28.5`, `@testing-library/jest-dom ^6.6.3`, `@testing-library/react ^16.3.0`, `@types/jest ^29.5.14`, `babel-jest ^29.7.0`, `jest ^29.7.0`, and `jest-environment-jsdom ^29.7.0`. Configure Jest with the four Babel presets and add `test: "jest --runInBand"` to web; run `npm install --package-lock-only` after editing the manifest.

Render Recorder, provide a fake MediaRecorder and Blob, and return `allowedOrigins: []`. Assert clicking Submit performs GET config, open, upload-url, PUT, and finalize in order. Add permission-denied, MediaRecorder-construction, cancel, and finalize-failure assertions; cancel stops every track and makes no network call, while failure preserves the preview for retry. Load `widget.js` in jsdom and assert it posts `{ embedKey }` and exposes the same microphone-denial behavior. Test that the login proxy writes an httpOnly `sameSite=lax` dashboard cookie and logout expires it.

```ts
expect(fetchPaths()).toEqual([
  `/public/session/${TOKEN}`,
  `/public/session/${TOKEN}/open`,
  `/public/session/${TOKEN}/upload-url`,
  "https://storage.test/upload",
  `/public/session/${TOKEN}/finalize`,
]);
```

- [ ] **Step 2: Run the web test and browser-secret scan red**

```bash
npm test --workspace=apps/web
bash scripts/check-browser-secret-examples.sh
```

Expected: Recorder test fails on `.split`; scan fails on browser-facing `sk-live_` and widget `apiKey` configuration.

- [ ] **Step 3: Implement the browser-safe contracts**

Recorder must consume `allowedOrigins` as an array and must not treat client-side origin comparison as authorization. The server already authorizes Widget embed-key minting; Hosted capture uses a scoped public token. Add a visible Cancel action for permission/recording/preview states that stops tracks, clears timers and Blob URLs, and returns to idle.

Change the static widget interface and request body:

```js
const DEFAULT_CONFIG = { embedKey: "", /* existing fields */ };
body: JSON.stringify({ embedKey: this.config.embedKey })
```

Update landing/docs examples to `embedKey: "pk-live_your_embed_key"`. The scan script searches browser-delivered paths for `sk-live_` and the static widget for `apiKey`, exiting non-zero on a match; server curl documentation is outside its narrow paths.

- [ ] **Step 4: Verify browser surfaces**

```bash
npm test --workspace=apps/web
bash scripts/check-browser-secret-examples.sh
npm run build --workspace=apps/web
npm run build --workspace=apps/quicklube-demo
npm test --workspace=packages/react
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/jest.config.js apps/web/babel.config.js apps/web/components/__tests__/Recorder.test.tsx apps/web/components/__tests__/auth-routes.test.ts apps/web/public/__tests__/widget.test.js apps/web/package.json apps/web/components/Recorder.tsx apps/web/public/widget.js apps/web/app/page.tsx apps/web/app/docs/page.tsx scripts/check-browser-secret-examples.sh package.json package-lock.json
git commit -m "fix: keep browser capture on embed credentials"
```

### Task 6: Verify Capture-Link Reuse, Target Attribution, and Partner Isolation

**Files:**
- Create: `apps/api/src/routes/__tests__/capture-links.test.ts`
- Modify: `apps/api/src/routes/__tests__/public.test.ts`
- Create: `apps/api/src/routes/__tests__/partner-dashboard.test.ts`
- Create: `apps/web/components/__tests__/CaptureLinksPanel.test.tsx`

**Interfaces:**
- Consumes: existing `captureLinkRoutes`, public capture mint route, and dashboard Target mapping.
- Produces: executable evidence that one active Capture link mints fresh Sessions with stable Target ownership.

- [ ] **Step 1: Write red route scenarios**

Test Partner A create/list/deactivate while Partner B cannot list or deactivate A's link. Mint the same active link twice and assert distinct Session/public-token ids, identical trusted Partner id, and identical Target `{ label, key, source: "capture-link" }`. Deactivated and malformed link tokens return the same 404 shape. Render `CaptureLinksPanel`, create a link, and assert `qrcode.toDataURL` receives the returned `/c/<token>` URL and the download action uses that generated data URL.

```ts
expect(first.sessionId).not.toBe(second.sessionId);
expect(first.sessionToken).not.toBe(second.sessionToken);
expect(insertedSessions.map(readTarget)).toEqual([TARGET, TARGET]);
```

- [ ] **Step 2: Run and observe missing test seams**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/capture-links.test.ts src/routes/__tests__/public.test.ts src/routes/__tests__/partner-dashboard.test.ts
npm test --workspace=apps/web -- components/__tests__/CaptureLinksPanel.test.tsx
```

Expected: FAIL until the new route fakes and Target assertions are implemented; production changes are made only if a scenario exposes a real defect.

- [ ] **Step 3: Add only the minimal repair demonstrated by red evidence**

Keep token generation random, Partner id from auth/link rows, Target normalization through `normalizeTargetKey`, and soft deletion. Do not add a Target table or change the public URL.

- [ ] **Step 4: Verify capture-link scenarios**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/capture-links.test.ts src/routes/__tests__/public.test.ts src/routes/__tests__/partner-dashboard.test.ts
npm test --workspace=apps/web -- components/__tests__/CaptureLinksPanel.test.tsx
npm run build --workspace=apps/api
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/__tests__/capture-links.test.ts apps/api/src/routes/__tests__/public.test.ts apps/api/src/routes/__tests__/partner-dashboard.test.ts apps/api/src/routes/capture-links.ts apps/api/src/routes/public.ts apps/api/src/routes/partner-dashboard.ts apps/web/components/__tests__/CaptureLinksPanel.test.tsx
git commit -m "test: verify Capture-link Target boundaries"
```

### Task 7: Make Legacy Finalize Retry Evidence Explicit

**Files:**
- Modify: `apps/api/src/routes/__tests__/public.test.ts`
- Modify: `apps/api/src/routes/__tests__/sessions.test.ts`
- Modify if red evidence requires: `apps/api/src/routes/public.ts`
- Modify if red evidence requires: `apps/api/src/routes/sessions.ts`

**Interfaces:**
- Consumes: legacy finalize route and deterministic `enqueueValidate` job identity.
- Produces: one effective Recording transition and one effective Pipeline start for retries.

- [ ] **Step 1: Write successful-finalize and replay tests**

For public and authenticated routes, assert a valid legacy request upserts Recording, changes `opened` to `submitted`, and enqueues validation. Replay after `submitted` and `processing` must return the durable current status without a second Recording write or enqueue. Race two handler calls against shared state and assert one effective queue job id `validate-<sessionId>`.

- [ ] **Step 2: Run red**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/public.test.ts src/routes/__tests__/sessions.test.ts
```

Expected: new success/replay assertions expose any duplicate work; do not change production code if existing deterministic queue behavior passes.

- [ ] **Step 3: Apply the smallest atomic-state repair if reproduced**

Any repair must constrain the Session update by the accepted pre-finalize states and use the affected-row result to decide whether enqueue is owned. Do not introduce versioned finalize logic.

```ts
.where("id", "=", session.id)
.where("status", "in", ["opened", "recording", "uploaded"])
.returning("id")
```

- [ ] **Step 4: Verify**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/public.test.ts src/routes/__tests__/sessions.test.ts src/lib/__tests__/queue.test.ts
npm run build --workspace=apps/api
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/__tests__/public.test.ts apps/api/src/routes/__tests__/sessions.test.ts apps/api/src/routes/public.ts apps/api/src/routes/sessions.ts
git commit -m "test: prove legacy finalize replay safety"
```

### Task 8: Complete Transcription and Session-Expiry Verification

**Files:**
- Create: `apps/api/src/jobs/__tests__/transcribe.test.ts`
- Create: `apps/api/src/jobs/__tests__/expire-session.test.ts`
- Modify: `apps/api/src/routes/__tests__/public.test.ts`
- Modify: `apps/api/src/routes/public.ts`

**Interfaces:**
- Consumes: `runTranscribeJob`, `runExpireSessionJob`, and `enqueueExpireSession`.
- Produces: executable success/failure evidence and expiry scheduling for every Session creation path.

- [ ] **Step 1: Write transcribe and expiry red tests**

Transcribe tests cover storage failure, provider failure, successful transcript upsert/analyze enqueue, and post-transcription enqueue failure using the shared failure path. Expiry tests cover missing/terminal skip, exact legacy key deletion, deletion failure followed by expiry, and status update. Public Session-create and Capture-link mint tests must assert one delayed expiry enqueue using the persisted `expires_at`.

- [ ] **Step 2: Run red**

```bash
npm test --workspace=apps/api -- src/jobs/__tests__/transcribe.test.ts src/jobs/__tests__/expire-session.test.ts src/routes/__tests__/public.test.ts
```

Expected: public/capture-link scheduling fails because those routes currently omit `enqueueExpireSession`.

- [ ] **Step 3: Add expiry scheduling after successful Session persistence**

Both public creation paths call:

```ts
await enqueueExpireSession(sessionId, expiresAt.getTime() - Date.now());
```

Preserve the 24-hour public/capture-link expiry and the 30-minute authenticated expiry. Do not change versioned deletion behavior.

- [ ] **Step 4: Verify all Pipeline job seams**

```bash
npm test --workspace=apps/api -- src/jobs/__tests__/validate-recording.test.ts src/jobs/__tests__/transcribe.test.ts src/jobs/__tests__/analyze.test.ts src/jobs/__tests__/expire-session.test.ts src/jobs/__tests__/mark-failed.test.ts src/routes/__tests__/public.test.ts
npm run build --workspace=apps/api
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs/__tests__/transcribe.test.ts apps/api/src/jobs/__tests__/expire-session.test.ts apps/api/src/routes/__tests__/public.test.ts apps/api/src/routes/public.ts
git commit -m "fix: schedule and verify Session expiry"
```

### Task 9: Separate All-Time Dashboard Aggregates from the Recent List

**Files:**
- Modify: `apps/api/src/routes/__tests__/partner-dashboard.test.ts`
- Modify: `apps/api/src/routes/partner-dashboard.ts`

**Interfaces:**
- Consumes: authenticated Partner id.
- Produces: all-time `stats`/`topics` and at most 100 recent formatted Sessions, all constrained to the same Partner.

- [ ] **Step 1: Reproduce the 101-Session aggregate defect**

Return 101 Partner A rows and one Partner B row from a stateful query adapter. Assert Partner A `stats.total === 101`, while `sessions.length === 100`; old completed/urgent/topic/Target rows outside the recent page still contribute to all-time aggregates; Partner B contributes nothing.

```ts
expect(payload.stats.total).toBe(101);
expect(payload.sessions).toHaveLength(100);
expect(payload.stats.urgent).toBe(1);
expect(payload.topics).toContainEqual({ name: "wait_time", count: 1, pct: 1 });
```

- [ ] **Step 2: Run red**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/partner-dashboard.test.ts
```

Expected: FAIL with total 100 because `.limit(100)` currently precedes aggregation.

- [ ] **Step 3: Split the data responsibilities**

Use an all-time Partner-scoped row set for aggregate computation and a separately ordered/limited Partner-scoped query for `formattedSessions`. Keep parsing defensive and do not return more than 100 Session rows. Do not add pagination or new dashboard analytics.

- [ ] **Step 4: Verify dashboard and API**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/partner-dashboard.test.ts src/routes/__tests__/partner-me.allowed-origins.test.ts
npm run build --workspace=apps/api
npm run build --workspace=apps/web
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/__tests__/partner-dashboard.test.ts apps/api/src/routes/partner-dashboard.ts
git commit -m "fix: compute dashboard totals across all Sessions"
```

### Task 10: Close Delivery and Detailed-Health Safety Evidence

**Files:**
- Modify: `apps/api/src/jobs/__tests__/deliver-webhook.test.ts`
- Modify: `apps/api/src/lib/__tests__/send-urgent-alert.test.ts`
- Create: `apps/api/src/lib/health-snapshot-cache.ts`
- Create: `apps/api/src/lib/__tests__/health-snapshot-cache.test.ts`
- Modify: `apps/api/src/routes/health.ts`

**Interfaces:**
- Consumes: webhook job payload, SES adapter, and `load(): Promise<HealthResponse>`.
- Produces: signed stable delivery, terminal failure evidence, propagated SES errors, and bounded/coalesced health loads.

- [ ] **Step 1: Add red delivery and cache cases**

Webhook cases: blocked URL performs zero fetches and zero delivery writes; fixed timestamp/body yields a precomputed literal HMAC header; HTTP 500 records the code and throws before attempt seven; attempt seven becomes `dead` and resolves. SES client rejection must reject `sendUrgentAlert`. Cache cases: two concurrent reads share one load; reads within 60,000 ms reuse; a read at 60,000 ms refreshes.

```ts
const cache = createHealthSnapshotCache({ ttlMs: 60_000, now, load });
await Promise.all([cache.get(), cache.get()]);
expect(load).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run red**

```bash
npm test --workspace=apps/api -- src/jobs/__tests__/deliver-webhook.test.ts src/lib/__tests__/send-urgent-alert.test.ts src/lib/__tests__/health-snapshot-cache.test.ts
```

- [ ] **Step 3: Implement the small cache interface and preserve delivery behavior**

`createHealthSnapshotCache` stores both an in-flight promise and the resolved `{ at, body }`; rejection clears the in-flight value. `healthRoutes` constructs one module-level cache using the current environment TTL and `buildHealthBody`. Make only delivery changes proven necessary by the red cases.

- [ ] **Step 4: Verify delivery and operations suites**

```bash
npm test --workspace=apps/api -- src/jobs/__tests__/deliver-webhook.test.ts src/jobs/__tests__/analyze.test.ts src/lib/__tests__/send-urgent-alert.test.ts src/lib/__tests__/assert-public-https-url.test.ts src/lib/__tests__/partner-settings.test.ts src/lib/__tests__/health-snapshot-cache.test.ts src/lib/__tests__/queue.test.ts src/routes/__tests__/health.test.ts src/routes/__tests__/health.database.test.ts src/routes/__tests__/health.redis.test.ts src/routes/__tests__/health.queues.test.ts src/routes/__tests__/health.pipeline.test.ts
npm run build --workspace=apps/api
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/jobs/__tests__/deliver-webhook.test.ts apps/api/src/lib/__tests__/send-urgent-alert.test.ts apps/api/src/lib/health-snapshot-cache.ts apps/api/src/lib/__tests__/health-snapshot-cache.test.ts apps/api/src/routes/health.ts
git commit -m "test: close delivery and health safety gaps"
```

### Task 11: Add the Release-Blocking Matrix and Controlled Completion Receipt

**Files:**
- Modify: `.github/workflows/docker-image.yml`
- Create: `apps/api/src/routes/__tests__/released-workflow.e2e.test.ts`
- Create: `docs/superpowers/receipts/2026-08-24-released-workflow-verification.md`

**Interfaces:**
- Consumes: all earlier task interfaces and migration contract `packages/db/tests/011_media_evidence_pinning.test.sh`.
- Produces: one controlled legacy capture-to-completed-Insights test, a PR/main validation gate, and an auditable implementation receipt.

- [ ] **Step 1: Write the controlled red workflow test**

Build a Fastify test app with stateful in-memory adapters for database/queue and controlled storage/transcription/analysis adapters. Exercise create Capture link, mint Session, open, legacy upload-url, finalize, validation, transcription, analysis, dashboard Target, webhook, and qualifying urgent alert. Assert the Session ends `completed`, transcript and Insights persist, Target remains attributed, one webhook event is signed, and one urgent alert is attempted. No real S3, provider, Redis, SES, or network call is allowed.

- [ ] **Step 2: Run the controlled workflow**

```bash
npm test --workspace=apps/api -- src/routes/__tests__/released-workflow.e2e.test.ts
```

Expected: FAIL until the test adapter connects all existing seams and any cross-task contract mismatch is repaired.

- [ ] **Step 3: Expand CI validation without permitting PR deployment**

Add `pull_request:` beside the existing main push trigger. Add a PostgreSQL 17 service and `TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hearloop_test` to validation. The validate job runs, in order:

```yaml
- run: npm ci
- run: npm run build --workspace=apps/api
- run: npm test --workspace=apps/api
- run: npm run build --workspace=apps/web
- run: npm run build --workspace=apps/quicklube-demo
- run: npm run build --workspace=packages/react
- run: npm test --workspace=packages/react
- run: bash scripts/check-browser-secret-examples.sh
- run: bash packages/db/tests/011_media_evidence_pinning.test.sh
  env:
    TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5432/hearloop_test
```

Retain hadolint. Add this exact deploy condition:

```yaml
if: github.event_name == 'push' && github.ref == 'refs/heads/main'
```

- [ ] **Step 4: Validate workflow structure locally**

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/docker-image.yml"); puts "workflow YAML: PASS"'
git diff --check
```

Run the migration contract only against a disposable local PostgreSQL cluster:

```bash
spec1_pg_dir="$(mktemp -d /tmp/hearloop-spec1-pg.XXXXXX)"
/Library/PostgreSQL/17/bin/initdb -D "$spec1_pg_dir" -A trust
/Library/PostgreSQL/17/bin/pg_ctl -D "$spec1_pg_dir" -o "-p 55439 -h 127.0.0.1" -w start
/Library/PostgreSQL/17/bin/createdb -h 127.0.0.1 -p 55439 hearloop_test
TEST_DATABASE_URL=postgresql://127.0.0.1:55439/hearloop_test bash packages/db/tests/011_media_evidence_pinning.test.sh
/Library/PostgreSQL/17/bin/pg_ctl -D "$spec1_pg_dir" -m fast -w stop
```

The path is created under `/tmp`, the database is disposable, and no developer or production URL is accepted.

- [ ] **Step 5: Run the full fresh local verification matrix**

```bash
npm run build --workspace=apps/api
npm test --workspace=apps/api -- --detectOpenHandles
npm run build --workspace=apps/web
npm run build --workspace=apps/quicklube-demo
npm run build --workspace=packages/react
npm test --workspace=packages/react
npm test --workspace=apps/web
bash scripts/check-browser-secret-examples.sh
git diff --check
```

Every command must exit 0. Record exact suite/test counts and any checks not run.

- [ ] **Step 6: Write the implementation receipt**

The receipt records:

```markdown
- Issue: #7
- Spec and plan paths
- Diff base and final HEAD
- Exact commands, exit codes, suite/test counts
- Reproduced findings and their fixing commits
- Rejected hypotheses with evidence
- Migration contract: run result, or explicitly not run and why
- Production smoke tests: not run; not authorized
- Release/deployment: not performed
- State: implemented, not released
```

- [ ] **Step 7: Commit**

```bash
git add .github/workflows/docker-image.yml apps/api/src/routes/__tests__/released-workflow.e2e.test.ts docs/superpowers/receipts/2026-08-24-released-workflow-verification.md
git commit -m "ci: block release on the verified workflow matrix"
```

## Final Review and Stop Gate

After Task 11:

1. Compare every implementation-gate bullet in the Specification against the receipt.
2. Run separate Standards and Spec reviews over the complete Issue #7 diff.
3. Resolve every Critical and Important finding through the sub-agent fix loop.
4. Run fresh verification after the final fix.
5. Report the accurate state as **implemented, not released**.
6. Stop. Do not start Specification 2 or Specification 3.
