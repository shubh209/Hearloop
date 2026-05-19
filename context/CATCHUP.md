# Hearloop — Full Session Catchup

> This file is the complete context dump for a new AI session. Read `AGENTS.md` at the repo root for the compact version. Read this file when you need code-level detail.

Last updated: May 19, 2026

---

## Product

**Hearloop** — voice micro-feedback infrastructure for businesses. Customers tap a widget, speak for 5 seconds, done. The platform transcribes, classifies, and delivers structured insights to the business partner via webhook.

```
Browser Widget → POST /sessions → S3 upload (signed URL) → finalize
  → BullMQ → validate → transcribe (Groq Whisper) → analyze (Bedrock Nova Lite)
  → store analysis → deliver webhook (HMAC signed, 7 retries)
```

Insights delivered per session: `transcript`, `sentiment_label`, `sentiment_score`, `topics[]`, `urgency`, `summary`, `quality_flags`, `moderation_flags`.

Topic taxonomy: `staff_friendliness`, `wait_time`, `service_quality`, `price`, `cleanliness`, `ease_of_booking`, `communication`, `professionalism`, `speed`, `other`.

---

## Monorepo Structure

```
/
├── apps/
│   ├── api/          — Fastify backend (Node.js 20, TypeScript, CommonJS)
│   └── web/          — Next.js 15 App Router frontend (React 19)
├── packages/
│   ├── db/migrations/ — SQL migration files (001–005; 005 not yet applied to Neon)
│   └── types/         — empty placeholder
├── context/           — AI session context files
├── AGENTS.md          — compact 1-page session primer
├── .env               — local reference copy of EC2 env vars (gitignored)
├── package.json       — npm workspace root
└── turbo.json         — Turborepo build orchestration
```

---

## Infrastructure (as of May 19, 2026)

**AWS (us-east-2):**
- EC2 t3.micro — API container, Elastic IP `18.223.189.193`, port 3001
- S3 `hearloop-audio-prod` — private, CORS enabled, ~94 MB
- ECR `hearloop-api` — Docker images, lifecycle policy active

**Free external services:**
- **Neon** — PostgreSQL 16, serverless, auto-pauses when idle
- **Upstash** — Redis, serverless, BullMQ-compatible
- **Vercel** — Web frontend
- **Groq** — Whisper STT (free tier)

**Deleted:** RDS, ElastiCache, CloudWatch RDSOSMetrics log group
**Monthly cost: ~$9.60/month** (was $35)

---

## Backend Deep Dive (`apps/api`)

### Entry Point (`index.ts`)
- Calls `validateEnv()` from `lib/env.ts` as the very first line
- Starts Fastify with `logger: true` (Pino)
- CORS: `Access-Control-Allow-Origin: *` globally; narrowed to specific origin if partner has `allowed_origins` set
- Rate limit: 100 req/min per API key prefix or IP
- Auth decorator: SHA-256 hashes Bearer token, looks up in `api_keys`, attaches `req.partner` including `businessContext`
- Routes: `/v1/partners`, `/v1/sessions`, `/v1/public`
- Workers: all BullMQ workers started on boot via `startWorkers()` with `workersStarted` guard

### Database (`lib/db.ts`)
Kysely + `pg`. Connects to **Neon** via `DATABASE_URL`. Tables:

| Table | Purpose |
|---|---|
| `partners` | company accounts — id, name, email, password_hash, status, webhook_url, allowed_origins, business_context |
| `api_keys` | `sk-live_` prefixed keys, SHA-256 hashed, `key_prefix` for display |
| `sessions` | 9-state machine, public `token`, `expires_at`, processing timestamps |
| `recordings` | S3 key, mime type, size, sha256 hash |
| `analyses` | transcript, sentiment, topics (JSONB), moderation (JSONB), model_used, token counts |
| `webhook_deliveries` | attempt tracking, status, next retry time |
| `session_create_tokens` | short-lived tokens for widget session creation (10-min TTL, single-use) |

### Routes

**`routes/partners.ts`**
- `POST /partners/register` — bcrypt hash (12 rounds), creates partner + api_key, **returns raw key once only**
- `POST /partners/login` — bcrypt compare, returns `{ partnerId, name, keyPrefix }`
- `GET /partners/:id/dashboard` — sessions + analyses + stats (sentiment breakdown, topic map, urgency counts, metrics)
- `PATCH /partners/:id/settings` — update `webhook_url`, `allowed_origins`, and/or `business_context` (capped at 500 chars)

**`routes/sessions.ts`** (Bearer API key required)
- `POST /sessions` — creates session row, generates public token
- `GET /sessions/:id` — returns session state
- `POST /sessions/:id/upload-url` — returns S3 pre-signed PUT URL
- `POST /sessions/:id/finalize` — transitions to processing, enqueues validate
- `GET /sessions/:id/result` — returns analysis JSON
- `DELETE /sessions/:id` — deletes session + S3 object

**`routes/public.ts`** (no auth)
- `GET /public/session/:token` — resolves public token to session config
- `POST /public/session/:token/open` — marks session opened
- `GET /public/session/:token/upload-url` — returns signed S3 PUT URL
- `POST /public/session/:token/finalize` — submits for processing
- `POST /public/sessions/create-token` — accepts API key, returns 10-min TTL session-create token
- `POST /public/sessions` — creates session using Bearer session-create token

