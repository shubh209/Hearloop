# Hearloop — Full Session Catchup

> This file is the complete context dump for a new AI session. Read `AGENTS.md` at the repo root for the compact version. Read this file when you need code-level detail.

Last updated: May 16, 2026

---

## Product

**Hearloop** — voice micro-feedback infrastructure for businesses. Customers tap a widget, speak for 5 seconds, done. The platform transcribes, classifies, and delivers structured insights to the business partner via webhook.

```
Browser Widget → POST /sessions → S3 upload (signed URL) → finalize
  → BullMQ → validate → transcribe (Groq Whisper) → analyze (Bedrock Nova Lite)
  → store analysis → deliver webhook (HMAC signed, 7 retries)
```

Insights delivered per session: `transcript`, `sentiment_label`, `sentiment_score`, `topics[]`, `urgency`, `summary`, `quality_flags`, `moderation_flags`.

Fixed topic taxonomy: `staff_friendliness`, `wait_time`, `service_quality`, `facility_cleanliness`, `pricing_value`, `communication`, `product_quality`, `appointment_scheduling`.

---

## Monorepo Structure

```
/
├── apps/
│   ├── api/          — Fastify backend (Node.js 20, TypeScript, CommonJS)
│   └── web/          — Next.js 15 App Router frontend (React 19)
├── packages/
│   ├── db/migrations/ — SQL migration files (001, 002, 003 all applied on Neon)
│   └── types/         — empty placeholder
├── context/           — AI session context files
├── AGENTS.md          — compact 1-page session primer
├── .env               — local reference copy of EC2 env vars (gitignored)
├── package.json       — npm workspace root
└── turbo.json         — Turborepo build orchestration
```

---

## Infrastructure (as of May 16, 2026)

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
- Calls `validateEnv()` from `lib/env.ts` as the very first line — exits with clear error if any required var is missing
- Starts Fastify with `logger: true` (Pino)
- CORS: currently `Access-Control-Allow-Origin: *` (per-partner origins is a P1 backlog item)
- Rate limit: 100 req/min per API key prefix or IP
- Auth decorator: SHA-256 hashes Bearer token, looks up in `api_keys`, attaches `req.partner`
- Routes: `/v1/partners`, `/v1/sessions`, `/v1/public`
- Workers: all BullMQ workers started on boot

### Database (`lib/db.ts`)
Kysely + `pg`. Connects to **Neon** via `DATABASE_URL`. Tables:

| Table | Purpose |
|---|---|
| `partners` | company accounts — id, name, email, password_hash, status, webhook_url |
| `api_keys` | `sk-live_` prefixed keys, SHA-256 hashed, `key_prefix` for display |
| `sessions` | 9-state machine, public `token`, `expires_at`, processing timestamps |
| `recordings` | S3 key, mime type, size, sha256 hash |
| `analyses` | transcript, sentiment, topics (JSONB), moderation (JSONB), model_used, token counts |
| `webhook_deliveries` | attempt tracking, status, next retry time |

### Routes

**`routes/partners.ts`**
- `POST /partners/register` — bcrypt hash (12 rounds), creates partner + api_key, **returns raw key once only**
- `POST /partners/login` — bcrypt compare, returns `{ partnerId, name, keyPrefix }` — full key not returned (only hashed in DB)
- `GET /partners/:id/dashboard` — sessions + analyses + stats (sentiment breakdown, topic map, urgency counts, metrics)

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

### Async Pipeline (`lib/queue.ts` + `jobs/`)

Dedicated BullMQ queue per job type (shared queue caused race conditions — now fixed):
- `hearloop-validate`, `hearloop-transcribe`, `hearloop-analyze`, `hearloop-webhooks`, `hearloop-expire-session`

Pipeline:
```
finalize → enqueueValidate → validate-recording.ts → enqueueTranscribe
  → transcribe.ts → enqueueAnalyze → analyze.ts → enqueueWebhook → deliver-webhook.ts
```

**`jobs/validate-recording.ts`** — checks MIME type, audio header, file size. Passes → enqueueTranscribe. Fails → marks session `failed`.

**`jobs/transcribe.ts`** — fetches audio from S3, calls Groq Whisper, creates `analyses` row with transcript, calls `enqueueAnalyze`.

**`jobs/analyze.ts`** — calls `lib/claude.ts` classifier, updates `analyses` row with structured output, marks session `completed`, calls `enqueueWebhook`.

**`jobs/deliver-webhook.ts`** — validates URL with SSRF guard (HTTPS only, blocks RFC1918/loopback/169.254.x.x), sends POST with HMAC-SHA256 signature, persists attempt to `webhook_deliveries`, retries up to 7 times with exponential backoff.

### AI Classification (`lib/claude.ts`)

- Bedrock client: `BEDROCK_REGION` (us-east-2)
- Primary: `us.amazon.nova-lite-v1:0`
- Fallback: `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- `inferenceConfig.maxTokens: 120`
- Transcript capped at 800 chars before classification
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
- **Signup**: `POST /partners/register` → gets `{ partnerId, name, apiKey }` → modal shows key once → user copies → redirect to dashboard → localStorage stores `{ partnerId, name, apiKey }`
- **Login**: `POST /partners/login` → gets `{ partnerId, name, keyPrefix }` → no full key returned → if apiKey null in localStorage, dashboard shows amber banner with paste input
- **Session storage**: `localStorage` key `hl_session` — not production-safe (should use httpOnly cookies in V2)

### Dashboard (`app/dashboard/page.tsx`)
- Fetches `/partners/:id/dashboard` on load + every 30 seconds
- If `apiKey` is null: shows amber banner with password input to paste key + save
- Falls back to hardcoded mock data if no real data (makes UI look good during demos)
- Shows: metrics, recent sessions table, topic bars, sentiment donut, location performance

### Widget (`apps/web/public/widget.js`)
- Vanilla JS IIFE, exposes `window.Hearloop`
- **Security**: `apiKey` in browser config — acceptable for demo only
- Flow: POST /sessions → open → upload-url → PUT S3 → finalize

### API Proxy (`apps/web/app/api/[...path]/route.ts`)
Forwards `/api/*` → `http://18.223.189.193:3001/v1/*`. Solves HTTPS→HTTP mixed-content.

---

## Known Issues / Security Debt

| Issue | Priority | Fix |
|---|---|---|
| Widget exposes secret API key in browser | P1 | Introduce public-key + scoped session token |
| CORS is `*` (not per-partner) | P1 | Add `allowed_origins` to partners table |
| localStorage auth on dashboard | P2 | Use httpOnly cookies |
| Inline `<style>` blocks in all TSX pages | P2 | Extract design tokens |

---

## CI/CD

GitHub Actions workflow (`.github/workflows/docker-image.yml`):
1. Configure AWS credentials
2. **Dynamically add runner IP to EC2 security group** (port 22)
3. Login to ECR
4. `docker build --platform linux/amd64 -f apps/api/Dockerfile .`
5. Push to ECR
6. SSH to EC2: ECR login → pull → stop/rm old container → start new
7. Health check `curl http://18.223.189.193:3001/health`
8. **Revoke runner IP from security group** (`if: always()`)

Total time: ~1 minute. Fully verified working.

---

## Test Credentials (Neon — fresh DB, needs re-registration)

Database is fresh after Neon migration. Register a new account at https://hearloop.vercel.app/login.

Previous test API key (RDS, no longer valid):
```
sk-live_0953df6cd9b248a8ae55e11635ff03801c91f2e062542a61
Partner ID: fd843d77-994b-44f9-b375-e3394b4361e8
Email: verify@test.com
```

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
