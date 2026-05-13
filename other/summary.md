# Hearloop — Project Summary

## What It Is

Voice feedback infrastructure for businesses. Replaces survey forms with a 5-second tap-and-speak button. Customers tap, speak, submit. Businesses receive structured JSON insights (transcript, sentiment, topics, urgency) via webhook — automatically.

**Analogy:** Typeform surveys + Hotjar feedback + voice input. The business is the beneficiary, not the speaker.

**Target industries:** Automotive service, healthcare, hospitality, retail — anywhere customers interact in person and survey completion rates are below 5%.

---

## Architecture

```
Browser Widget → Hearloop API → S3 → BullMQ → Groq Whisper → AWS Bedrock → Webhook
```

### Backend (apps/api)
- **Runtime:** Node.js 20, TypeScript
- **Framework:** Fastify 4
- **Database:** PostgreSQL (AWS RDS) via Kysely ORM
- **Queue:** BullMQ on AWS ElastiCache Valkey (Redis-compatible)
- **Storage:** AWS S3 (audio files, signed URLs)
- **STT:** Groq Whisper (whisper-large-v3-turbo) — fastest, handles bad phone audio
- **Classification:** AWS Bedrock Nova Lite (primary) + Claude Haiku 4.5 (fallback)
- **Auth:** SHA-256 hashed API keys, scoped session tokens, HMAC webhook signatures
- **Rate limiting:** @fastify/rate-limit, 100 req/min per key (in-memory)
- **Containerized:** Docker, pushed to AWS ECR, running on EC2 t3.micro

### Frontend (apps/web)
- **Framework:** Next.js 15 (App Router)
- **Hosting:** Vercel
- **Proxy:** Next.js API routes proxy EC2 HTTP → HTTPS (mixed content fix)
- **Auth:** localStorage session (partnerId + apiKey)
- **Pages:** Landing, Login/Signup, Dashboard, Capture, Docs

### Infrastructure
- **EC2:** t3.micro, us-east-2, Elastic IP 18.223.189.193
- **RDS:** PostgreSQL 16, db.t3.micro, private subnet
- **ElastiCache:** Valkey 7.2, cache.t3.micro, private subnet
- **S3:** hearloop-audio-prod, us-east-2, private + CORS enabled
- **ECR:** hearloop-api repository, us-east-2
- **Monorepo:** npm workspaces + Turborepo

---

## Key Decisions

| Decision | Choice | Why |
|---|---|---|
| Language | TypeScript (not Python) | Widget is JS; shared types across frontend/backend; Fastify ecosystem |
| STT | Groq Whisper | 216x realtime, free tier, handles bad phone audio |
| Classifier | Nova Lite + Haiku fallback | 7x cheaper than Haiku alone ($0.000066/call vs $0.00045); same JSON classification task |
| Queue | BullMQ dedicated queues per job | Shared queue caused race condition — workers completing jobs without executing handlers |
| Storage | Cloudflare R2 → AWS S3 | Staying in AWS ecosystem for IAM simplicity |
| HTTPS proxy | Next.js API routes | Browser blocks HTTP from HTTPS; avoids domain/SSL setup on EC2 |
| Auth | Hashed API keys | No JWT complexity; stateless; easy to rotate |
| Valkey | Over Redis | AWS recommended, cheaper, 100% API-compatible with BullMQ |

---

## Database Schema

```
partners       — company accounts
api_keys       — sk-live_ keys, SHA-256 hashed, key_prefix for display
sessions       — 9-state machine: created→opened→recording→uploaded→submitted→processing→completed/failed/expired
recordings     — S3 storage key, mime type, size, sha256
analyses       — transcript, sentiment_label, sentiment_score, topics_json, moderation_json
webhook_deliveries — at-least-once delivery, 7 retries, exponential backoff, dead-letter
```

## Job Pipeline

```
finalize → enqueueTranscribe → validate → transcribe (Groq) → store transcript
         → enqueueAnalyze → classify (Nova Lite/Haiku) → update analyses
         → enqueueWebhook → deliver to partner endpoint
         → markCompleted
```

