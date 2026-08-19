# Sealed-packet independent review

**How to use:** Start a **new** chat in Claude or ChatGPT. Paste this entire file as the first (and only) message. Do not add extra context, prior conversation, or the product spec.

**Before you paste:** `INFRA.md` in this packet includes a live IP, AWS account id, and SSH host. That is already in the public repo. If you do not want that in a third-party chat, delete the `FILE: context/INFRA.md` section and keep the one-line fact: *stack is EC2 t3.micro + Neon + Vercel + S3 + Upstash; ~$9.60/mo; 1882 sessions all `legacy-v0`, 0 `versioned-v1`; CloudWatch Pipeline “After” still TBD.*

---

## Your role

You did not write the document under review. You have no loyalty to the author's product decisions. You have never spoken to the founder.

You are reviewing a **Business Requirements Document (BRD)** for a feature called "Insights query" on a product called Hearloop.

Score it as a **business case**, not as spec compliance. Treat every "signed decision" (OD-*) as a **claim**, not as law. Do not preserve the author's product decisions. Fail the document if the only clear beneficiary is the author's portfolio or interview narrative.

## What you have

Four artifacts only (below):

1. `CONTEXT.md` — domain glossary
2. `context/METRICS.md` — measured production/engineering facts
3. `context/INFRA.md` — live stack and cost envelope
4. `docs/BRD/BRD-01_insights-query.md` — the BRD to judge (v1.2 Draft)

You do **not** have the product spec, design spec, research memo, or the conversation that produced this BRD. Do not assume those documents rescue missing business evidence.

## What a BRD is supposed to be

A BRD answers: **why the business should spend money/time**, who suffers without it, what success looks like for that stakeholder, and what it must not cost. It is not an implementation plan and not a resume.

## Required output

Use this exact structure:

### 1. Verdict
One of: **Fund / Conditional / Do not fund** — as a business case. One paragraph why.

### 2. Two scores (keep them separate)
- **Document craft /10** — completeness, measurability, internal consistency, cost alternatives
- **Independent business case /10** — would an outsider staff or fund this without talking to the author?

### 3. Falsification
Answer these with evidence from the packet only. If the packet does not contain the evidence, say **not in packet**.

1. Who loses money or time if this feature does not ship?
2. What Partner *behavior* changes if it works (not what the API returns)?
3. Is there a named buyer, quote, or willingness-to-pay — or only a "future pilot Partner"?
4. Is the primary numbered business objective about the customer or about the author's portfolio?
5. Which numbers are measured in METRICS/INFRA vs invented in the BRD (e.g. 70% answer rate, 15/15, Option B empty pilot)?
6. Can this BRD falsify the product, or is it structurally required to justify decisions already made?
7. Given 1,882 `legacy-v0` Sessions and **0** `versioned-v1`, is a Partner pilot a business test or a UX rehearsal?

### 4. What would change your mind
List the minimum evidence (not features) that would raise the business-case score by 3+ points.

### 5. Do not
- Suggest a lakehouse, chatbot, or extra features unless they fix a *business-case* hole
- Rewrite the BRD
- Cite "the spec is approved" as proof of need
- Soften the verdict to be nice

---

# PACKET (do not treat headings below as your output)



---

## FILE: `CONTEXT.md`

# Hearloop

Voice micro-feedback platform: a **Partner** (business) embeds capture; an **End user** (customer) records short audio; Hearloop returns structured **Insights** via webhook.

## Language

**Partner**:
The business account that owns credentials, webhook URL, and session data. Not the person speaking feedback.
_Avoid_: Customer (ambiguous), tenant (ok in infra talk only)

**Partner dashboard session**:
The authenticated state after a Partner signs in with email and password. Used for dashboard and settings in the browser — not the Partner secret key.
_Avoid_: Session-create token, public token

**Partner secret key**:
Optional powerful credential (`sk-live_…`) for server-side Partner API calls (curl, Partner backend). Issued or rotated from Settings → API; not required for dashboard login. Must never appear in a public website or npm widget config.
_Avoid_: Widget embed key, password

