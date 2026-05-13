# Hearloop — Full Session Catchup

> This file is the complete context dump for a new AI session. Read `AGENTS.md` at the repo root for the compact version. Read this file when you need code-level detail.

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
│   ├── db/migrations/ — SQL migration files
│   └── types/         — empty, placeholder
├── other/             — marketing copy, networking notes, static mocks
├── context/           — this folder: AI session context (IDE-agnostic)
├── AGENTS.md          — compact 1-page session primer (root, auto-read by most AI tools)
├── package.json       — npm workspace root
├── turbo.json         — Turborepo build orchestration
└── voice_micro_feedback_sdk_api_spec.pdf — original product/API spec
```

---

## Backend Deep Dive (`apps/api`)

### Entry Point
`apps/api/src/index.ts` — starts Fastify, registers:
- `@fastify/cors` — currently `origin: '*'` (too permissive; needs per-partner origins)
- `@fastify/rate-limit` — 100 req/min per IP/key, in-memory
- Auth decorator: checks `Authorization: Bearer <key>`, hashes with SHA-256, looks up in `api_keys` table, attaches `partnerId` to request
- Routes: `/v1/partners`, `/v1/sessions`, `/v1/public`
- Workers: starts all BullMQ workers on startup

### Database (`apps/api/src/lib/db.ts`)
Kysely + `pg`. Tables:

| Table | Purpose |
|---|---|
| `partners` | company accounts — **MISSING `email` and `password_hash` columns in 001 migration** |
| `api_keys` | `sk-live_` prefixed keys, SHA-256 hashed, `key_prefix` for display |
| `sessions` | 9-state machine, public `token`, `expires_at` |
| `recordings` | S3 key, mime type, size in bytes, sha256 hash |
| `analyses` | transcript, sentiment, topics (JSONB), moderation (JSONB) |
| `webhook_deliveries` | attempt tracking, status, next retry time |

### Routes

**`routes/partners.ts`**
- `POST /v1/partners/register` — inserts partner + api_key. **BUG: inserts `email` + `password_hash` but migration has no those columns. Also password is stored plaintext — bcrypt is imported but not used.**
- `POST /v1/partners/login` — queries by email. Same schema drift issue.
- `GET /v1/partners/:id/dashboard` — returns sessions + analyses for partner

**`routes/sessions.ts`** (all require Bearer API key)
- `POST /v1/sessions` — creates session row, generates public token
- `GET /v1/sessions/:id` — returns session state
- `POST /v1/sessions/:id/upload-url` — returns S3 pre-signed PUT URL
- `POST /v1/sessions/:id/finalize` — transitions to submitted/processing, enqueues transcribe
- `GET /v1/sessions/:id/result` — returns analysis JSON
- `DELETE /v1/sessions/:id` — deletes session + S3 object

**`routes/public.ts`** (no auth)
- `GET /v1/public/session/:token` — resolves public token to session config
- `POST /v1/public/session/:token/open` — marks session opened
- **MISSING: `GET /v1/public/session/:token/upload-url`** — needed by Recorder.tsx
- **MISSING: `POST /v1/public/session/:token/finalize`** — needed by Recorder.tsx

### Async Pipeline (`apps/api/src/lib/queue.ts` + `jobs/`)

BullMQ with **one dedicated queue per job type** (previously shared queue caused race conditions):
- `hearloop-transcribe`
- `hearloop-analyze`
- `hearloop-webhooks`
- `hearloop-expire-session`
- `hearloop-validate`

Pipeline (fully wired as of May 13, 2026):
```
finalize → enqueueValidate → validate-recording.ts → enqueueTranscribe → transcribe.ts → enqueueAnalyze → analyze.ts → enqueueWebhook → deliver-webhook.ts
```

**`jobs/validate-recording.ts`** — checks MIME type, audio header, file size. Passes → enqueues transcribe. Fails → marks session `failed` with reason.

**`jobs/transcribe.ts`** — fetches audio from S3, calls Groq Whisper, creates `analyses` row with transcript, calls `enqueueAnalyze`.

**`jobs/analyze.ts`** — calls `lib/claude.ts` classifier, updates `analyses` row with structured output, marks session `completed`, calls `enqueueWebhook`.

**`jobs/deliver-webhook.ts`** — reads partner webhook URL, sends POST with HMAC-SHA256 signature header (`X-Hearloop-Signature`), persists attempt to `webhook_deliveries`, retries up to 7 times with exponential backoff.

**`jobs/expire-session.ts`** — marks expired sessions, deletes S3 object.

### AI Classification (`apps/api/src/lib/claude.ts`)

- Bedrock client: `BEDROCK_REGION` or `us-east-2`
- Primary: `us.amazon.nova-lite-v1:0`
- Fallback: `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- `inferenceConfig.maxTokens: 120` — fixed (was `max_new_tokens`, silently ignored)
- Transcript capped at 800 chars before classification
- Returns `inputTokens`, `outputTokens` from Bedrock response usage field
- **CURRENT BLOCKER**: daily token quota exhausted for both models — `"Too many tokens per day"`. Quota increase requested in AWS Service Quotas. Resets daily.

