# Hearloop: AI Assistant Instructions

**Read this file first in every session to avoid redundant codebase exploration.**

## Project Overview
- **Name:** Hearloop
- **Type:** Voice micro-feedback platform
- **Core:** Embeddable JS widget → 5-sec voice recordings → API → webhook delivery with transcript, sentiment, topics, urgency
- **Architecture:** Monorepo (Turbo), multi-tenant SaaS

## Tech Stack

### Backend (`apps/api/`)
- **Runtime:** Node.js + TypeScript
- **Server:** Fastify
- **Database:** PostgreSQL (Supabase)
- **Queue:** BullMQ (Upstash Redis)
- **Storage:** Cloudflare R2 (AWS SDK S3-compatible)
- **AI:** Groq (STT/Whisper) + Claude Haiku (classification)
- **ORM:** Kysely (type-safe SQL)
- **Build:** tsc → `dist/`

### Frontend (`apps/web/`)
- **Framework:** Next.js 15 + React 19
- **Widget:** Vanilla JS (`components/widget.js`) + React wrapper
- **Widget Deployment:** CDN (partner embeds `<script>`)
- **Auth:** Session tokens + HMAC webhook validation

### Monorepo Structure
```
apps/
  api/        # Fastify server + job queue
  web/        # Next.js: capture page + widget
packages/
  db/         # Migrations (PostgreSQL)
  types/      # Shared TypeScript types
```

## Architecture Patterns

### Session State Machine
```
created → processing → completed
```
- Webhook delivery happens in `processing` or `completed`
- Session tokens are scoped (single widget can't access other partners' sessions)

### Auth Strategy
- **Partners:** Secret API keys (for server-to-server)
- **Widget:** Session tokens (scoped to single session)
- **Webhooks:** HMAC signing (partner validates with their secret)

### Topic Taxonomy (Fixed Enum)
Staff friendliness, wait time, service quality, facility cleanliness, product availability, pricing, other

## API Routes (`apps/api/src/routes/`)
- `public.ts` - Widget endpoints (health, transcribe callback, session crud)
- `sessions.ts` - Partner CRUD (requires API key)

## Job Processors (`apps/api/src/jobs/`)
- `transcribe.ts` - Groq Whisper → text
- `analyze.ts` - Claude Haiku → sentiment/topics/urgency
- `deliver-webhook.ts` - Send webhook with HMAC
- `validate-recording.ts` - Pre-queue validation

## Key Files

| File | Purpose |
|------|---------|
| `apps/api/src/index.ts` | Fastify server setup, route registration |
| `apps/api/src/lib/groq.ts` | Groq SDK wrapper (Whisper) |
| `apps/api/src/lib/claude.ts` | Claude SDK wrapper (strict JSON schema) |
| `apps/api/src/lib/queue.ts` | BullMQ queue setup |
| `apps/api/src/lib/db.ts` | Kysely database instance |
| `apps/api/src/lib/storage.ts` | Cloudflare R2 uploader |
| `apps/web/app/capture/[token]/page.tsx` | Session capture page (dynamic route) |
| `apps/web/components/widget.js` | Core widget (loaded via CDN) |
| `packages/db/migrations/001_initial.sql` | Schema (Supabase) |

## Common Tasks

### Adding a New Job
1. Create file in `apps/api/src/jobs/my-job.ts`
2. Export async handler: `export async function myJob(job: Job)`
3. Register in queue.ts: `queue.add('my-job', handler)`
4. Emit from routes via `queue.add()`

### Adding a New Route
1. Create in `apps/api/src/routes/my-route.ts`
2. Export handler: `export async function setupMyRoute(app)`
3. Register in `index.ts`: `await setupMyRoute(app)`

### Adding Schema Columns
1. Create migration in `packages/db/migrations/00X_*.sql`
2. Update Kysely types in `packages/types/` (auto-generated or manual)
3. Update type definitions as needed

## Conventions

- **Imports:** Relative paths within same package, absolute `@hearloop/` for cross-package
- **Environment:** `.env.local` (Next.js), process.env (Fastify) — use Supabase, Upstash, Cloudflare dashboards
- **Error Handling:** Fastify error handler + job retry logic (BullMQ)
- **Async:** Always async/await, no callbacks
- **JSON Schemas:** Claude responses use `{"type": "object", "properties": {...}, "required": [...]}` for strict parsing
- **Type Safety:** No `any`, prefer `unknown` with guards

## Testing & Debugging
- **Dev Server:** `npm run dev` (turbo parallel dev)
- **Build:** `npm run build` (tsc + next build)
- **Widget Testing:** Embed `localhost:3000/widget.js` in test HTML
- **Job Queue:** Logs in Redis/Upstash console; BullMQ UI optional

## Deployment
- **API:** Vercel serverless (currently using index.ts → Fastify)
- **Web:** Vercel (Next.js)
- **Database:** Supabase managed
- **Queue:** Upstash managed Redis
- **Storage:** Cloudflare R2 bucket

## Quick Reference Commands
```bash
# Install & dev
npm install
npm run dev

# Build
npm run build

# Run production
npm run start (from api)
npm start (from web)
```

---

**Last Updated:** April 2026  
**For questions on specific modules:** Check file headers and adjacent `lib/` files.
