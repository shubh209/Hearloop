# Voxli — Voice Micro-Feedback Platform

Embeddable voice feedback widget + API for businesses. Customers tap, speak 5 seconds, done. Business receives transcript, sentiment, topics, and urgency via webhook.

## Stack
- Backend: TypeScript, Next.js API routes, Postgres (Supabase), Redis/BullMQ (Upstash), Cloudflare R2
- Frontend: Next.js, Vanilla JS widget (CDN), optional React wrapper
- AI: Groq Whisper (STT), Claude Haiku (classification, strict JSON)
- Infra: Vercel

## Key Concepts
- Multi-tenant: Partners embed a JS snippet
- Session state machine: created → processing → completed
- Auth: secret API keys (partners), scoped session tokens (widget), HMAC (webhooks)
- Fixed topic taxonomy: staff_friendliness, wait_time, service_quality, etc.

## Build Order
Week 1→4 per spec. API-first, hosted capture second, widget third.