---

## Frontend Deep Dive (`apps/web`)

### Pages
| Route | File | Status |
|---|---|---|
| `/` | `app/page.tsx` | Working |
| `/login` | `app/login/page.tsx` | Working (company name bug fixed, needs redeploy) |
| `/dashboard` | `app/dashboard/page.tsx` | Real API wired, not fully tested E2E |
| `/docs` | `app/docs/page.tsx` | Working |
| `/capture/[token]` | `app/capture/[token]/page.tsx` | Shell works, Recorder.tsx broken |

### Recorder.tsx (`apps/web/components/Recorder.tsx`)
**Currently broken.** Does:
1. `POST /v1/public/session/:token/open` ✅ route exists
2. `POST /v1/sessions/:token/upload-url` ❌ wrong — needs Bearer auth, uses session ID not token
3. `POST /v1/public/session/:token/finalize` ❌ route doesn't exist

Fix: add the two missing public routes to the backend, update `Recorder.tsx` to call them.

### Widget (`apps/web/public/widget.js`)
Embeddable IIFE. Exposes `window.Hearloop`. Config: `{ apiKey, partnerId, containerId, ... }`.
**Security issue**: `apiKey` is the partner secret key — exposed in browser. Acceptable for demo only. Production needs public-key + scoped session token flow.

Widget flow:
1. `POST /v1/sessions` with Bearer apiKey
2. `GET /v1/public/session/:token` to open
3. `POST /v1/sessions/:sessionId/upload-url` with Bearer
4. PUT to S3 signed URL
5. `POST /v1/sessions/:sessionId/finalize` with Bearer

### API Proxy (`apps/web/app/api/[...path]/route.ts`)
Forwards all `/api/*` requests to `http://18.223.189.193:3001/v1/*`. Solves mixed-content HTTPS issue (Vercel is HTTPS, EC2 is HTTP).

### Auth
`localStorage` key `hl_session` stores `{ partnerId, apiKey }`. Not production-safe. Should use httpOnly cookies.

---

## Infrastructure

| Resource | Details |
|---|---|
| EC2 | t3.micro, us-east-2, Elastic IP `18.223.189.193`, port 3001 |
| RDS | PostgreSQL 16, db.t3.micro, private subnet, no sslmode in connection string |
| ElastiCache | Valkey 7.2, cache.t3.micro, private subnet |
| S3 | `hearloop-audio-prod`, us-east-2, private + CORS enabled |
| ECR | `hearloop-api` repository, us-east-2 |
| Vercel | Web frontend, free tier |

### Deployment Flow (current — manual)
1. `docker build --platform linux/amd64 -f apps/api/Dockerfile -t hearloop-api .` (from repo root)
2. Tag + push to ECR
3. SSH to EC2, pull image, restart container

CI workflow fixed: now uses `docker build --platform linux/amd64 -f apps/api/Dockerfile -t IMAGE .` from repo root.

---

## Known Issues Summary

### Current Blocker
| Issue | Status |
|---|---|
| Bedrock daily token quota exhausted (Nova Lite + Haiku) | Quota increase requested; resets daily |

### P0 — All Fixed ✅ (May 13, 2026)
| Issue | Fix Applied |
|---|---|
| Hosted capture upload/finalize routes missing | Added to `routes/public.ts`, fixed `Recorder.tsx` |
| Partner auth columns missing in DB | Migration 002 created + run on RDS |
| Passwords stored plaintext | bcrypt already wired; schema fix unblocked it |
| Docker build context wrong | Fixed in `docker-image.yml` |
| Bedrock `max_new_tokens` → `maxTokens` | Fixed + 800-char transcript cap added |
| Validation job bypassed | `enqueueValidate` wired, pipeline verified live |
| Metrics columns missing | Migration 003 created + run on RDS |

### P1 — Security / Reliability
| Issue | Fix |
|---|---|
| Browser widget exposes secret API key | Introduce public-key + scoped session token flow |
| Permissive CORS `*` | Enforce `partners.allowed_origins` per partner |
| No webhook SSRF protection | Block private IPs, restrict to HTTPS |
| LocalStorage auth on dashboard | Use httpOnly cookies |

### P2 — Maintainability
| Issue | Fix |
|---|---|
| Huge inline CSS in TSX pages | Extract design tokens + components |
| Multiple package-lock.json files | Keep only root lockfile |
| Stale `.cursor/` docs | Replace with this context pack |

---

## Test Credentials

```
API key (verified working): sk-live_0953df6cd9b248a8ae55e11635ff03801c91f2e062542a61
Partner ID: fd843d77-994b-44f9-b375-e3394b4361e8
Email: verify@test.com
```

---

## Cost (Monthly After Free Tier)

| Service | Cost |
|---|---|
| EC2 t3.micro | ~$8 |
| RDS t3.micro | ~$15 |
| ElastiCache t3.micro | ~$12 |
| S3 | ~$0.023/GB |
| Nova Lite | ~$0.000066/session |
| Groq STT | Free tier |
| Vercel | Free tier |
| **Total** | **~$35/month** |
