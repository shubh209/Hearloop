# Hearloop — AI Session Context

> **One-file catchup.** Read this file first. For deeper dives see `context/` folder.
> This file is auto-read by Cursor, Claude Code, GitHub Copilot, Kiro, and OpenAI Codex agents.

[![CI](https://github.com/shubh209/Hearloop/actions/workflows/docker-image.yml/badge.svg)](https://github.com/shubh209/Hearloop/actions/workflows/docker-image.yml)

---

## What It Is

Hearloop is a **multi-tenant voice micro-feedback platform**. A business embeds a JS widget or sends customers to a hosted capture page. The customer taps, speaks for 5 seconds, done. The business receives structured JSON via webhook: transcript, sentiment, topics, urgency, quality flags, moderation flags.

Target: automotive service, healthcare, hospitality, retail — anywhere in-person interactions happen and survey completion is <5%.

---

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js 20, TypeScript, Fastify 4 (`apps/api`) |
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
| API | http://18.223.189.193:3001 |
| Health | http://18.223.189.193:3001/health |
| GitHub | https://github.com/shubh209/Hearloop |
| SSH | `ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193` |

---

## Current State (Updated May 19, 2026)

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
- **Bedrock daily token quota** — Nova Lite AND Haiku both pending quota increase. Transcript captured correctly by Groq but `sentiment_label`, `topics`, `model_used` remain null. Case opened with AWS.
- **Migration 005 not yet applied to Neon** — run `ALTER TABLE partners ADD COLUMN business_context TEXT;` on Neon before deploying

### Not Started ❌
- CloudWatch monitoring + Bedrock invocation logging
- Custom domain + SSL on EC2 (currently proxied via Vercel)
- Dashboard real-data E2E test (blocked by Bedrock quota)
- npm package / React SDK wrapper
- Observability endpoint (`/health/detailed` with DB/Redis/queue depth checks)

---

## Current Blocker

**Bedrock daily token quota** — case opened, pending approval:
- Nova Lite cross-region inference tokens per day → requested 50M
- Claude Haiku model access → use case form submitted
- Until approved: transcription works, AI classification output (sentiment/topics) is null

**Before deploying Session 6 changes:** apply migration 005 on Neon:
```sql
ALTER TABLE partners ADD COLUMN business_context TEXT;
```

---

## P1 Next Steps

1. **Apply migration 005** on Neon (`business_context` column)
2. **Deploy** — `git push origin main` → CI/CD handles the rest
3. **After Bedrock quota approved:** run E2E session, verify full analysis populates, capture metrics
4. **Observability** — add `/health/detailed` endpoint (DB ping, Redis ping, queue depths, 24h completion rate)

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
  005_business_context.sql       — business_context TEXT column on partners (⚠️ not yet applied to Neon)
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
| `context/CATCHUP.md` | Need full context with code details |
| `context/BACKLOG.md` | Planning what to work on next |
| `context/INFRA.md` | Deploying, SSH, env vars, AWS resources |
| `context/DECISIONS.md` | Questioning a tech choice |
| `context/METRICS.md` | Before/after measurements for every feature (resume-ready numbers) |
