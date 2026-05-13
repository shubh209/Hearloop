# Hearloop Code Style and Conventions

## Current style

- TypeScript everywhere for source.
- Backend files use double quotes, async/await, small route/job modules.
- Backend uses Kysely query builder directly in route handlers and jobs.
- Fastify routes return JSON directly through `reply.send`.
- Job files are named `verb-noun.ts`.
- React app uses large page components with inline `<style>` blocks.
- Vanilla widget is a single IIFE class in `public/widget.js`.
- Errors are string codes such as `session_not_found`, `invalid_session_state`, `transcription_error`.

## Recommended conventions going forward

Backend:

- Keep route handlers thin; push business logic into `services/`.
- Validate all request bodies with explicit schemas before DB calls.
- Use one canonical state transition helper for sessions.
- Use one env config module that validates required env vars on startup.
- No direct model calls inside DB update retry boundaries.
- No `any` unless wrapped in a narrow parser/guard.
- Replace console logs with structured logger fields: sessionId, partnerId, jobId, modelId, requestId.

Frontend:

- Extract shared design tokens and components.
- Avoid hardcoded IPs in source; use env vars.
- Keep `public/widget.js` dependency-free, but document its API separately.
- Never put secret partner API keys in browser docs as the recommended production path.

Database:

- Every DB shape change gets a numbered migration.
- Keep `lib/db.ts` interfaces in sync with migrations.
- Prefer JSONB columns over text-encoded JSON when using Postgres.

AI:

- Centralize prompts, model IDs, token caps, and fallback policy.
- Cap transcript length before LLM calls.
- Store model invocation telemetry.
- Use local deterministic fallback for empty/short/low-confidence transcripts.
