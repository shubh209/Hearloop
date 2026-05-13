# Hearloop Project Context

## Product

Hearloop is a developer-facing voice micro-feedback infrastructure product. It replaces long survey forms with a 5-second tap-and-speak capture flow. Businesses receive structured JSON: transcript, sentiment, score, topics, urgency, summary, quality flags, and moderation flags.

Target users: businesses with in-person customer interactions, especially automotive service, healthcare, hospitality, and retail.

Primary integration modes:

- Embeddable `widget.js`
- Hosted capture page `/capture/[token]`
- REST API for partner backend integration
- Webhooks for completed analysis events

## Monorepo

Root uses npm workspaces and Turborepo.

- `apps/api`: Fastify API, workers, Kysely DB layer, S3/R2 storage, BullMQ queues, Groq STT, Bedrock classification.
- `apps/web`: Next.js 15 app router frontend: landing page, login/signup, dashboard, docs, capture page, API proxy, static widget asset.
- `packages/db/migrations`: SQL schema migration.
- `packages/types`: currently empty.
- `.cursor`: AI assistant context files. Current ones are stale.
- `other`: marketing notes, networking copy, project summary, static automotive dashboard mock.
- `voice_micro_feedback_sdk_api_spec.pdf`: original product/API spec.

## Backend stack

- Node.js 20, TypeScript, CommonJS build target
- Fastify 4 in `apps/api`
- PostgreSQL via Kysely and `pg`
- BullMQ + ioredis for async jobs
- S3-compatible storage via AWS SDK S3 client
- Groq `whisper-large-v3-turbo` for transcription
- AWS Bedrock Runtime with Amazon Nova Lite primary and Claude Haiku fallback in `apps/api/src/lib/claude.ts`
- Bcrypt used in current partner registration/login code
- HMAC webhook signatures in `jobs/deliver-webhook.ts`

## Frontend stack

- Next.js 15 app router
- React 19
- Plain CSS inside TSX files; no component library
- Vanilla JS embeddable widget at `apps/web/public/widget.js`
- Partner session data stored in localStorage as `hl_session`

## Current implemented routes

Backend prefix is `/v1`.

Partner auth:

- `POST /v1/partners/register`
- `POST /v1/partners/login`
- `GET /v1/partners/:id/dashboard` with Bearer API key

Session API:

- `POST /v1/sessions` with Bearer API key
- `GET /v1/sessions/:id` with Bearer API key
- `GET /v1/sessions/:id/result` with Bearer API key
- `POST /v1/sessions/:id/upload-url` with Bearer API key
- `POST /v1/sessions/:id/finalize` with Bearer API key
- `DELETE /v1/sessions/:id` with Bearer API key

Public token API:

- `GET /v1/public/session/:token`
- `POST /v1/public/session/:token/open`

There is currently no public upload-url or finalize route, even though the hosted capture page tries to call them.

## Async pipeline

Intended pipeline from spec:

`finalize -> validate-recording -> transcribe -> analyze -> deliver-webhook`

Actual code path in `routes/sessions.ts` currently does:

`finalize -> enqueueTranscribe -> transcribe -> enqueueAnalyze -> analyze -> enqueueWebhook`

`validate-recording.ts` exists and a worker is started, but finalize does not enqueue it. That means validation is mostly dead code right now.

## Core business logic files

- `apps/api/src/index.ts`: Fastify server, CORS, rate limit, route registration, worker startup.
- `apps/api/src/routes/sessions.ts`: authenticated session lifecycle.
- `apps/api/src/routes/public.ts`: public token resolve/open only.
- `apps/api/src/routes/partners.ts`: register/login/dashboard.
- `apps/api/src/lib/queue.ts`: BullMQ queues and workers.
- `apps/api/src/lib/claude.ts`: Bedrock Nova Lite + Haiku fallback classifier.
- `apps/api/src/lib/groq.ts`: Whisper transcription wrapper.
- `apps/api/src/lib/storage.ts`: signed URLs, S3/R2 get/put/delete.
- `apps/api/src/jobs/*.ts`: transcribe, analyze, webhook, expire, validate.
- `apps/web/public/widget.js`: actual embeddable widget flow.
- `apps/web/components/Recorder.tsx`: hosted capture recorder, currently broken against backend contract.