Separate BullMQ queue per job type (hearloop-transcribe, hearloop-analyze, hearloop-webhooks, hearloop-expire-session).

---

## Current State

### Done ✅
- Full REST API (sessions CRUD, upload, finalize, result)
- Public widget routes (token resolution, open, finalize)
- Partner registration + login endpoints
- Async job pipeline (validate → transcribe → analyze → webhook)
- Session state machine with expiry job + S3 cleanup
- Rate limiting (100 req/min)
- HMAC webhook signatures + replay protection
- AWS deployment (EC2 + RDS + ElastiCache + S3 + ECR)
- Docker multi-stage build, ECR push, EC2 pull workflow
- Landing page (hearloop.vercel.app)
- Login/Signup page (real API, localStorage session)
- Dashboard (mock data + real API wired, needs testing)
- Capture page (polished, wired to real API)
- Docs page (quickstart, widget, API, webhooks, errors, browser support)
- Embeddable widget.js (public/, full state machine)
- Next.js proxy (HTTPS fix for mixed content)

### Partially Done ⚠️
- Dashboard real data — endpoint built, frontend wired, **not fully tested end-to-end**
- Login page — company name input bug fixed, **needs redeployment**
- Nova Lite classification — **hitting daily token limit**; Haiku fallback requires use case form approval on Bedrock

### Not Started ❌
- Password hashing (currently stored as plaintext — critical security gap)
- Real webhook verification on partner side
- CI/CD pipeline (manual Docker build/push/pull)
- CloudWatch monitoring + alerts
- Custom domain + HTTPS on EC2 (currently proxied via Vercel)
- Knowledge graph layer (deferred to v2)
- npm package / React SDK wrapper for widget

---

## Open Bugs / Problems

| Bug | Severity | Status |
|---|---|---|
| Passwords stored plaintext in DB | 🔴 Critical | Not fixed |
| Nova Lite daily token limit | 🔴 Blocking | Resets daily; Haiku approval pending |
| Login company name input not wired | 🟡 High | Fix deployed, needs verify |
| EC2 IP changes on restart | 🟢 Fixed | Elastic IP assigned |
| BullMQ shared queue race condition | 🟢 Fixed | Dedicated queues per job |
| SSL cert chain error with RDS | 🟢 Fixed | sslmode removed from connection string |
| Docker ARM→AMD64 mismatch | 🟢 Fixed | --platform linux/amd64 flag |
| Valkey eviction policy warning | 🟡 Low | Set maxmemory-policy to noeviction |

---

## Immediate Next Steps

1. **Hash passwords** — bcrypt on register, compare on login (critical before any real users)
2. **Test full end-to-end** — sign up → create session → capture audio → check dashboard shows real data
3. **Fix Nova Lite / Haiku** — submit Bedrock use case form, wait for approval
4. **CI/CD** — GitHub Actions: on push to main → build Docker → push ECR → pull on EC2
5. **Custom domain** — point domain to EC2, add SSL via Nginx + Let's Encrypt, remove Vercel proxy
6. **Dashboard polling** — auto-refresh sessions every 30s so new feedback appears without page reload

---

## Live URLs

| | URL |
|---|---|
| Web | https://hearloop.vercel.app |
| API | http://18.223.189.193:3001 |
| Health | http://18.223.189.193:3001/health |
| SSH | `ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193` |
| GitHub | https://github.com/shubh209/Hearloop |

## Test Credentials

```
API key (test partner): sk-test-hearloop-1234567890abcdef
Partner ID: 7a9e3e2c-07e8-4dae-a133-dd9caa0cad2b
```

---

## Cost Estimate (Current)

| Service | Monthly |
|---|---|
| EC2 t3.micro | ~$8 (free tier year 1) |
| RDS t3.micro | ~$15 (free tier year 1) |
| ElastiCache t3.micro | ~$12 (free tier year 1) |
| S3 | ~$0.023/GB |
| Nova Lite AI | ~$0.000066/session |
| Groq STT | Free tier |
| Vercel | Free tier |
| **Total (after free tier)** | **~$35/month** |