### Async Pipeline (`lib/queue.ts` + `jobs/`)

Dedicated BullMQ queue per job type:
- `hearloop-validate`, `hearloop-transcribe`, `hearloop-analyze`, `hearloop-webhooks`, `hearloop-expire-session`

Worker config (free-tier safe):
```typescript
{
  concurrency: 2,           // 5 for webhook worker
  stalledInterval: 600_000, // 10 min
  lockDuration: 120_000,    // 2 min
  drainDelay: 600,          // 10 min idle poll — ~6–8K Redis cmds/day
}
```

Pipeline:
```
finalize → enqueueValidate → validate-recording.ts → enqueueTranscribe
  → transcribe.ts → enqueueAnalyze → analyze.ts → enqueueWebhook → deliver-webhook.ts
```

**`jobs/validate-recording.ts`** — checks MIME type, audio header, file size.

**`jobs/transcribe.ts`** — fetches audio from S3, calls Groq Whisper, creates `analyses` row with transcript, calls `enqueueAnalyze`.

**`jobs/analyze.ts`** — fetches `partners.business_context` from DB for the session's partner, calls `lib/claude.ts` with context, updates `analyses` row, marks session `completed`, calls `enqueueWebhook`. Falls back gracefully if context fetch fails.

**`jobs/deliver-webhook.ts`** — validates URL with SSRF guard (HTTPS only, blocks RFC1918/loopback/169.254.x.x), sends POST with HMAC-SHA256 signature, retries up to 7 times with exponential backoff.

### AI Classification (`lib/claude.ts`)

- Bedrock client: `BEDROCK_REGION` (us-east-2)
- Primary: `us.amazon.nova-lite-v1:0`
- Fallback: `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- `inferenceConfig.maxTokens: 120`, `temperature: 0.0`
- Transcript capped at 800 chars
- **Business context injection**: if `options.businessContext` is provided, prepends it to the user message before the transcript. Both `invokeNovaLite` and `invokeHaiku` accept a pre-built `userMessage` string.
- Returns `inputTokens`, `outputTokens` from Bedrock response
- **CURRENT BLOCKER**: daily token quota exhausted for both models. Quota increase case open with AWS.

---

## Frontend Deep Dive (`apps/web`)

### Pages
| Route | File | Status |
|---|---|---|
| `/` | `app/page.tsx` | Working |
| `/login` | `app/login/page.tsx` | Working + API key reveal modal on signup |
| `/dashboard` | `app/dashboard/page.tsx` | Real API wired, 30s auto-refresh, missing-key banner |
| `/docs` | `app/docs/page.tsx` | Working |
| `/capture/[token]` | `app/capture/[token]/page.tsx` | Working |

### Auth Flow
- **Signup**: `POST /partners/register` → modal shows key once → localStorage stores `{ partnerId, name, apiKey }`
- **Login**: `POST /partners/login` → no full key returned → amber banner if apiKey null in localStorage
- **Session storage**: `localStorage` key `hl_session` — not production-safe (V2: httpOnly cookies)

### Widget (`apps/web/public/widget.js`)
- Vanilla JS IIFE, exposes `window.Hearloop`
- Flow: POST create-token → POST /public/sessions → open → upload-url → PUT S3 → finalize

### API Proxy (`apps/web/app/api/[...path]/route.ts`)
Forwards `/api/*` → `http://18.223.189.193:3001/v1/*`. Solves HTTPS→HTTP mixed-content.

---

## Known Issues / Security Debt

| Issue | Priority | Status |
|---|---|---|
| localStorage auth on dashboard | P2 | Open — V2 fix: httpOnly cookies |
| Custom domain + SSL on EC2 | P2 | Open — currently proxied via Vercel |
| CloudWatch monitoring | P2 | Open |
| Observability endpoint `/health/detailed` | P2 | Open — next recommended feature |

---

## CI/CD

GitHub Actions workflow (`.github/workflows/docker-image.yml`):
1. Configure AWS credentials
2. Dynamically add runner IP to EC2 security group (port 22)
3. Login to ECR
4. `docker build --platform linux/amd64 -f apps/api/Dockerfile .`
5. Push to ECR
6. SSH to EC2: ECR login → pull → stop/rm old container → start new
7. Health check `curl http://18.223.189.193:3001/health`
8. Revoke runner IP from security group (`if: always()`)

Total time: ~1 minute.

---

## Pending Action Before Next Deploy

Migration 005 must be applied manually to Neon before deploying:
```sql
ALTER TABLE partners ADD COLUMN business_context TEXT;
```
Connect via: `psql $DATABASE_URL` or Neon console SQL editor.

---

## Monthly Cost Summary

| Service | Cost |
|---|---|
| EC2 t3.micro | ~$8.00 |
| EBS 20GB gp3 | ~$1.60 |
| S3 (94 MB audio) | ~$0.002 |
| Neon / Upstash / Vercel / ECR | $0 (free tiers) |
| **Total** | **~$9.60/month** |

Credits remaining: ~$148 → ~15 months of runway.
