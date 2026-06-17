# Hearloop — AI Session Context

> **One-file catchup.** Read this file first. For deeper dives see `context/` folder.
> Domain/ubiquitous language lives in `CONTEXT.md`. This file is auto-read by Cursor, Claude Code, GitHub Copilot, and OpenAI Codex agents.
>
> **Interview prep:** [`career/interview-prep/INTERVIEW_PREP.md`](career/interview-prep/INTERVIEW_PREP.md) — session handoff, CREO starter, coverage status, live E2E notes. Index: [`career/interview-prep/README.md`](career/interview-prep/README.md). All resume/career material now lives under `career/`.

[![CI](https://github.com/shubh209/Hearloop/actions/workflows/docker-image.yml/badge.svg)](https://github.com/shubh209/Hearloop/actions/workflows/docker-image.yml)

---

## What It Is

Hearloop is a **multi-tenant voice micro-feedback platform**. The customer taps, speaks for 5 seconds, done. The business receives structured JSON via webhook: transcript, sentiment, topics, urgency, quality flags, moderation flags.

**One product, two capture surfaces** (see `context/CAPTURE_SURFACES.md`):
- **Primary — in-person:** a **QR code / SMS link → hosted capture page**. Lead vertical: **quick-service automotive** (also clinics, salons, hospitality). The feedback moment is in-person, so capture meets the customer at the receipt/counter/bay, not on a website.
- **Secondary — online:** an embedded **website widget** (`widget.js` / `@hearloop/react`) for partners with real web traffic (e-commerce, online booking/confirmation pages).

Both are fully supported; we lead with the in-person surface because it matches the core value prop (survey completion <5%) and demos without needing website traffic.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 20, TypeScript, Fastify **5** (`apps/api`) |
| Frontend | Next.js 15 App Router, React 19 (`apps/web`) |
| Database | PostgreSQL 16 via Kysely + `pg` → **Neon (serverless, free tier)** |
| Queue | BullMQ + ioredis → **Upstash Redis (serverless, free tier)** |
| Storage | AWS S3 (`hearloop-audio-prod`, us-east-2), signed URLs |
| STT | Groq `whisper-large-v3-turbo` |
| AI | AWS Bedrock Nova Lite primary → Claude Haiku fallback |
| Infra | EC2 t3.micro (API), Vercel (Web), ECR |
| Build | npm workspaces + Turborepo |

---

## Live URLs

| Resource | Value |
|---|---|
| Web | https://hearloop.vercel.app |
| API | https://18-223-189-193.nip.io |
| Health | https://18-223-189-193.nip.io/health |
| GitHub | https://github.com/shubh209/Hearloop |
| SSH | `ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193` |

---

## Current State (Updated May 27, 2026)

### Done ✅ (Session 8 — Testing, Security & SDK)

#### @hearloop/react npm package
- **Published-ready React SDK** — `packages/react/` with 6 single-responsibility source files
- `useHearloop` hook + `HearloopWidget` component, CJS + ESM + `.d.ts`, 5.6 KB gzipped ESM
- **72 tests passing** — unit + 8 property-based tests (fast-check, 100 runs each)
- Zero runtime dependencies; `"use client"` directive on all files for Next.js App Router

#### Security hardening
- **UUID validation** on all `:id` route params — returns 400 instead of leaking DB error on injection attempts
- **Server header suppressed** — `header -Server` in Caddyfile removes `server: Caddy` response header
- **Docker CVEs reduced 46 → 0 runtime** — upgraded fastify v4→v5, @fastify/rate-limit v8→v10, kysely v0.27→v0.28.17, next v15.0→v15.5.18, turbo v2.0→v2.9.14
- **devDependencies excluded from production image** — Dockerfile `prod-deps` stage uses `--omit=dev`
- **RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS** now configurable via env vars (was hardcoded)

#### Load & Performance Testing (k6)
- **Smoke test** — 19/19 checks, full 8-step session flow verified
- **Load test** — 200 concurrent users, 149ms p95, 0% errors (with pre-generated tokens + RATE_LIMIT_MAX=10000)
- **Stress test** — 50→400 VUs, 0 server crashes, rate limiter working correctly
- **Spike test** — 500 instant users, 1.19% errors, full recovery in <10s

#### Rate Limit Correctness Tests
- **9/9 tests passing** — API key bucket, 429 on MAX+1, window reset, key isolation, IP bucket
- Key insight: `create-token` is a public endpoint (IP bucket); authenticated routes use key prefix bucket

#### Soak Test (20 VUs × 10 min)
- **p95 latency: 116ms flat** throughout — no degradation, no memory leaks
- E2E: 1.9s min, 3.9s max, consistent

#### Vulnerability & Security
- **OWASP ZAP baseline** — 65 checks passed, 0 failures
- **Manual security checks** — SSRF, SQL injection, auth, CORS all verified
- **ZAP active scan script** ready — `testing/vulnerability-security/zap-active-scan.js`

#### Uptime Monitoring
- **3 monitors live on Better Uptime** — API health, detailed health, Vercel frontend

### Done ✅ (Session 7)
- **Bedrock Nova Lite confirmed working** — full pipeline verified E2E: validate → transcribe (Groq) → analyze (Bedrock Nova Lite) → webhook. `sentiment_label`, `topics`, `model_used`, `input_tokens`, `output_tokens` all populate correctly.
- **Migration 005 applied to Neon** — `business_context TEXT` column live on Neon
- **Fixed `upload-url` crash** — `req.body` null-guard added (`?? {}`) so endpoint works without a request body
- Bedrock Nova Lite: ~1.2s latency, 215 input tokens, 72 output tokens per session

### Done ✅ (Session 6)
- Full REST API: session CRUD, signed S3 upload, finalize, result, delete
- Partner register/login/dashboard endpoints (bcrypt, SHA-256 key hashing)
- Public capture routes: `GET /public/session/:token/upload-url` + `POST /public/session/:token/finalize`
- Full async pipeline: finalize → validate → transcribe (Groq) → analyze (Bedrock) → webhook
- HMAC webhook delivery with 7-retry exponential backoff + dead-letter table
- Session expiry cleanup job
- Rate limiting (100 req/min per key)
- All Next.js pages: landing, login/signup, dashboard, capture, docs
- Embeddable `widget.js` (full state machine)
- Next.js API proxy (avoids mixed-content HTTPS issue)
- **CI/CD fully working** — `validate` job (tsc + hadolint) gates `deploy`; push to `main` → build → ECR push → SSH → deploy → health check (~2 min)
- Metrics columns in DB: `model_used`, `input_tokens`, `output_tokens`, `processing_started_at`, `processing_completed_at`
- Dashboard API returns `stats.metrics` (avg latency, token totals, estimated cost, model breakdown)
- **API key reveal modal after signup** — shows key once with copy button before redirecting
- **Missing key banner on dashboard** — paste input if apiKey not in localStorage
- **Dashboard 30s auto-refresh** — polls `/dashboard` every 30 seconds
- **SSRF protection on webhooks** — blocks HTTP, loopback, RFC1918, link-local (169.254.x.x), IPv6 private
- **Env config validation** — `lib/env.ts` validates all required vars at startup, exits with clear error if missing
- **Migrated RDS → Neon** (free tier, auto-pause) — saves $15/month
- **Migrated ElastiCache → Upstash Redis** (free tier) — saves $12/month
- **ECR cleanup** — 90 old images deleted, lifecycle policy set (untagged → 1 day, max 5 tagged)
- **Monthly cost: ~$9.60/month** (down from $35/month)
- **BullMQ free-tier protection** — `stalledInterval` 10 min, `drainDelay` 600s (10 min), concurrency 2, `removeOnComplete: true`; 500K Upstash commands lasts 125+ days
- **Per-partner CORS `allowed_origins`** — `PATCH /partners/:id/settings`; `authenticate` decorator enforces 403 on unlisted origins
- **Widget API key protection** — `POST /v1/public/sessions/create-token` returns 10-min TTL token; widget never exposes raw API key
- **Server-side session creation** — token-based flow, 10-min TTL, single-use
- **Frontend origin validation** — Recorder component validates origin before finalize POST (defense-in-depth)
- **Vercel config** — `vercel.json` builds only `apps/web`
- **Structured Pino logging** — all 5 job files + worker dispatcher emit structured JSON
- **Shared CSS design tokens** — `globals.css` centralises fonts, vars, reset
- **Single root `node_modules`** — npm workspaces hoisting working correctly
- **Business context per partner** — `business_context TEXT` column on `partners` table (migration 005); settable via `PATCH /partners/:id/settings`; injected into Bedrock prompt at analysis time for more relevant sentiment/topic output
- **Redis drainDelay raised to 600s** — was 300s; actual observed usage was ~18K/day, now projected ~6–8K/day
- **validateQueue closed on shutdown** — was missing from shutdown handler, now included

### Blocked ⚠️
- None currently.

### Not Started ❌
- Dashboard real-data E2E test (manual — run capture flow end-to-end)
- ZAP active scan execution (script written, needs `npm run build --workspace=apps/api` first)

---

## Current Blocker

None. Pipeline is fully operational.

## P1 Next Steps

1. **Manual E2E test** — sign up → record audio → verify dashboard shows transcript, sentiment, topics
2. **ZAP active scan** — run `node testing/vulnerability-security/zap-active-scan.js` (needs local build first)

---

## Infrastructure (Updated May 19, 2026)

| Resource | Details | Cost |
|---|---|---|
| EC2 | t3.micro, us-east-2, Elastic IP `18.223.189.193`, port 3001 | ~$8/mo |
| EBS | 20 GB gp3 root volume | ~$1.60/mo |
| S3 | `hearloop-audio-prod`, 93.9 MB | ~$0.002/mo |
| ECR | `hearloop-api`, ~75 MB, lifecycle policy active | $0 (free tier) |
| Neon | PostgreSQL 16, serverless, auto-pause | $0 (free tier) |
| Upstash | Redis, serverless, BullMQ-compatible | $0 (free tier) |
| Vercel | Web frontend | $0 (free tier) |
| **Total** | | **~$9.60/mo** |

---

## Key File Map

```
apps/api/src/
  index.ts              — Fastify server, CORS, auth decorator (fetches business_context), worker start
  routes/sessions.ts    — authenticated session lifecycle
  routes/public.ts      — public token routes (upload-url, finalize, create-token, session creation)
  routes/partners.ts    — register/login/dashboard/settings (webhook_url, allowed_origins, business_context)
  lib/env.ts            — startup env var validation
  lib/logger.ts         — shared Pino logger + jobLogger(name) child helper
  lib/claude.ts         — Bedrock Nova Lite + Haiku fallback; accepts businessContext option, injects into prompt
  lib/groq.ts           — Whisper transcription wrapper
  lib/queue.ts          — BullMQ queues + workers (drainDelay:600, stalledInterval:600000) + enqueue helpers
  lib/storage.ts        — S3 signed URL helpers
  lib/db.ts             — Kysely + pg; PartnersTable includes business_context field
  jobs/validate-recording.ts  — MIME/size validation
  jobs/transcribe.ts    — storage → Groq → store → enqueueAnalyze
  jobs/analyze.ts       — fetches partner business_context from DB → Bedrock → update analysis → complete → enqueueWebhook
  jobs/deliver-webhook.ts     — HMAC webhook + SSRF guard + retries
  jobs/expire-session.ts      — cleans up expired sessions on a schedule

apps/web/
  app/login/page.tsx         — login/signup + API key reveal modal on signup
  app/dashboard/page.tsx     — dashboard + missing key banner + 30s auto-refresh
  app/capture/[token]/page.tsx — hosted capture shell
  components/Recorder.tsx    — voice recorder with origin validation
  public/widget.js           — embeddable widget (token-based session creation)

packages/db/migrations/
  001_initial.sql                — base schema
  002_partner_auth.sql           — email + password_hash columns
  003_metrics_columns.sql        — model_used, input/output_tokens, processing timestamps
  004_session_create_tokens.sql  — session_create_tokens table for token-based auth
  005_business_context.sql       — business_context TEXT column on partners
```

## Testing Suite

```
testing/
  load-performance/
    smoke.js                  — 1 VU, full 8-step session flow, 19/19 checks
    load.js                   — 200 VUs × 1 iteration, pre-generated tokens
    stress.js                 — 50→400 VUs, finds breaking point
    spike.js                  — 500 instant users, tests recovery
    soak.js                   — 20 VUs × 10 min, detects memory leaks
    rate-limit-test.js        — 9 correctness tests for rate limiter
    setup-test-partners.js    — registers N test partners, writes test-keys.json
    generate-tokens.js        — pre-generates session-create tokens
    cleanup-test-partners.js  — deletes test partners + sessions from DB
  vulnerability-security/
    audit-results.md          — full security audit findings
    zap-active-scan.js        — ZAP active + authenticated scan script
    zap-results/zap-summary.md — ZAP baseline scan results (65 pass, 0 fail)
  uptime-monitoring/
    README.md                 — Better Uptime setup (3 monitors live)
```

---

## Session State Machine

`created → opened → recording → uploaded → submitted → processing → completed | failed | expired`

---

## API Routes (all prefixed `/v1`)

```
POST   /partners/register
POST   /partners/login
GET    /partners/:id/dashboard            Bearer API key
PATCH  /partners/:id/settings             Bearer API key  — webhook_url, allowed_origins, business_context

POST   /sessions                          Bearer API key
GET    /sessions/:id                      Bearer API key
GET    /sessions/:id/result               Bearer API key
POST   /sessions/:id/upload-url           Bearer API key
POST   /sessions/:id/finalize             Bearer API key
DELETE /sessions/:id                      Bearer API key

GET    /public/session/:token             public
POST   /public/session/:token/open        public
GET    /public/session/:token/upload-url  public
POST   /public/session/:token/finalize    public
POST   /public/sessions/create-token      public (apiKey) — returns 10-min TTL token
POST   /public/sessions                   Bearer token (session-create token) — create session with token
```

---

## Business Context Flow (Session 6)

Partners set a plain-text description of their business via `PATCH /partners/:id/settings`:
```json
{ "businessContext": "Automotive service center. Oil changes, tire rotations, brake jobs. Walk-in and appointment customers. Average visit 45–90 min." }
```
At analysis time, `jobs/analyze.ts` fetches `partners.business_context` from the DB and passes it to `lib/claude.ts`. The classifier prepends it to the user message:
```
Business context: Automotive service center...

Classify this feedback transcript: "the wait was too long"
```
Falls back gracefully to context-free analysis if `business_context` is null.

---

## Deep-Dive Files

| File | Use when… |
|---|---|
| `CONTEXT.md` | Need the domain/ubiquitous language (Partner, Session, Insights, tokens) |
| `context/PHASE1_PLATFORM.md` | Deploying the widget-keys + dashboard-session platform work |
| `context/BACKLOG.md` | Planning what to work on next |
| `context/INFRA.md` | Deploying, SSH, env vars, AWS resources |
| `context/DECISIONS.md` | Questioning a tech choice |
| `context/METRICS.md` | Before/after measurements for every feature (resume-ready numbers) |
| `career/` | Resume bullets, interview prep, networking notes (not code) |