**Business context**:
Optional plain-text description of what the Partner's business does, entered
manually or from a starter template and used to interpret feedback.
_Avoid_: Prompt text (that's per-Session capture copy), webhook URL

**Widget embed key**:
The browser-safe credential the Partner pastes into `@hearloop/react` on their site. Identifies which Partner receives new Sessions; can only start the capture flow, not read the dashboard or change Partner settings. Shown in dashboard **Settings → Embed** (not on the one-time signup screen).
_Avoid_: Partner secret key, public token (that's per-Session, not per-Partner)

**End user**:
The person who taps record and speaks. Has no Hearloop account.
_Avoid_: Customer, user (alone)

**Session**:
One feedback capture attempt with a lifecycle (`created` → … → `completed` | `failed` | `expired`). Identified internally by id; exposed publicly via a scoped **public token**.
_Avoid_: Recording (recording is the audio artifact row)

**Pipeline**:
The async job chain after finalize: validate → transcribe → analyze → webhook delivery. Runs out-of-band from the HTTP request.
_Avoid_: Workflow (generic)

**Insights**:
Structured output from analysis: transcript, sentiment, topics, urgency, flags — what the Partner receives.
_Avoid_: Result (too vague)

**Insights query**:
A later Partner-only read path: a bounded question over that Partner's Sessions that returns a Cited answer. Not a write into Insights and not a replacement for the Pipeline.
_Avoid_: Chatbot (too open), knowledge graph, feedback brain, RAG (implementation)

**Cited answer**:
The Insights query reply: counts, lists, or short quotes, each tied to Session ids. If evidence is missing or the question is unbounded, there is no answer — a refusal.
_Avoid_: Chat response, summary (uncited), recommendation (Hearloop does not prescribe ops)

**Insights delivery**:
How a Partner receives completed Session output. Three separate channels, all fed by the same Insights: **Dashboard** (Hearloop UI listing Sessions for that Partner, pull), **Webhook delivery** (HTTPS POST to Partner-configured URL, requires the Partner to run a receiving server), and **Urgent alert email** (SES email, push, fires only on negative-sentiment + urgent Sessions — the channel a non-technical Partner with no webhook receiver actually gets notified through).
_Avoid_: Result (too vague)

**Urgent alert email**:
Push notification (email via AWS SES) sent to the Partner the moment a Session's Insights come back negative-sentiment **and** urgent. Exists because Dashboard is pull (Partner has to think to check it) and Webhook delivery assumes a dev team the target Partner (non-technical local business) doesn't have. Only fires on the negative+urgent subset, not every Session — avoids alert fatigue.
_Avoid_: Webhook delivery (per-Session HTTPS push to Partner infra, different mechanism), Notification (too vague — this is specifically threshold-triggered)

**Recording**:
The audio artifact for a Session — stored in object storage; referenced from the database by key and metadata.
_Avoid_: Session (the recording is one part of a session)

**Public token**:
Opaque capability URL segment that scopes HTTP access to a single Session for capture (open, upload-url, finalize) without the Partner API key.
_Avoid_: API key, session id (internal UUID is separate)

**Session-create token**:
Short-lived credential used once to create a Session. May be minted from a Widget embed key (or, in legacy flows, from a Partner secret key). Keeps long-lived secrets out of repeated browser calls.
_Avoid_: Widget embed key (long-lived), JWT (not a general auth token)

**Webhook delivery**:
The act of POSTing completed Insights to the Partner's configured HTTPS endpoint, with signed proof of origin and retry history.
_Avoid_: Webhook URL (that's configuration, not delivery)

**Partner demo site**:
A standalone web app (not the Hearloop dashboard) that represents one Partner's customer-facing brand — e.g. an automotive service homepage with the widget embedded. Deployed on its own origin so the flow mirrors a real integration. **Phase 1:** simple one-page site with floating widget; **Phase 2:** post-visit focused page with inline widget.
_Avoid_: Capture page (that's Hearloop-hosted), dashboard (that's Partner admin UI)

**Embed settings**:
Dashboard area where a Partner configures **Allowed origins** and copies their **Widget embed key** for `@hearloop/react`. Separate from signup.
_Avoid_: API settings (secret keys), webhook settings (different concern)

**Capture surface**:
Where an End user reaches the recorder. Hearloop has two: the **primary** in-person surface (a **Capture link / QR** → Hosted capture, for service businesses) and the **secondary** online surface (the **Widget embed** on a Partner's website). Same Session lifecycle and Pipeline behind both.
_Avoid_: Channel (reserve for Insights delivery — dashboard vs webhook)

**Capture link / QR**:
A stable public URL (rendered as a QR code or sent by SMS) that opens the Hosted capture page for in-person feedback — printed on receipts, counter signage, or service-bay cards. May encode a **Target** (location/service). The primary capture surface.
_Avoid_: Widget embed (that's the online surface), public token (that's per-Session)

**Target**:
The thing a Session is feedback *about* — a location, service, product, or staff member (e.g. "North Ave — Oil Change"). Stored as a human `label` plus a normalized `key` for grouping. Sourced from a Capture link (in-person, built) or, in future, from page context detected by the Widget (online, designed). Sessions with no Target group under "Unattributed" on the dashboard's **By-Target** view.
_Avoid_: Product (too narrow — Hearloop generalizes beyond products), category (that's a topic of feedback, not its subject)

**Hosted capture**:
Hearloop-hosted page where an End user records using a **public token** URL. The recorder behind the **primary** in-person surface (reached via a Capture link / QR), and a fallback for online Partners who cannot embed the widget.
_Avoid_: Partner demo site, widget embed key

**Allowed origins**:
The list of website URLs where a Partner's Widget embed key may be used. Configured in Embed settings; requests from other origins are rejected.
_Avoid_: CORS (implementation detail), domain (too vague)


<!-- end CONTEXT.md -->


---

## FILE: `context/METRICS.md`

# Hearloop — Metrics Log

> Every feature shipped must have a before/after measurement here.
> Use these numbers in resumes, pitches, and post-mortems.

---

## Apply migration 011 media evidence pinning (release gate) — Aug 15, 2026

- Metric: production schema objects for media evidence pinning; S3 versioning; existing Session protocol
- Before: `011` absent on Neon `divine-cherry-94715192` / `production` (no `sessions.upload_protocol`, no `upload_grants`, no `finalize_receipts`, recordings lack version columns). `010` also absent (`webhook_deliveries.event_id` missing). 1882 sessions. S3 `hearloop-audio-prod` versioning claimed in INFRA only.
- After: S3 versioning `Status=Enabled`. Production `010`+`011` applied on `divine-cherry-94715192` / `production` (`br-green-poetry-aj1e0o9v`). 1882/1882 sessions `legacy-v0`, 0 `versioned-v1`, 32 recordings with version columns null, `upload_grants` and `finalize_receipts` present and empty. `webhook_deliveries.event_id` present (1/1). Shell contract previously PASS on throwaway `mig-011-shell-test`.
- Delta: production schema gained 010+011 objects; existing Session protocol unchanged (`legacy-v0`)
- How measured: `aws s3api get-bucket-versioning --bucket hearloop-audio-prod --region us-east-2`; Neon MCP `run_sql` on default branch after apply; `bash packages/db/tests/011_media_evidence_pinning.test.sh` (preview)

---

## Ticket 014 — AI classifier eval harness — Aug 11, 2026

- Metric: classifier accuracy on synthetic golden set (exact sentiment+urgency; expected topics ⊆ returned)
- Before: no semantic eval (ticket 007 was structural only)
- After: **17/23** (Aug 11, 2026) — no real pilot data yet
- Failures: `neu-fine`/`neu-tires` (topic `other` omitted), `neu-did-it` (positive vs neutral), `off-toaster` (neutral vs positive), `inj-fake-system` and `inj-roleplay` (injection flipped sentiment/urgency)
- Target: read and judge, not a CI gate
- How measured: `cd apps/api && npm run eval:analysis`

---

## Ticket 013 — Split db schema from connection — Aug 11, 2026

- Metric: files that change for a column add vs an SSL/pool change
- Before: 1 file (`lib/db.ts`) for both reasons
- After: column add → `lib/db-schema.ts` only; SSL/pool → `lib/db.ts` only
- Delta: 1 mixed module → 2 single-reason modules
- How measured: `npx tsc --noEmit` after the split; existing `import { db } from "../lib/db"` unchanged

---

## Ticket 012 — Queue/Redis seam — Aug 11, 2026

- Metric: places that open BullMQ/IORedis for queue access outside workers
- Before: 3 — `queue.ts` enqueue, `health.ts` checkQueues, `import-job-status.ts`
- After: 1 — `lib/queue.ts` (`withQueue` / `getWaitingJobCounts`)
- Delta: 2 ad-hoc queue clients removed; `/health/detailed` shape unchanged
- How measured: `rg -n "new IORedis|new Queue" apps/api/src` plus `jest src/lib/__tests__/queue.test.ts src/routes/__tests__/health.queues.test.ts`

---

## Ticket 011 — Partner settings validation — Aug 11, 2026

- Metric: private/loopback webhook URLs accepted on PATCH settings
- Before: 1 write path (`/partners/:id/settings`) accepted `https://127.0.0.1` (HTTPS-only check)
- After: 0 — both settings routes reject via `assertPublicHttpsUrl` (`ssrf_blocked`)
- Delta: save-time SSRF gap closed on webhook + website URL
- How measured: `cd apps/api && ../../node_modules/.bin/jest src/lib/__tests__/partner-settings.test.ts --runInBand`

---

## Ticket 008 — Urgent alert email — Aug 11, 2026

- Metric: push Insights channels for a non-technical Partner (no webhook server)
- Before: 0 — Dashboard (pull) + Webhook only
- After: 1 — SES email on `sentiment === "negative" && urgency === "urgent"`
- Delta: +1 delivery channel; non-matching Sessions send 0 emails (3/3 gated cases)
- How measured: `cd apps/api && ../../node_modules/.bin/jest src/jobs/__tests__/analyze.test.ts src/lib/__tests__/send-urgent-alert.test.ts --runInBand` (18/18)
- Scope note: code path only. SES sandbox cannot deliver to unverified inboxes until a sender identity is verified in the AWS console.

---

## Ticket 007 — Target-aware forced-tool AI analysis — Jul 17, 2026

### Free-text parse-error paths
- Metric: free-text JSON parsing/recovery paths in `apps/api/src/lib/claude.ts`
- Before: 1 — markdown-fence stripping + `JSON.parse` could return `fallbackAnalysis("parse_error")`
- After: 0 — only validated Bedrock Converse `toolInput` is accepted
- Delta: 1 → 0 (-100%)
- Target: 0
- How measured: `rg -n 'parse_error|JSON\.parse|raw\.replace' apps/api/src/lib/claude.ts` (no matches after); focused tests also provide valid free text alongside missing tool input and verify Haiku fallback

### Target and structured-output contract coverage
- Metric: dedicated local contract cases for Target propagation, forced tool use, fallback validation, and transcript/context separation
- Before: 0
- After: 12/12 Ticket 007 cases passing within 19/19 focused tests
- Target: 100% passing with both Nova Lite and Haiku forced to `record_analysis`
- How measured: `cd apps/api && npx jest src/lib/__tests__/claude.test.ts src/jobs/__tests__/analyze.test.ts --runInBand`
- Scope note: mocked seam/contract checks only. Live accuracy + injection resistance is ticket 014 (`eval:analysis`), not this ticket.

### Analyze-step latency
- Metric: Bedrock analyze latency (`BedrockLatencyMs` / Session 7 ~1.2s baseline)
- Before: ~1,200 ms (Session 7, free-text JSON, n=1)
- After: TBD after ≥5 production Sessions on the forced-tool path — extra Target/system tokens may raise input tokens; output should stay schema-sized
- Target: no material regression vs ~1.2s
- How measured: CloudWatch `Hearloop/Pipeline` `BedrockLatencyMs`; SQL in the live-cost block below for end-to-end `processing_completed_at - processing_started_at`

### Successful-call token metric retention
- Metric: Bedrock token fields carried through successful primary and fallback analysis
- Before: 2 fields (`inputTokens`, `outputTokens`)
- After: 2 fields retained; focused tests preserve exact Nova values (31/17) and exact successful Haiku fallback values (41/23)
- Delta: 100% field retention
- Target: both successful-call fields remain populated exactly from the selected Bedrock response
- How measured: focused Jest command above; production persistence remains `analyses.input_tokens` / `analyses.output_tokens`

### Live Bedrock token cost
- Metric: average Nova Lite input/output tokens and estimated cost per completed Session
- Before: ~215 input tokens, ~72 output tokens, ~$0.0000302 per Session (n=1 historical live baseline)
- After: TBD after at least 5 production Sessions use the forced-tool path; no live value was fabricated locally
- Target: < $0.0001 per Session while retaining valid Target-scoped Insights
- How measured:
  ```sql
  SELECT
    COUNT(*) AS sessions,
    ROUND(AVG(a.input_tokens)::numeric, 0) AS avg_input_tokens,
    ROUND(AVG(a.output_tokens)::numeric, 0) AS avg_output_tokens,
    TO_CHAR(
      AVG((a.input_tokens * 0.00000006) + (a.output_tokens * 0.00000024)),
      'FM0.0000000'
    ) AS avg_cost_usd
  FROM analyses a
  JOIN sessions s ON s.id = a.session_id
  WHERE s.status = 'completed'
    AND s.processing_completed_at >= TIMESTAMPTZ '2026-07-17 00:00:00Z'
    AND a.model_used = 'nova-lite'
    AND a.input_tokens IS NOT NULL
    AND a.output_tokens IS NOT NULL;
  ```

---

## Dashboard de-mock + Capture links (Direction A) — Jun 16, 2026

### Dashboard "real data" ratio
- Metric: mock data arrays still rendered in `apps/web/app/dashboard/page.tsx`
- Before: 3 (`MOCK_SESSIONS`, `MOCK_TOPICS`, `LOCATIONS`) + hardcoded metric cards, donut, webhooks
- After: 0 — every panel reads `buildDashboardPayload` with loading/empty states
- How measured: `rg "MOCK_|LOCATIONS" apps/web/app/dashboard/page.tsx` (only CSS comment remains)

### Partner setup effort to attribute feedback to a location/service (in-person)
- Metric: # of steps for a non-technical owner to start collecting attributed feedback
- Before: N/A — required website traffic + embedding `@hearloop/react` + configuring `allowed_origins`
- After: 1 — type a label → "New link" → print the QR. No website, no code.
- How measured: click-path in dashboard → Capture links

### Added pipeline latency from attribution
- Metric: finalize p95 before vs after Target attribution
- Expected: ~0 — Target is carried in the capture link and written at session mint; no extra LLM/fetch
- How measured (to capture after live E2E): finalize p95 from k6 smoke before/after

> Migration 007 is applied to Neon and the loop is verified locally (register → link →
> mint → session config → dashboard target → bad-token 404). Pending live QR capture:
> attribution coverage (% sessions with a non-null Target) once one phone session flows E2E.

### Redis command volume (`/health/detailed` free-tier guard)
- Metric: Upstash commands/day driven by uptime monitors polling `/health/detailed`
- Before: ~36K/day (each poll opened a connection, PINGed, and ran full `getJobCounts()` per queue) — exhausted the 500K/mo cap, taking the pipeline down
- After: ~7K/day — 60s snapshot cache + `getJobCounts('waiting')` only
- Delta: ~-80% commands/day; swapped to a fresh instance (`exact-urchin-126881`) to restore service
- How measured: Upstash console daily command graph; cache logic in `apps/api/src/routes/health.ts`

### EC2 root volume disk usage
- Metric: % used on the 20 GB gp3 root volume
- Before: 100% (deploys blocked) — 55 orphaned Docker images / ~14 GB from repeated `--no-cache` builds
- After: 18% (~17 GB free); `docker image prune -af` added to the deploy step so it can't recur
- How measured: `df -h /` on EC2 before/after `docker image prune`; prune step in `.github/workflows/docker-image.yml`

### Capture-link attribution E2E (API, Jun 17 2026)
- Metric: % of minted sessions with non-null Target on dashboard payload
- Before: N/A (feature new)
- After: 100% (3/3 automated runs) — `target.source=capture-link`, label/key match capture link
- How measured: `node testing/capture-link-e2e.js` against `https://18-223-189-193.nip.io/v1`
- Note: automated script uses synthetic audio → pipeline `failed` after validate/transcribe; phone scan with real mic proves full `completed` path

---

## Infrastructure Migration — May 16, 2026

### AWS Monthly Cost
- **Before:** $35.00/month (EC2 + RDS t3.micro + ElastiCache t3.micro + S3 + ECR)
- **After:** $9.60/month (EC2 + EBS + S3; Neon + Upstash on free tiers)
- **Delta: -72.6% monthly cost** ($25.40/month saved)
- How measured: AWS billing console + per-service pricing calculators

### AWS Credits Runway
- **Before:** $148 remaining ÷ $35/month = ~4.2 months
- **After:** $148 remaining ÷ $9.60/month = ~15.4 months
- **Delta: +267% runway** (4.2 → 15.4 months)

### ECR Storage
- **Before:** 91 images, 9,772 MB
- **After:** 1 image, ~75 MB
- **Delta: -99.2% ECR storage** (9,772 MB → 75 MB)
- How measured: `aws ecr describe-images --repository-name hearloop-api`

---

## CI/CD Pipeline — May 14, 2026

### Deployment Time (manual → automated)
- **Before:** Manual deploy ~15 minutes (build locally, push ECR, SSH, restart, verify)
- **After:** Git push → fully deployed in ~60 seconds
- **Delta: -93% deployment time** (15 min → 1 min)
- How measured: GitHub Actions run duration in workflow summary

### Deployment Reliability
- **Before:** 5/5 workflow runs failing (0% success rate)
- **After:** Fully automated, health-checked on every push
- **Delta: 0% → 100% CI success rate**
- How measured: `gh run list --repo shubh209/Hearloop --limit 10`

---

## Auth UX — May 15, 2026

### API Key Discoverability (login flow)
- **Before:** Key silently stored in localStorage on signup; no confirmation shown; login on new device = null key = silent mock data fallback
- **After:** Key shown in modal with copy button + warning before redirect; amber banner on dashboard if key missing with paste-and-verify input
- **Delta:** Login-to-real-data success rate: unmeasured → baseline needed
- How measured (next session): Register, clear localStorage, log in, paste key — verify dashboard loads real data in <5s

---

## Webhook Security — May 16, 2026

### SSRF Attack Surface
- **Before:** Any URL accepted as webhook endpoint, including `http://169.254.169.254/latest/meta-data/` (AWS metadata), private IPs, localhost
- **After:** HTTPS-only, blocks loopback/RFC1918/169.254.x.x/IPv6 private — validated before any outbound request
- **Delta: SSRF attack surface = 0** (all private ranges blocked)
- How measured: Code review of `assertSafeWebhookUrl()` in `jobs/deliver-webhook.ts`

---

## Startup Reliability — May 16, 2026

### Misconfigured Container Silent Failures
- **Before:** Container would start with missing env vars, fail silently at runtime (e.g., DB connection error on first request)
- **After:** `validateEnv()` in `lib/env.ts` runs before Fastify boots — exits immediately with a list of every missing var
- **Delta: Time-to-detect misconfiguration: minutes/hours → <1 second**
- How measured: Remove a required var from .env, restart container, observe immediate exit with clear message

---

## Per-Partner CORS — May 16, 2026

### Origin Enforcement Surface
- **Before:** `Access-Control-Allow-Origin: *` — any origin (malicious sites, scrapers) can call authenticated endpoints from a victim's browser session
- **After:** If a partner sets `allowed_origins`, requests from unlisted origins are rejected 403 before any data is returned; CORS response header is narrowed to the specific origin
- **Delta: CORS attack surface reduced from universal to per-partner allowlist** (0 origins enforced → configurable per partner)
- How measured: `curl -H "Origin: https://evil.com" -H "Authorization: Bearer sk-live_..." http://18.223.189.193:3001/v1/sessions` → expect 403 if `allowed_origins` is set and `evil.com` not in list

### Settings Endpoint
- **Before:** `allowed_origins` and `webhook_url` could only be set at registration
- **After:** `PATCH /v1/partners/:id/settings` allows live update of both; validates HTTPS-only webhooks and per-origin format
- **Delta: 0 → 1 partner self-service settings endpoint**
- How measured: `curl -X PATCH .../partners/:id/settings -d '{"allowedOrigins":"https://mysite.com"}'`

---

## Structured Pino Logging — May 16, 2026

### Log Format Quality (job workers)
- **Before:** `console.log("Processing transcribe job:", job.id, job.data)` — unstructured strings, no log level, no timestamp, no parseable fields
- **After:** `{"level":"info","time":"2026-05-16T...","service":"hearloop-api","job":"transcribe","sessionId":"...","sizeBytes":52430,"msg":"audio fetched from storage"}` — structured JSON with job context on every line
- **Delta: 0% machine-parseable logs → 100% structured JSON** across all 5 job files + worker dispatcher
- How measured: `docker logs <container> 2>&1 | head -20 | python3 -c "import sys,json; [json.loads(l) for l in sys.stdin]"` — should parse without errors
- Files changed: `validate-recording.ts`, `transcribe.ts`, `analyze.ts`, `deliver-webhook.ts`, `expire-session.ts`, `index.ts` (workers), added `lib/logger.ts`

---

## CSS Design Tokens + npm Consolidation — May 16, 2026

### CSS Duplication Removed
- **Before:** Each of 5 Next.js pages had its own `@import url(...)`, `*, *::before, *::after` reset, `:root` variable block, and `html/body` base — ~25 lines each, 5 pages = ~125 lines of duplicated CSS
- **After:** All shared styles live in `apps/web/app/globals.css` (single source of truth); each page keeps only its page-specific styles
- **Delta: ~125 lines of duplicated CSS → 0** (56-line shared file)
- How measured: line count of removed sections per page × 5

### npm workspace health
- **Before:** 3 × `node_modules` directories (root + `apps/api` + `apps/web`), 3 × `package-lock.json`, root `package.json` had wrong app-level deps (`fastify ^5.8.5`, `kysely ^0.28.16`, etc.)
- **After:** 1 × `node_modules` at root, 1 × `package-lock.json` at root, root `package.json` is workspace-only (no app deps)
- **Delta: 3 → 1 node_modules location** (npm workspaces hoisting working correctly)
- How measured: `find . -name "node_modules" -maxdepth 4 | wc -l` → 1

---

---

## Worker Duplication Quota Leak — May 17, 2026 (3 PM)

### Incident Summary
- **164K Redis commands in <1 day** on fresh Upstash instance
- Quota exhaustion timeline: **~3 days** at this rate (500K/month free tier)

### Root Cause (Corrected)
- **BullMQ `drainDelay` defaults to 5 seconds** — each idle worker fires `BZPOPMIN` every 5s
- 5 workers × 8 cmds × 12 cycles/min = **480 cmds/min = ~691K/day**
- `stalledInterval` only controls stalled-job detection; `drainDelay` controls idle polling rate
- `workersStarted` guard (d117855) correct but doesn't address the polling rate

### Fix Applied (Commit f04ef69)
- Set `drainDelay: 300` (5 min) in all workers in `lib/queue.ts`
- `BZPOPMIN` now fires every 5 min per worker instead of every 5s
- 97.8% reduction in idle Redis commands

### Impact After Fix
- **Before:** ~480 cmds/min → 691K/day (exhausts 500K/month in <1 day)
- **After:** ~8 cmds/min → 11.5K/day (under 15K/day safe ceiling)
- **Measured by:** Upstash command counter before/after deployment

### Lesson Learned
- Guard against worker/subscription duplication in process-based apps
- Monitor Upstash quota growth immediately after deployment
- Each container restart must be idempotent (no resource duplication)

## Upstash Redis Quota Exhaustion — May 17, 2026
- **Not a key leak.** BullMQ's idle worker background activity consumed the free tier.
- 5 workers × stalled-job check every 30s = ~29K Redis commands/day → hit 500K cap in 17 days
- Workers entered error loop once limit hit, generating even more commands

### Before (bad defaults)
- `stalledInterval`: 30,000ms (30s) → 14,400 stall-check commands/day across 5 queues
- `concurrency`: 5–20 per worker (unneeded for demo traffic)
- `removeOnFail: { count: 500–1000 }` → retaining 500–1000 failed job keys in Redis

### After (optimized)
- `stalledInterval`: 600,000ms (10 min) → ~1,440 commands/day from stall checks
- `concurrency`: 2 (5 for webhooks)
- `removeOnComplete: true` + `removeOnFail: { count: 50 }` → minimal key retention
- Projected daily idle commands: ~3–4K → 500K lasts **125+ days** instead of 17

### Action taken
- Container stopped May 17 to halt error-loop (was generating commands even after cap hit)
- New Upstash account/URL provisioned; `REDIS_URL` updated locally + on EC2 `/home/ec2-user/.env`
- Fix deployed via git push → CI/CD → EC2; container recreated with corrected env (no quoted URL)
- Upstash free counter resets monthly — next reset gives full 500K with optimized settings in place

---

## Widget API Key Protection — May 17, 2026

### Attack Surface (Key Exposure)
- **Before:** API key embedded in widget `data-api-key` attribute or config object, visible in page source and browser history
- **After:** API key only sent once to `/v1/public/sessions/create-token`, receives 10-min TTL token; all subsequent requests use token (key never sent again)
- **Delta: API key exposure window: unlimited → 10 minutes** (token + single-use prevents reuse)
- How measured: Browser DevTools → Network tab, inspect POST requests, no raw key in Authorization headers after initial token fetch

### Token Attack Surface
- **Before:** No rate limiting on session creation (any valid API key could create infinite sessions)
- **After:** Token is single-use, 10-min TTL, scoped to session creation only; subsequent use rejected with 401
- **Delta: Session creation rate limiting: none → 1 session per token**
- How measured: Get token, create session, attempt reuse of same token → `401 Invalid or expired token`

---

## Frontend Origin Validation — May 17, 2026

### CORS Attack Surface (Client-Side)
- **Before:** Recorder component POSTs to finalize without checking session's allowed_origins (relied entirely on backend CORS header)
- **After:** Client validates `allowed_origins` from session metadata, rejects requests from unlisted origins with user-friendly error before sending to server
- **Delta: Frontend CORS guard: 0 → 1** (defense-in-depth, reduces unnecessary network traffic)
- How measured: Set allowed_origins to "https://example.com", try to POST from https://hearloop.vercel.app → client-side error before network request

---

## CI/CD Validate Gate — May 17, 2026

### Silent Deployment Failures
- **Before:** No pre-deploy lint; broken Dockerfile failed in `deploy` job after opening SG, building full image (~3 min wasted per push). Failures went unnoticed for multiple pushes — live EC2 was running stale code.
- **After:** `validate` job (tsc + hadolint) runs first; `deploy` blocked until validate is green. Any Dockerfile or TypeScript error is caught in ~60s with zero AWS cost.
- **Delta: Time-to-detect broken Dockerfile: days → <60 seconds**
- How measured: `gh run list --repo shubh209/Hearloop --limit 5` — all runs now show two sequential jobs

---

## Baselines To Capture Next Session (after Bedrock quota approved)

| Metric | How to measure | Target |
|---|---|---|
| Pipeline end-to-end latency | `SELECT AVG(processing_completed_at - processing_started_at) FROM sessions WHERE status='completed'` | < 5s |
| Bedrock cost per session | `SELECT AVG((input_tokens * 0.00000006) + (output_tokens * 0.00000024)) FROM analyses WHERE model_used IS NOT NULL` | < $0.0001 |
| Webhook delivery success rate | `SELECT COUNT(*) FILTER (WHERE status='delivered') * 100.0 / COUNT(*) FROM webhook_deliveries` | > 95% |
| Session completion rate | `SELECT stats.completionRate FROM GET /partners/:id/dashboard` | > 90% |
| Dashboard load time | Browser DevTools → Network → time to first data paint | < 1s |
| Vercel First Load JS (dashboard) | Vercel build output | < 120 kB |

---

## Baseline Pipeline Metrics — May 2026

> First measurement. No prior baseline existed for pipeline performance metrics.
> Captured via `scripts/capture-metrics.sh` against live Neon instance (n=1 completed session, n=2 total sessions).
> Note: Pipeline latency of ~101s reflects a session that queued for an extended period before processing — not representative of steady-state performance. Session 7 manual observation (~1.2s) is the more reliable latency baseline.

### Pipeline Latency
- **Before:** N/A — first measurement
- **After:** AVG ~100,972 ms | MIN 100,972 ms | MAX 100,972 ms | P95 100,972 ms (n=1 completed session) — see note above; Session 7 observed ~1,200 ms under normal conditions
- **Delta:** N/A — first measurement
- **How measured:** `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000)::numeric, 0) AS avg_ms, ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ...) ::numeric, 0) AS p95_ms, COUNT(*) AS sample_size FROM sessions WHERE status = 'completed' AND processing_started_at IS NOT NULL AND processing_completed_at IS NOT NULL`
- **Target:** < 5,000 ms (steady-state)

### Cost Per Session (Bedrock Nova Lite)
- **Before:** N/A — first measurement
- **After:** AVG ~$0.0000302 | MIN $0.0000302 | MAX $0.0000302 (AVG 215 input tokens, 72 output tokens) — model: nova-lite
- **Pricing basis:** $0.06/1M input tokens, $0.24/1M output tokens (Nova Lite)
- **Delta:** N/A — first measurement
- **How measured:** `SELECT TO_CHAR(AVG((input_tokens * 0.00000006) + (output_tokens * 0.00000024)), 'FM0.0000000') AS avg_cost_usd FROM analyses WHERE model_used IS NOT NULL`
- **Target:** < $0.0001 per session

### Webhook Delivery Success Rate
- **Before:** N/A — first measurement
- **After:** unknown — no completed delivery attempts recorded (webhook_deliveries table empty)
- **Delta:** N/A — first measurement
- **How measured:** `SELECT ROUND(COUNT(*) FILTER (WHERE status = 'delivered') * 100.0 / NULLIF(COUNT(*) FILTER (WHERE status != 'pending'), 0), 1) FROM webhook_deliveries`
- **Target:** > 95%

### Session Completion Rate
- **Before:** N/A — first measurement
- **After:** 50.0% (1 completed / 2 total) — 1 completed, 1 failed
- **Delta:** N/A — first measurement
- **How measured:** `SELECT ROUND(COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0), 1) AS completion_rate_pct FROM sessions`
- **Target:** > 90%

### Frontend Performance (Manual — Out of Scope for Script)
- **Dashboard Load Time:** Measure via Browser DevTools → Network → DOMContentLoaded (no throttling, production mode)
- **Vercel First Load JS (dashboard):** Run `cd apps/web && npm run build` and record the `/dashboard` route row
- **Target:** Load time < 1s, First Load JS < 120 kB
- **Note:** These metrics are not automated by `scripts/capture-metrics.sh` and must be recorded manually.

---

## Business Context Injection — May 19, 2026

### Analysis Relevance
- **Before:** Classifier received only raw transcript — no knowledge of business type, industry, or services
- **After:** `partners.business_context` (set via `PATCH /partners/:id/settings`) is prepended to the Bedrock prompt at analysis time; summary and topic classification are scoped to the partner's actual business
- **Delta:** Qualitative — summaries now reference specific service type (e.g., "oil change wait time") instead of generic descriptions. Measurable baseline needed after Bedrock quota approved.
- How measured (next session): Compare summary text for identical transcripts with and without `business_context` set

### Token Cost Impact
- **Before:** User message = `Classify this feedback transcript: "..."` (~15–20 input tokens overhead)
- **After:** User message = `Business context: [up to 500 chars]\n\nClassify this feedback transcript: "..."` (~130 input tokens overhead at max context length)
- **Delta:** +~110 input tokens per session at max context = +$0.0000066/session (negligible at Nova Lite pricing)
- How measured: `SELECT AVG(input_tokens) FROM analyses WHERE model_used IS NOT NULL` — compare before/after

---

## Redis drainDelay Tuning — May 19, 2026

### Idle Command Rate (Second Fix)
- **Before (post-Session-5 fix):** `drainDelay: 300` (5 min) — observed ~18K commands/day (higher than projected 11.5K due to Queue instance keepalives)
- **After:** `drainDelay: 600` (10 min) + `validateQueue` added to shutdown handler
- **Projected:** ~6–8K commands/day → 500K/month lasts ~62–83 days (resets monthly anyway)
- How measured: Upstash dashboard command counter 24h after deploy
- Root cause note: BullMQ Queue instances (not just Workers) maintain their own Redis connections with background activity. 5 queues + 5 workers = ~10–12 active connections each doing keepalives.

---

## Redis Connection Architecture Fix — May 19, 2026

### Root Cause (Final)
- **Before:** Single `IORedis` connection shared between 5 Queue instances + 5 Worker instances
- BullMQ docs explicitly prohibit sharing connections between Queues and Workers
- Sharing caused BullMQ to spawn extra internal connections that ignored `drainDelay` entirely
- 5 persistent Queue instances alive 24/7 each maintained their own background heartbeat
- Result: ~17K commands/day despite `drainDelay: 600` setting

### Fix Applied
- Workers use a single dedicated `workerConnection` (shared safely among workers only)
- Queue instances are created on-demand per `enqueue()` call, then immediately closed (`queue.close()` + `conn.disconnect()`)
- No Queue instances remain alive between jobs — zero persistent Queue background activity
- `drainDelay: 600` now actually controls the only remaining idle polling (worker BZPOPMIN)

### Projected After Fix
- **Before:** ~17K commands/day (Queue keepalives + Worker polls, drainDelay ignored)
- **After:** 5 workers × ~8 cmds/poll × 144 polls/day (600s interval) = **~5,760 cmds/day**
- **Delta: ~70% reduction** — well under 15K/day safe ceiling
- How measured: Upstash dashboard command counter 24h after deploy

---

## CloudWatch Monitoring — May 23, 2026

> Baseline captured from Neon DB before deploying `lib/cloudwatch.ts`.
> Session 7 manual observation used for latency/token baseline (n=1 completed session;
> the queued-session outlier of ~101s is excluded as non-representative).
> "After" values to be filled once CloudWatch is live and ≥5 sessions have processed.

### Pre-deployment baseline SQL

Run against Neon before deploying to populate the Before column:

```sql
SELECT
  ROUND(AVG(
    EXTRACT(EPOCH FROM (s.processing_completed_at - s.processing_started_at)) * 1000
  )::numeric, 0)                                              AS avg_latency_ms,
  ROUND(AVG(a.input_tokens)::numeric, 0)                     AS avg_input_tokens,
  ROUND(AVG(a.output_tokens)::numeric, 0)                    AS avg_output_tokens,
  COUNT(*) FILTER (WHERE a.model_used = 'nova-lite')         AS nova_lite_count,
  COUNT(*) FILTER (WHERE a.model_used = 'haiku-fallback')    AS haiku_count,
  COUNT(*) FILTER (WHERE a.model_used = 'none')              AS failed_count,
  COUNT(*)                                                    AS total_completed
FROM analyses a
JOIN sessions s ON s.id = a.session_id
WHERE s.status = 'completed'
  AND s.processing_started_at IS NOT NULL
  AND s.processing_completed_at IS NOT NULL;
```

### Bedrock Invocation Metrics

| Metric | Before | After | Delta | How measured |
|---|---|---|---|---|
| Avg Bedrock latency (ms) | ~1,200 ms (Session 7 manual observation) | _TBD_ | — | SQL above / CloudWatch `BedrockLatencyMs` |
| P50 BedrockLatencyMs | — | _TBD_ | — | CloudWatch console, 1-hr window, ≥5 sessions |
| P95 BedrockLatencyMs | — | _TBD_ | — | CloudWatch console, 1-hr window, ≥5 sessions |
| Avg input tokens | ~215 tokens | _TBD_ | — | SQL above / CloudWatch `BedrockInputTokens` |
| Avg output tokens | ~72 tokens | _TBD_ | — | SQL above / CloudWatch `BedrockOutputTokens` |
| Nova Lite / Haiku ratio | 1 / 0 (100% Nova Lite, n=1) | _TBD_ | — | SQL above / CloudWatch `Outcome` dimension |
| Cost per session (Nova Lite) | ~$0.0000302 | _TBD_ | — | `(215 × $0.00000006) + (72 × $0.00000024)` |

### Observability Coverage

| Metric | Before | After | Delta | How measured |
|---|---|---|---|---|
| Bedrock latency queryable without log parsing | No — logs only | Yes — CloudWatch `BedrockLatencyMs` | 0 → 1 queryable metric | CloudWatch console → Hearloop/Pipeline namespace |
| Per-model invocation count | No | Yes — `BedrockInvocationCount` + `ModelId` dimension | 0 → 1 | CloudWatch console, filter by `ModelId` |
| EC2 CPU alarm | No | Yes — `hearloop-ec2-cpu-high` (≥80%, 2×5 min) | 0 → 1 alarm | `aws cloudwatch describe-alarms --alarm-names hearloop-ec2-cpu-high` |
| EC2 memory alarm | No | Yes — `hearloop-ec2-memory-high` (≥85%, 2×5 min, treat-missing=breaching) | 0 → 1 alarm | `aws cloudwatch describe-alarms --alarm-names hearloop-ec2-memory-high` |

### Post-deployment steps to fill in "After" values

1. SSH to EC2, add env vars, restart container:
   ```bash
   echo "CLOUDWATCH_REGION=us-east-2" >> /home/ec2-user/.env
   echo "CLOUDWATCH_NAMESPACE=Hearloop/Pipeline" >> /home/ec2-user/.env
   # Ensure IAM user has cloudwatch:PutMetricData permission
   docker pull <ecr-image> && docker run ...
   ```
2. Submit ≥5 real sessions through the pipeline
3. In CloudWatch console → Metrics → Custom namespaces → `Hearloop/Pipeline`:
   - Set time range to last 1 hour
   - Record P50 and P95 for `BedrockLatencyMs`
4. Update the After column and Delta above
5. Run `infra/alarms.sh` with `INSTANCE_ID` and `SNS_TOPIC_ARN` to create EC2 alarms

---

## @hearloop/react bundle — May 2026

> New package — no prior baseline. Zero runtime dependencies confirmed: `react` and `react-dom` are external/peer deps only (not bundled).

- Metric: ESM bundle size (gzipped)
- Before: N/A (new package)
- After: 5,603 bytes
- How measured: `gzip -c packages/react/dist/index.mjs | wc -c`

- Metric: CJS bundle size (gzipped)
- Before: N/A (new package)
- After: 6,022 bytes
- How measured: `gzip -c packages/react/dist/index.js | wc -c`

- Metric: TypeScript declaration size
- Before: N/A (new package)
- After: 3,229 bytes
- How measured: `wc -c packages/react/dist/index.d.ts`

- Metric: Runtime dependencies
- Before: N/A (new package)
- After: 0 (react and react-dom are external/peer deps — not included in bundle)
- How measured: Bundle inspection via `tsup.config.ts` `external: ["react", "react-dom"]` + `grep -c "require.*react" packages/react/dist/index.js` → 0 bundled require calls

---

## Load Testing & Security Hardening — May 27, 2026

### Load Test (200 concurrent users)
- **Metric:** p95 request latency under 200 simultaneous users
- **Result:** 149ms p95 — well under 3,000ms threshold
- **E2E flow p90:** 6,543ms (includes Neon cold start from auto-pause)
- **Error rate:** 0% (with pre-generated tokens, RATE_LIMIT_MAX=10000)
- **How measured:** k6 `per-vu-iterations` executor, 200 VUs × 1 iteration

### Spike Test (500 instant users)
- **Metric:** Error rate and recovery time under sudden traffic burst
- **Result:** 1.19% errors at peak (TCP connection limit on t3.micro), full recovery in <10s
- **How measured:** k6 stages: 0→500 in 10s, hold 30s, drop to 0, 1min recovery window

### Soak Test (20 VUs × 10 minutes)
- **Metric:** p95 latency stability over sustained load (memory leak / connection exhaustion detection)
- **Result:** 116ms p95 flat throughout — no degradation
- **E2E:** 1.9s min, 3.9s max, 3.9s p95 — consistent
- **How measured:** k6 `constant-vus` executor, 20 VUs, 10 min duration

### Rate Limit Correctness
- **Metric:** Rate limiter correctness (allows MAX, blocks MAX+1, resets, isolates per key)
- **Result:** 9/9 tests passing
- **How measured:** `node testing/load-performance/rate-limit-test.js` against live EC2 with RATE_LIMIT_MAX=10, RATE_LIMIT_WINDOW_MS=15000

### Docker CVE Reduction
- **Before:** 46 vulnerabilities (28 high, 12 medium, 6 low) in Docker Scout
- **After:** 0 runtime vulnerabilities (16 remaining are in build-time layers only, not present in runner image)
- **Delta: -100% runtime CVEs**
- **How measured:** `docker scout cves` on production ECR image
- **Packages upgraded:** fastify v4→v5, @fastify/rate-limit v8→v10, kysely v0.27→v0.28.17, next v15.0→v15.5.18, turbo v2.0→v2.9.14

### OWASP ZAP Baseline Scan
- **Result:** 65 checks passed, 0 failures, 2 low-severity warnings (on 404 pages only)
- **How measured:** `docker run ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://18-223-189-193.nip.io`
- **Full report:** `testing/vulnerability-security/zap-results/zap-summary.md`

---

## Evidence-gated repository cleanup — August 15, 2026

The cleanup retired the inactive Crawl4AI import path while preserving manual
business-context entry, migration history, the QuickLube demo, and career
material.

| Metric | Before | After | Delta | How measured |
|---|---:|---:|---:|---|
| Always-loaded `AGENTS.md` lines | 376 | 31 | -345 (-91.8%) | `git show 22dfd16:AGENTS.md \| wc -l`; `wc -l AGENTS.md` |
| Direct package declarations proven unused | 4 | 0 | -4 (-100%) | Compared root/API manifests for `@jridgewell/trace-mapping`, `@anthropic-ai/sdk`, `ts-jest`, and `@types/pino` |
| Retired business-context import endpoints registered | 2 | 0 | -2 (-100%) | Public route-registration regression test; both former endpoints now return Fastify's normal 404 |
| Tracked implementation/documentation lines in initial cleanup implementation | 2,523 removed | 880 added | -1,643 net lines | `git diff --numstat 22dfd16...7caf53e` summed across text files |

The line delta includes the detailed cleanup implementation plan added for
reviewability. It excludes approved untracked local artifacts removed from the
main workspace because Git has no reliable line baseline for those files.


<!-- end context/METRICS.md -->


---

## FILE: `context/INFRA.md`

# Hearloop — Infrastructure Reference

> Contains live IPs and deployment commands. Do not commit secrets here.

Last updated: August 15, 2026

---

## Live Endpoints

| Resource | URL |
|---|---|
| Web (Vercel) | https://hearloop.vercel.app |
| API (EC2) | https://18-223-189-193.nip.io |
| API Health | https://18-223-189-193.nip.io/health |
| API via Vercel proxy | https://hearloop.vercel.app/api/* |

---

## AWS Resources (us-east-2)

| Resource | Type | Details | Cost |
|---|---|---|---|
| EC2 | t3.micro | Elastic IP: 18.223.189.193 — API container on port 3001 | ~$8/mo |
| EBS | 20 GB gp3 | EC2 root volume | ~$1.60/mo |
| S3 | `hearloop-audio-prod` | Private, versioning enabled (live `get-bucket-versioning` 2026-08-15: `Status=Enabled`), CORS enabled for presigned PUT uploads | ~$0.002/mo plus retained-version storage |
| ECR | `hearloop-api` | Docker image repository, lifecycle policy active | $0 free tier |

**Deleted (May 16, 2026):** RDS t3.micro, ElastiCache Valkey t3.micro, CloudWatch RDSOSMetrics log group

### S3 media evidence capability

- Bucket versioning is enabled (AWS `s3api get-bucket-versioning`,
  2026-08-15, us-east-2, `Status: Enabled`); older pre-versioning objects
  remain legacy null-version objects.
- CORS retains the widget-compatible origin policy and exposes `ETag`,
  `x-amz-version-id`, and `x-amz-checksum-sha256`.
- Application access includes version inspection, exact-version reads, and
  exact-version deletion under the recording prefixes.
- No automatic noncurrent-version lifecycle deletion is configured.
- The August 14 capability probe verified distinct VersionIds, exact-version
  HEAD/GET integrity, browser-visible headers, scoped listing, and exact cleanup.
- Checksum-presigned uploads sign `Content-Type` and keep
  `x-amz-checksum-sha256` signed and unhoisted.

---

## External Services (Free Tier)

| Service | Purpose | Connection |
|---|---|---|
| **Neon** | PostgreSQL 16, serverless, auto-pause | `DATABASE_URL` in .env |
| **Upstash Redis** | BullMQ queues, serverless | `REDIS_URL` in .env |
| **Vercel** | Web frontend hosting | Auto-deploy from GitHub main |
| **Groq** | Whisper STT | `GROQ_API_KEY` in .env |

---

## SSH Access

```bash
ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193
```

---

## CI/CD (Fully Working — May 14, 2026)

Push to `main` → GitHub Actions → build linux/amd64 Docker image → push ECR → SSH to EC2 → pull & restart container → health check.

**GitHub Secrets required:**
- `AWS_ACCESS_KEY_ID` — IAM user credentials
- `AWS_SECRET_ACCESS_KEY` — IAM user credentials
- `EC2_SSH_KEY` — contents of `~/.ssh/hearloop-key.pem`

**Security group:** `sg-0fdee87e11e224206` (hearloop-api-sg)
- Port 22: dynamically opened/closed per CI/CD run (runner IP added before SSH, revoked after)
- Port 3001: open to `0.0.0.0/0`

Workflow file: `.github/workflows/docker-image.yml`

---

## Manual Deployment

From repo root (not `apps/api`):

```bash
# 1. Build image for EC2 (must be linux/amd64)
docker build --platform linux/amd64 -f apps/api/Dockerfile -t hearloop-api .

# 2. Tag for ECR
docker tag hearloop-api:latest 652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest

# 3. Authenticate Docker to ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 652892608187.dkr.ecr.us-east-2.amazonaws.com

# 4. Push
docker push 652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest

# 5. SSH to EC2 and restart
ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193 \
  "docker stop hearloop-api && docker rm hearloop-api && \
   docker pull 652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest && \
   docker run -d --name hearloop-api --env-file /home/ec2-user/.env -p 3001:3001 \
   --restart unless-stopped 652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest"
```

---

## Required Environment Variables (API — EC2 `/home/ec2-user/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `REDIS_URL` | Upstash Redis connection string (`rediss://...`) |
| `APP_URL` | `https://hearloop.vercel.app` |
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `STORAGE_ENDPOINT` | `https://s3.us-east-2.amazonaws.com` |
| `STORAGE_REGION` | `us-east-2` |
| `STORAGE_ACCESS_KEY_ID` | IAM key with S3 access |
| `STORAGE_SECRET_ACCESS_KEY` | IAM secret |
| `STORAGE_BUCKET` | `hearloop-audio-prod` |
| `GROQ_API_KEY` | Groq API key for Whisper |
| `BEDROCK_REGION` | `us-east-2` |
| `BEDROCK_ACCESS_KEY_ID` | IAM key with Bedrock access |
| `BEDROCK_SECRET_ACCESS_KEY` | IAM secret |
| `WEBHOOK_SIGNING_SECRET` | HMAC secret for webhook signatures |
| `PARTNER_SESSION_SECRET` | HMAC secret for `hlps.*` dashboard session tokens (register/login) — **required**; generate with `openssl rand -base64 32` |

---

## Required Environment Variables (Web — Vercel)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Optional. Prefer omitting — server pages use `/api` proxy via `serverApiBase()`; Recorder defaults to `/api`. If set, use `https://hearloop.vercel.app/api` (**not** `/api/v1`). |

---

## Database migrations (Neon)

Migration files are immutable history and must be applied through an explicit
release gate. File presence does not prove production application.

Production Neon (`divine-cherry-94715192`, default branch `production`,
`br-green-poetry-aj1e0o9v`), applied 2026-08-15 via Neon MCP (`010` then `011`):

| Migration | Production default branch |
|---|---|
| `009_business_context_import.sql` | Applied (`partners.website_url`, `business_context_source`) |
| `010_webhook_delivery_event_id.sql` | Applied (`webhook_deliveries.event_id` uuid NOT NULL, 1/1 rows populated) |
| `011_media_evidence_pinning.sql` | Applied (`sessions.upload_protocol`, `upload_grants`, `finalize_receipts`, recordings version columns) |

Post-apply verification: 1882/1882 sessions `legacy-v0`, 0 `versioned-v1`, 32 recordings
with version columns still null, 0 `upload_grants`, 0 `finalize_receipts`. New Sessions
still default to `legacy-v0`. Rollback remains the commented block at the bottom of
`011` only while `versioned-v1` count is 0; page before running it.

To initialize a new database, apply every migration in numeric order rather
than copying only the original three commands from this document:

```bash
NEON_URL="postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require&channel_binding=require"
for migration in packages/db/migrations/*.sql; do
  psql "$NEON_URL" -f "$migration"
done
```

---

## GitHub

Repo: https://github.com/shubh209/Hearloop


<!-- end context/INFRA.md -->


---

## FILE: `docs/BRD/BRD-01_insights-query.md`

# BRD-01: Insights query

## Document Control

| Field | Value |
| --- | --- |
| Project Name | Hearloop |
| Document Version | 1.2 |
| Date | 2026-08-17 |
| Document Owner | Shubh Kapadia |
| Prepared By | Agent (`/brd` skill) |
| Status | **Draft v1.2 — pending owner approval** |
| BRD Type | Feature |
| Documentation order | **Retroactive** — product spec v4 and ODs were signed first; this BRD records business **why** for those decisions |

### Document Revision History

| Version | Date | Author | Changes |
| --- | --- | --- | --- |
| 1.0 | 2026-08-17 | Agent | Initial BRD — retroactive to approved spec v4 |
| 1.1 | 2026-08-17 | Agent | Locked BRD.01.32.05 Observability |
| 1.2 | 2026-08-17 | Agent | Review patches: status, objectives, GA metrics, Security/Infra fixes, pilot corpus rule, Appendix C/D |

### Owner sign-off

| Role | Name | Date | Approval |
| --- | --- | --- | --- |
| Document owner | Shubh Kapadia | | **Pending** |

**This BRD is not binding for tickets or pilot until the owner row is approved.**

---

## 1. Executive Summary

Hearloop already captures voice feedback and returns structured **Insights**. Partners still cannot **trust** those facts enough to filter on them or ask simple questions over their own **Sessions** without a fluent, uncited guess.

The **By-Target dashboard** answers “show me Sessions” — it does not answer “how many negative this week at North Ave?” without manual scanning. **Insights query** funds that gap: bounded questions with **Cited answers** or **refusal**, not open chat.

This BRD justifies that investment on the existing **Pipeline** and Postgres — not a lakehouse, knowledge graph, or “train on all feedback” program.

**Business decision:** Invest in **eval-gated accuracy** and **cited retrieval**. Reject, for v1, Snowflake/Databricks ingestion, open chatbots, and prescribing Partner operations.

**Signed alignment** with product spec v4 (Aug 17, 2026): OD-7 A, OD-8 waive for pilot, OD-9, OD-10.

---

## 2. Business Context

### 2.1 Market / problem context

Enterprise VoC platforms already offer “ask your data.” Research (`context/research/feedback-layer-landscape.md`) shows that proposition is **saturated**. Hearloop’s wedge is **in-person voice** at **Session** grain. The business gap is **trust**, not missing ingest.

### 2.2 Strategic alignment

| Goal | How Insights query serves it |
| --- | --- |
| **Partner trust** | Cited answers or refusal — no recommendation chat |
| **Portfolio / learning** | Quotable eval bars, cost discipline vs lakehouse |
| **Product continuity** | Extends Capture → Pipeline → Insights |
| **North star (parked)** | Multi-modality warehouse — appendix only |

### 2.3 Business objectives

#### BRD.01.23.01: Portfolio demonstrability (measurable)

By the GA decision, the owner shall be able to explain in one interview-ready narrative — backed by **≥3 entries in `context/METRICS.md`** (eval gate scores, pilot supported-query answer rate, query p95) — why **citations + eval** beat **lakehouse fine-tuning** for feedback trust. Success = those three artifacts exist and are quotable without hand-waving.

### 2.4 Current state

- **Live product:** Capture → **Pipeline** → **Insights** → dashboard, webhook, urgent-alert email.
- **Data:** ~1,882 `legacy-v0` Sessions; **0** `versioned-v1` (`context/METRICS.md`).
- **Quality:** `GOLDEN_SET` **17/23** diagnostic; launch eval suites not at bar.
- **Product contract:** `docs/superpowers/specs/2026-08-17-insights-query-prd.md` v4 (approved before this BRD).

```mermaid
flowchart LR
  EU[End user] --> CAP[Capture]
  CAP --> SES[Session]
  SES --> PIPE[Pipeline]
  PIPE --> INS[Insights]
  INS --> DEL[Insights delivery]
  P[Partner] --> Q[Insights query]
  Q --> SES
  Q --> CA[Cited answer or refusal]
```

---

## 3. Stakeholder Analysis

| Stakeholder | Interest | Success looks like |
| --- | --- | --- |
| **Partner** | Trustworthy facts | Count/list/quote with evidence — or refusal |
| **End user** | Low-friction capture | Unaffected |
| **Builder / owner** | Shippable, defensible scope | Gates, metrics, cost cap |
| **Future pilot Partner** | Safe trial | Kill switch; no cross-tenant data |

### 3.6 Technology Stack Prerequisites

**N/A — Feature BRD.** See `context/INFRA.md`, `CONTEXT.md` (Fastify/EC2, Neon, BullMQ, S3, Groq, Bedrock, Vercel).

### 3.7 Mandatory Technology Conditions

**N/A — Feature BRD.** Inherited: tenant isolation, no secret keys in query UI, ~$10–15/mo cost envelope, **OD-6** requires explicit human authorization for production flip.

---

## 4. Business Requirements

Product behavior detail lives in spec v4. These are **business outcomes** only.

### BRD.01.01.01: Trustworthy label foundation

No Partner-facing query until Partner-action holdout and classifier injection pass published bars.

### BRD.01.01.02: Grounded answers only

Cite inspectable **Sessions** or **refuse** — never uncited strategic advice.

### BRD.01.01.03: Facts, not operations

Hearloop does not prescribe Partner ops (no ticketing, no “page the bay” product logic).

### BRD.01.01.04: Tenant-safe retrieval

Cross-Partner leakage is unacceptable.

### BRD.01.01.05: Evidence integrity for query corpus

Exclude legacy unpinned Sessions from query corpus (**OD-7 A**).

### BRD.01.01.06: Continuity of today’s product

Capture, Pipeline, and Insights delivery keep working when query is off.

### BRD.01.01.07: Cost-disciplined accuracy

Accuracy via **eval + citations**, not lakehouse fine-tuning.

### BRD.01.01.08: Staged rollout with kill switch

Builder → gated pilot → GA; per-Partner and global kill switches.

---

## 5. Success Criteria

### BRD.01.06.01: Pre-pilot launch gates (must pass)

| Gate | Bar |
| --- | --- |
| Partner-action holdout | 15/15 |
| Classifier injection | 5/5 |
| Query citation suite | 100% |
| Query refusal suite | 100% |
| Query injection suite | 100% |
| Cross-Partner isolation | 0 leaks |

`GOLDEN_SET` = diagnostic only (17/23 baseline).

### BRD.01.06.02: Pilot product metrics

Measure: supported-query answer rate (defined in BRD.01.06.03), evidence-results open rate, repeat query use within 14 days, Partner-reported incorrect citations, query p95 (OD-10: 5s).

### BRD.01.06.03: Pilot → GA graduation

Promote to GA only after **all** of:

- ≥14 calendar days **or** ≥50 supported-intent queries (whichever is later)
- Zero cross-Partner isolation incidents
- Eval suites remain 100% on frozen sets
- **Supported-query answer rate ≥70%** (formula below)
- Query p95 ≤ 5s (OD-10) sustained over pilot window
- **OD-8** re-signed for GA (lineage or explicit waive)

**Supported-query answer rate (locked formula):**

```
numerator   = queries that return a Cited answer (refusal = null)
              for a supported intent (count | list | quote)

denominator = queries classified as supported intent (count | list | quote)
              — excludes unsupported_intent and range_too_wide
              (those are correct refusals, not product failure)

rate        = numerator / denominator
```

If denominator &lt; 20 during pilot, GA promotion requires owner judgment plus written rationale in `context/METRICS.md` — the 70% bar alone is insufficient.

**Pilot failure budget:** If supported-query answer rate is **&lt;50%** after ≥20 supported-intent queries, **pause GA** and fix product/eval before expanding — do not lower the bar silently.

### BRD.01.06.04: Portfolio demonstrability

Satisfies **BRD.01.23.01** via `context/METRICS.md` entries.

### BRD.01.06.05: Empty corpus honesty

Disclose to pilot Partners when legacy data is excluded and corpus is building from new captures.

### BRD.01.06.06: Pilot corpus minimum (locked)

Partner **pilot** may start only when **one** of:

| Option | Rule |
| --- | --- |
| **A (preferred)** | Pilot Partner has **≥10 completed `versioned-v1` Sessions** in query corpus after **OD-6** flip |
| **B (accepted empty)** | Owner **signs empty-corpus pilot** in writing: pilot validates UX/refusals/metrics only; Partner is told query may return only zeros until new captures accumulate |

Option B does **not** satisfy GA graduation — GA still requires Option A corpus threshold or equivalent seeded production captures.

---

## 6. Constraints and Assumptions

### Constraints

- Portfolio cost envelope ~$10–15/mo; no standing lakehouse in v1
- Spec v4 signed ODs binding unless reopened
- Pilot requires **OD-6**, pinning integrity, Layer 1 observability (BRD.01.32.05)
- Deploy, issues, and BRD approval are separate authorizations

### Assumptions

| Assumption | Class |
| --- | --- |
| In-person service Partner is primary buyer | Verified |
| Postgres = system of record for v1 | Verified |
| 1,882 legacy / 0 versioned-v1 today | Verified |
| Empty-corpus pilot (Option B) is acceptable for learning | Default — owner must sign if used |
| `model_used` sufficient for pilot (OD-8 waive) | Verified |

---

## 7. Architecture Decision Requirements

Topics for future ADRs. **No ADR numbers.**

### 7.1 Overview

| Status | Count |
| --- | --- |
| Selected | 5 |
| Pending | 0 |
| N/A | 2 |

### 7.2 Mandatory topics

#### BRD.01.32.01: Infrastructure

**Status:** Selected (minimal — no new compute tier)

**Business Driver:** Query and observability require **authorized production changes** on the existing stack, not a new hosting tier.

**Business Constraints:**

- Stay on existing EC2 + Vercel + Neon (~$10–15/mo envelope)
- **OD-6** `versioned-v1` production flip is a business-mandated gate for pilot corpus
- CloudWatch namespace **`Hearloop/InsightsQuery`** for GA latency evidence
- No second API region or container service for v1

**Alternatives Overview:**

| Option | Est. monthly | Rationale |
| --- | --- | --- |
| **Extend existing EC2 API + CloudWatch** | **$0–3 incremental** | **Selected** |
| New Lambda/Cloud Run query service | $5–30+ | **Rejected** — split deployment for portfolio scale |
| Larger EC2 instance for query | +$8–15 | **Rejected** until pilot p95 proves need |

**Recommended Selection:** Minimal production mutations on current platform (flip, metrics namespace, dashboard hook) — not a new infra tier.

**PRD Requirements:** OD-6 authorization workflow; verify Pipeline CloudWatch emit before relying on query metrics pattern (see Appendix D).

---

#### BRD.01.32.02: Data Architecture

**Status:** Selected

**Business Driver:** Query own Sessions with inspectable evidence without a warehouse.

**Business Constraints:** Postgres SoR; no Snowflake/Databricks v1; OD-7 A; OD-9 count evidence shape.

**Alternatives Overview:**

| Option | Est. monthly | Rationale |
| --- | --- | --- |
| **Postgres query layer** | $0 incremental | **Selected** |
| Warehouse ELT | $50–500+ | **Rejected** |
| Knowledge graph | $25–200+ | **Rejected** |

**Recommended Selection:** Postgres on Neon.

**PRD Requirements:** Filter schema (OD-1), pagination, `versioned-v1` corpus eligibility.

---

#### BRD.01.32.03: Integration

**Status:** N/A — dashboard-only v1; no Slack/email/public query API.

**Note:** Dashboard evidence-open logging for pilot metrics is **in-scope** via Observability + Appendix D — not a third-party integration.

**PRD Requirements:** Phase 2 flag for API/webhook query delivery.

---

#### BRD.01.32.04: Security

**Status:** Selected

**Business Driver:** Cross-Partner leakage destroys trust.

**Business Constraints:** Server-side Partner scope; no probeable tenant errors; query off until gates pass.

**Alternatives Overview:**

| Option | Est. cost | Rationale |
| --- | --- | --- |
| **App-layer `partner_id` filter + 0-leak tests** | $0 | **Selected for v1** |
| **Postgres row-level security** | $0 + migration | **N/A for v1** — revisit only if app-layer tests fail or compliance requires |
| Separate DB per Partner | $N × Neon | **Rejected** |

**Recommended Selection:** App-layer isolation with **0-leak integration tests** as launch gate. RLS is explicitly out of v1 scope.

**PRD Requirements:** Isolation suite; security review before pilot.

---

#### BRD.01.32.05: Observability

**Status:** Selected

**Business Driver:** GA requires latency and answer-rate evidence, not vibes.

**Business Constraints:**

- Log intent, refusal code, latency, totalCount — **not raw question text**
- Log `partnerIdHash` only (one-way hash for support correlation) — **never** raw Partner id in CloudWatch dimensions
- p95 ≤ 5s blocks GA if sustained (OD-10)
- $0 incremental vendor spend — extend existing Pino + CloudWatch pattern
- Pipeline CloudWatch “After” may still be TBD — **verify Pipeline emit works before pilot** (Appendix D)

**Alternatives Overview:**

| Option | Est. monthly | Rationale |
| --- | --- | --- |
| **Pino + CloudWatch `Hearloop/InsightsQuery`** | $0–3 | **Selected** |
| Datadog / New Relic | $15–100+ | **Rejected** |
| METRICS.md manual only | $0 | **Rejected alone** |

**Recommended Selection — two layers (business):**

**Layer 1 — Operational:** Every query request produces structured logs and CloudWatch metrics (latency, request count by intent, refusal count by code).

**Layer 2 — Product / pilot:** Periodic rollup into `context/METRICS.md`; evidence-open events when Partner opens paginated results or cited Session detail.

Implementation detail: **Appendix D** (PRD/tickets).

**PRD Requirements:** Layer 1 before pilot; Layer 2 before GA decision.

---

#### BRD.01.32.06: AI/ML Architecture

**Status:** Selected

**Business Driver:** Demonstrable accuracy — not “trained on lots of data.”

**Business Constraints:** Eval gates; no bulk fine-tuning; query injection suite; Bedrock spend stays within existing analyze envelope unless OD-4 quote path adds bounded compose (cap: eval budget + pilot token ceiling TBD in tickets).

**Recommended Selection:** Dual-track eval (labels + query citations/refusals/injection).

**PRD Requirements:** Frozen corpora; OD-4 for quote retrieval.

---

#### BRD.01.32.07: Technology Selection

**Status:** N/A — locked Hearloop stack.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Launch gates never reached | Medium | High | No Partner query; keep core product |
| Empty corpus at pilot | High (today) | Medium | BRD.01.06.06 Option A or signed Option B |
| Fluent wrong citation | Medium | High | 100% citation eval |
| Answer rate &lt;50% in pilot | Medium | High | BRD.01.06.03 failure budget — pause GA |
| Pipeline CloudWatch not live | Medium | Medium | Verify before pilot (Appendix D) |
| Scope creep (lakehouse/chat) | Medium | High | Non-goals §10 |
| Privacy in query logs | Low | Medium | No raw questions; partnerIdHash only |
| Neon slow queries at scale | Low | Medium | Defer until pilot p95 fails |

---

## 9. Traceability

### Upstream

| Source | Reference |
| --- | --- |
| Domain glossary | `CONTEXT.md` |
| Design spec | `docs/superpowers/specs/2026-08-17-insights-query-design.md` |
| Research | `context/research/feedback-layer-landscape.md` |
| Infra | `context/INFRA.md` |
| Metrics | `context/METRICS.md` |

### Downstream

| Artifact | Reference | Status |
| --- | --- | --- |
| Product spec | `docs/superpowers/specs/2026-08-17-insights-query-prd.md` v4 | Approved (precedes this BRD) |
| Eval design | `docs/superpowers/specs/2026-08-16-insights-partner-action-eval-design.md` | Exists |
| Tickets | `to-tickets` after **owner approves this BRD** | Pending |
| ADRs | §7.2 topics when implementation starts | Not written |

### Element tags (downstream)

- `@brd: BRD.01.23.01` — portfolio demonstrability objective
- `@brd: BRD.01.06.03` — supported-query answer rate formula
- `@brd: BRD.01.06.06` — pilot corpus minimum
- `@brd: BRD.01.32.05` — observability two-layer model

### Related BRDs

| Relationship | BRD |
| --- | --- |
| @depends-brd | null (no platform BRD; stack via INFRA.md) |

---

## 10. Out of Scope (Business)

- Enterprise VoC replacement
- Every feedback modality in this initiative
- Lakehouse / knowledge graph v1 investment
- Bulk fine-tuning
- Prescribing Partner ops
- Live shop as business gate
- Legacy Sessions in query corpus (OD-7 A)
- Postgres RLS in v1

---

## 11. Glossary

Uses `CONTEXT.md`. Key terms: **Insights query**, **Cited answer**, **Session**, **Insights**, **Target**, **Pipeline**, **supported-query answer rate** (BRD.01.06.03).

---

## 12. Appendices

### Appendix A — Rejected north star

Warehouse + fine-tune + knowledge graph — parked, not funded in this BRD.

### Appendix B — Signed product decisions (spec v4)

| ID | Decision |
| --- | --- |
| OD-7 | A — exclude legacy from query corpus |
| OD-8 | Waive lineage for pilot; re-sign for GA |
| OD-9 | totalCount + evidenceResultsUrl |
| OD-10 | 90d / 50 / 10 / 5s p95 |

### Appendix C — Critical review record (Aug 17, 2026)

| Reviewer lens | Score (pre-v1.2) | Verdict after patches |
| --- | --- | --- |
| **Sol 5.6** | 7.0/10 | Patches applied; **pending owner sign-off** before “Approved” |
| **Sonnet** | 7.5/10 | Reduced PRD duplication in §4; infra/security/GA metrics tightened |

**Blockers addressed in v1.2:** status authority, answer-rate formula, RLS → N/A v1, infra Selected (minimal), pilot corpus rule (BRD.01.06.06), implementation moved to Appendix D, Appendix C replaced.

**Remaining owner actions:** Sign Document Control table; choose BRD.01.06.06 Option A vs B before pilot; approve BRD to unlock tickets.

### Appendix D — PRD / ticket implementation checklist (not business requirements)

Deferred from §7.2 to keep BRD business-facing:

1. Extend CloudWatch helper for **`Hearloop/InsightsQuery`** metrics (`QueryLatencyMs`, `QueryRequestCount`, `QueryRefusalCount`) — do not overload Pipeline namespace
2. Insights query HTTP route: Pino structured fields + metric emit; warn-and-continue on emit failure
3. Define `partnerIdHash` algorithm and salt in implementation spec (not raw Partner id in logs/CW)
4. Verify **`Hearloop/Pipeline`** CloudWatch emit is live before pilot (fill METRICS.md “After” or document gap)
5. Extend `scripts/capture-metrics.sh` (or sibling) for query p50/p95 and answer-rate rollup
6. Dashboard: evidence-open event when Partner opens `evidenceResultsUrl` or cited Session detail
7. Do not log raw Partner questions in production

---

**Next step:** Owner approves this BRD → `to-tickets`. No Partner pilot until §5 gates, OD-6, BRD.01.06.06 corpus rule, and Appendix D Layer 1 items for pilot.


<!-- end docs/BRD/BRD-01_insights-query.md -->
