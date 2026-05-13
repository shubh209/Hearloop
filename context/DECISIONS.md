# Hearloop — Architectural Decisions

> Why things are built the way they are. Read before questioning a tech choice or proposing a refactor.

---

## Language: TypeScript (not Python)

Widget is JavaScript. Sharing types between the frontend widget, backend API, and analysis pipeline was much cleaner in TypeScript. The Fastify ecosystem (plugins, decorators, type inference) is strong. Python would have been faster for AI prototyping but would have split the codebase.

---

## STT: Groq Whisper (`whisper-large-v3-turbo`)

- 216× realtime speed — a 5-second clip transcribes in <100ms
- Handles bad phone audio and accents well
- Free tier covers early testing
- Alternative (AWS Transcribe) is slower and adds AWS vendor lock-in on the hot path

---

## AI Classifier: Bedrock Nova Lite + Claude Haiku Fallback

- Nova Lite: ~$0.000066 per session (7× cheaper than Haiku alone)
- Haiku fallback activates when Nova fails JSON parsing
- Staying in AWS means IAM-based auth — no extra API key management
- Bedrock gives model diversity without changing infra
- Decision tradeoff: Nova Lite hits daily token limits at low usage. Haiku approval requires Bedrock use case form. This is the current blocking issue.

---

## Queue: BullMQ with Dedicated Queues Per Job Type

Previously used a single shared queue. This caused a race condition where workers completed jobs without executing their handlers (BullMQ pulled jobs from the wrong concurrency slot). Dedicated queues per job type (`hearloop-transcribe`, `hearloop-analyze`, etc.) fixed the issue cleanly.

---

## Storage: S3 Signed URLs (Not Proxy Through API)

Audio files are uploaded directly from the browser to S3 via a signed URL. The API never proxies audio bytes. This keeps the API server lightweight and avoids bandwidth/memory bottlenecks for large audio blobs. The API only issues and validates the signed URL.

---

## Database: PostgreSQL via Kysely (Not an ORM)

Kysely gives typed SQL without hiding what queries are being run. For a small team/solo project, full ORMs (Prisma, TypeORM) add migration overhead without much benefit. Kysely stays close to SQL while giving TypeScript type safety on query results.

---

## Auth: SHA-256 Hashed API Keys (Not JWT)

Partners authenticate with `sk-live_` prefixed keys. No JWT complexity, no refresh tokens, no clock sync issues. Keys are stateless and easy to rotate. The API hashes the incoming key and compares to the stored hash. Session tokens (for the public widget flow) are separate scoped UUIDs.

---

## HTTPS Proxy: Next.js API Routes (Not Nginx/SSL on EC2)

EC2 runs HTTP on port 3001. Vercel enforces HTTPS. The browser would block mixed-content requests (HTTPS page → HTTP API). Rather than set up Nginx + Let's Encrypt on EC2 (adds operational burden), the Next.js frontend proxies API calls through Vercel's HTTPS edge. This is a temporary solution — a proper custom domain with SSL on EC2 is in the V2 backlog.

---

## Infra: EC2 + RDS + ElastiCache (Not Managed Services Only)

- EC2 over Lambda: BullMQ workers need a persistent process. Lambda cold starts and execution limits are incompatible with long-running queue workers.
- RDS over Supabase/Neon: Staying inside AWS for IAM simplicity, avoiding external DB vendor.
- ElastiCache Valkey over Redis Cloud: AWS recommended, cheaper, 100% BullMQ-compatible.

---

## Widget: Vanilla JS IIFE (No Framework)

Partners embed `<script src="...widget.js">`. Zero dependencies means zero bundle conflicts. The widget works in any web stack (plain HTML, React, Vue, Shopify, etc.) without framework negotiation. The tradeoff is no shared type system with the backend — document the API contract clearly.

---

## Monorepo: npm Workspaces + Turborepo

Single repo for API + Web + DB migrations + shared types. Turborepo handles task caching and parallelism. `packages/types` is a placeholder for future shared TypeScript types between frontend and backend.

---

## What Was Reconsidered

| Original Idea | Changed To | Why |
|---|---|---|
| Cloudflare R2 for storage | AWS S3 | Staying in AWS ecosystem for IAM simplicity; R2 was initially used but R2 SDK adds a thin compatibility layer |
| Direct Claude API (Anthropic) | AWS Bedrock | Cost, IAM auth, no extra API key |
| Single BullMQ queue | Per-job-type queues | Race condition with shared queue workers |
| Vercel Postgres | AWS RDS | EC2 and RDS colocated in same VPC, lower latency |
