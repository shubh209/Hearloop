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
| Database | PostgreSQL 16 via Kysely + `pg` |
| Queue | BullMQ + ioredis (AWS ElastiCache Valkey 7.2) |
| Storage | AWS S3 (`hearloop-audio-prod`, us-east-2), signed URLs |
| STT | Groq `whisper-large-v3-turbo` |
| AI | AWS Bedrock Nova Lite primary → Claude Haiku fallback |
| Infra | EC2 t3.micro (API), Vercel (Web), RDS, ECR |
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
- Partner register/login/dashboard endpoints (bcrypt wired, schema fixed)
- Public capture routes: `GET /public/session/:token/upload-url` + `POST /public/session/:token/finalize`
- Full async pipeline wired: finalize → **validate** → transcribe (Groq) → analyze (Bedrock) → webhook
- HMAC webhook delivery with 7-retry exponential backoff + dead-letter table
- Session expiry cleanup job
- Rate limiting (100 req/min per key)
- All Next.js pages: landing, login/signup, dashboard, capture, docs
- Embeddable `widget.js` (full state machine)
- Next.js API proxy (avoids mixed-content HTTPS issue)
- Docker build context fixed (`-f apps/api/Dockerfile .` from repo root)
- CI/CD GitHub Actions workflow fixed
- Metrics columns in DB: `model_used`, `input_tokens`, `output_tokens`, `processing_started_at`, `processing_completed_at`
- Dashboard API returns `stats.metrics` (avg latency, token totals, estimated cost, model breakdown)
- **End-to-end pipeline verified live**: open → upload-url → finalize → validate → transcribe → analyze → webhook all chained correctly
- `APP_URL` env var on EC2 fixed to `https://hearloop.vercel.app`

### Blocked ⚠️
- **Bedrock daily token quota exhausted** — Nova Lite AND Haiku both return `Too many tokens per day`. Transcript is captured correctly by Groq but `sentiment_label`, `topics`, `model_used` remain null after analysis. Quota increase requested (10M tokens/min for Nova Lite cross-region inference). Also need the **daily** quota increased — search "Bedrock Nova Lite daily" in AWS Service Quotas, request 50M. Session still marks `completed` and webhook still fires — only AI classification output is missing.

### Not Started ❌
- CI/CD push-to-deploy (workflow fixed but not tested end-to-end via git push)
- CloudWatch monitoring + Bedrock invocation logging
- Custom domain + SSL on EC2 (currently proxied via Vercel)
- CORS per-partner `allowed_origins` (currently `*`)
- SSRF protection on webhook URLs
- Dashboard 30s auto-refresh polling
- npm package / React SDK wrapper

---

## Current Blocker

**Bedrock daily token quota** — fix before next session:
1. AWS Console → Service Quotas → search "Bedrock Nova Lite"
2. Find **"Cross-region model inference tokens per day"** → request 50,000,000
3. Also find **Claude Haiku** model access → submit use case form
4. Quota resets daily — tomorrow's test will confirm if existing quota is enough

---

## P1 Next Steps (After Bedrock quota fixed)

1. Run a session end-to-end and verify `analyses` table has `sentiment_label`, `topics`, `model_used`, `input_tokens`, `output_tokens` populated
2. Check `stats.metrics` in dashboard API returns real latency + cost numbers
3. CI/CD: test git push → auto-deploys to EC2
4. Dashboard 30s auto-refresh polling
5. SSRF protection on webhook URLs

---

## Key File Map

```
apps/api/src/
  index.ts              — Fastify server, CORS, auth decorator, worker start
  routes/sessions.ts    — authenticated session lifecycle
  routes/public.ts      — public token resolve/open (MISSING: upload-url, finalize)
  routes/partners.ts    — register/login/dashboard
  lib/claude.ts         — Bedrock Nova Lite + Haiku fallback classifier
  lib/groq.ts           — Whisper transcription wrapper
  lib/queue.ts          — BullMQ queues + workers + enqueue helpers
  lib/storage.ts        — S3 signed URL helpers
  jobs/validate-recording.ts  — bypassed; wire it
  jobs/transcribe.ts    — storage → Groq → store → enqueueAnalyze
  jobs/analyze.ts       — Bedrock → update analysis → complete → enqueueWebhook
  jobs/deliver-webhook.ts     — HMAC webhook + retries

apps/web/
  app/capture/[token]/page.tsx  — hosted capture shell
  components/Recorder.tsx       — BROKEN against backend contract
  public/widget.js              — embeddable widget (exposes API key in browser — OK for demo only)

packages/db/migrations/
  001_initial.sql       — base schema (MISSING partner auth columns)
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

POST   /sessions                          Bearer API key
GET    /sessions/:id                      Bearer API key
GET    /sessions/:id/result               Bearer API key
POST   /sessions/:id/upload-url           Bearer API key
POST   /sessions/:id/finalize             Bearer API key
DELETE /sessions/:id                      Bearer API key

GET    /public/session/:token             public
POST   /public/session/:token/open        public
// MISSING: GET /public/session/:token/upload-url
// MISSING: POST /public/session/:token/finalize
```

---

## Deep-Dive Files

| File | Use when… |
|---|---|
| `context/CATCHUP.md` | Need full context with code details |
| `context/BACKLOG.md` | Planning what to work on next |
| `context/INFRA.md` | Deploying, SSH, env vars, AWS resources |
| `context/DECISIONS.md` | Questioning a tech choice |
| `.cursor/AI_BEDROCK_RUNBOOK.md` | Debugging Bedrock token/quota issues |
| `.cursor/CODE_STYLE.md` | Following project conventions |
