# Hearloop — AI Session Context

> **One-file catchup.** Read this file first. For deeper dives see `context/` folder.
> This file is auto-read by Cursor, Claude Code, GitHub Copilot, Kiro, and OpenAI Codex agents.

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

## Current State

### Done ✅
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
- **CI/CD fully working** — push to `main` → build → ECR push → SSH → deploy → health check (~1 min)
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
- **BullMQ free-tier protection** — `stalledInterval` 30s → 10 min, concurrency trimmed, `removeOnComplete: true`; projected 500K Upstash commands last 125+ days instead of 17; `.cursor/skills/free-tier-protection/SKILL.md` + rule added
- **Per-partner CORS `allowed_origins`** — `PATCH /partners/:id/settings` to set origins; `authenticate` decorator enforces 403 on unlisted origins and narrows response header from `*` to the specific origin
- **Structured Pino logging in all job workers** — `lib/logger.ts` shared logger; all 5 job files + worker dispatcher emit structured JSON (job, sessionId, err context)
- **Shared CSS design tokens** — `apps/web/app/globals.css` centralises Google Fonts, `:root` vars, reset, `@keyframes`; removed ~25 duplicated lines from each of 5 pages
- **Single root `node_modules`** — removed nested `node_modules` + stray lock files; root `package.json` cleaned of incorrect app-level deps; npm workspaces hoists everything to root

### Blocked ⚠️
- **Bedrock daily token quota** — Nova Lite AND Haiku both pending quota increase. Transcript captured correctly by Groq but `sentiment_label`, `topics`, `model_used` remain null. Case opened with AWS, response in 1-2 days.

### Not Started ❌
- CloudWatch monitoring + Bedrock invocation logging
- Custom domain + SSL on EC2 (currently proxied via Vercel)
- Dashboard real-data E2E test (blocked by Bedrock quota)
- npm package / React SDK wrapper

---

## Current Blocker

**Bedrock daily token quota** — case opened, pending approval:
- Nova Lite cross-region inference tokens per day → requested 50M
- Claude Haiku model access → use case form submitted
- Until approved: transcription works, AI classification output (sentiment/topics) is null

---

## P1 Next Steps (After Bedrock quota approved)

1. Run E2E session — verify `analyses` table has `sentiment_label`, `topics`, `model_used`, `input_tokens`, `output_tokens` populated
2. Verify `stats.metrics` in dashboard API returns real latency + cost numbers
3. Wire dashboard 30s auto-refresh to show live data (polling already implemented)
4. ~~Per-partner CORS `allowed_origins`~~ ✅ Done (no migration needed — column was in 001_initial.sql)
5. ~~Structured logging with Pino~~ ✅ Done (`lib/logger.ts`, all 5 job files converted)

---

## Infrastructure (Updated May 17, 2026)

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

**Deleted:** RDS t3.micro, ElastiCache t3.micro, CloudWatch `RDSOSMetrics` log group

---

## Key File Map

```
apps/api/src/
  index.ts              — Fastify server, CORS, auth decorator, worker start
  routes/sessions.ts    — authenticated session lifecycle
  routes/public.ts      — public token routes (upload-url + finalize added)
  routes/partners.ts    — register/login/dashboard
  lib/env.ts            — startup env var validation
  lib/logger.ts         — shared Pino logger + jobLogger(name) child helper
  lib/claude.ts         — Bedrock Nova Lite + Haiku fallback classifier
  lib/groq.ts           — Whisper transcription wrapper
  lib/queue.ts          — BullMQ queues + workers + enqueue helpers (free-tier safe)
  lib/storage.ts        — S3 signed URL helpers (uses STORAGE_* env vars)
  lib/db.ts             — Kysely + pg, connects to Neon via DATABASE_URL
  jobs/validate-recording.ts  — MIME/size validation
  jobs/transcribe.ts    — storage → Groq → store → enqueueAnalyze
  jobs/analyze.ts       — Bedrock → update analysis → complete → enqueueWebhook
  jobs/deliver-webhook.ts     — HMAC webhook + SSRF guard + retries
  jobs/expire-session.ts      — cleans up expired sessions on a schedule

apps/web/
  app/login/page.tsx         — login/signup + API key reveal modal on signup
  app/dashboard/page.tsx     — dashboard + missing key banner + 30s auto-refresh
  app/capture/[token]/page.tsx — hosted capture shell
  components/Recorder.tsx    — voice recorder (wired to public routes)
  public/widget.js           — embeddable widget

packages/db/migrations/
  001_initial.sql       — base schema
  002_partner_auth.sql  — email + password_hash columns
  003_metrics_columns.sql — model_used, input/output_tokens, processing timestamps
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
PATCH  /partners/:id/settings             Bearer API key  — webhook_url, allowed_origins

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
```

---

## Deep-Dive Files

| File | Use when… |
|---|---|
| `context/CATCHUP.md` | Need full context with code details |
| `context/BACKLOG.md` | Planning what to work on next |
| `context/INFRA.md` | Deploying, SSH, env vars, AWS resources |
| `context/DECISIONS.md` | Questioning a tech choice |
| `context/METRICS.md` | Before/after measurements for every feature (resume-ready numbers) |
