# Hearloop File Inventory

## Source and config

- `package.json`: root workspace config and shared deps.
- `package-lock.json`: root lockfile.
- `turbo.json`: build/dev task orchestration.
- `.gitignore`: currently malformed around `.env.example` and should be cleaned.
- `README.md`: currently empty except project title.
- `LICENSE`: MIT.

## Cursor and docs

- `.cursor/.context.md`: short project context, stale.
- `.cursor/.patterns.md`: style/pattern guide, stale in several places.
- `.cursor/copilot-instructions.md`: longer AI instructions, stale.
- `.cursor/AI_ASSISTANT_GUIDE.md`: explains context files.
- `.cursor/CLAUDE.md`: short Claude context, stale.
- `voice_micro_feedback_sdk_api_spec.pdf`: 7-page original SDK/API spec.
- `other/summary.md`: project summary and status, useful but stale.
- `other/Hearloop_Networking_Guide.md`: outreach/resume copy.
- `other/Hearloop_LinkedIn_Notes.md`: LinkedIn messaging.
- `other/hearloop_automotive_dashboard.html`: static dashboard mock.

## Backend

- `apps/api/package.json`: API deps/scripts.
- `apps/api/package-lock.json`: app lockfile inconsistent with root lock.
- `apps/api/tsconfig.json`: strict TS CommonJS build.
- `apps/api/Dockerfile`: multi-stage build; assumes monorepo root context.
- `apps/api/src/index.ts`: Fastify app, auth decorator, CORS, rate limit, route registration, worker startup.
- `apps/api/src/types.d.ts`: Fastify auth/partner type augmentation.
- `apps/api/src/lib/db.ts`: Kysely table interfaces and Postgres pool.
- `apps/api/src/lib/storage.ts`: S3/R2 upload/download signed URL helpers.
- `apps/api/src/lib/queue.ts`: BullMQ queues, workers, enqueue helpers.
- `apps/api/src/lib/groq.ts`: Groq Whisper transcription wrapper.
- `apps/api/src/lib/claude.ts`: Bedrock Nova Lite/Haiku classifier.
- `apps/api/src/routes/sessions.ts`: authenticated session CRUD/upload/finalize/result/delete.
- `apps/api/src/routes/public.ts`: public session resolve/open.
- `apps/api/src/routes/partners.ts`: register/login/dashboard.
- `apps/api/src/jobs/validate-recording.ts`: MIME/header/size validation; currently bypassed.
- `apps/api/src/jobs/transcribe.ts`: storage fetch -> Groq -> analysis row -> enqueue analyze.
- `apps/api/src/jobs/analyze.ts`: Bedrock classification -> update analysis -> complete session -> enqueue webhook.
- `apps/api/src/jobs/deliver-webhook.ts`: HMAC webhook with retries and delivery table.
- `apps/api/src/jobs/expire-session.ts`: expiry cleanup.

## Frontend

- `apps/web/package.json`: Next/React deps.
- `apps/web/tsconfig.json`: strict Next TS config.
- `apps/web/vercel.json`: Vercel build config.
- `apps/web/.env.local`: contains Vercel OIDC token; should not be shared.
- `apps/web/.vercel/project.json`: generated Vercel project metadata; should not be shared.
- `apps/web/app/layout.tsx`: root metadata/layout.
- `apps/web/app/page.tsx`: landing page.
- `apps/web/app/login/page.tsx`: partner signup/login.
- `apps/web/app/dashboard/page.tsx`: dashboard with real API fetch plus mock fallback.
- `apps/web/app/docs/page.tsx`: public docs page.
- `apps/web/app/capture/[token]/page.tsx`: hosted capture page shell.
- `apps/web/app/api/[...path]/route.ts`: Next proxy to API IP.
- `apps/web/components/Recorder.tsx`: hosted recorder; backend contract mismatch.
- `apps/web/public/widget.js`: embeddable widget.

## Database

- `packages/db/migrations/001_initial.sql`: initial schema, missing partner auth columns used by current code.
- `packages/types`: empty.

## Generated or should-ignore folders

- `node_modules`: dependency install output; exclude from AI context.
- `apps/web/.next`: Next build output; exclude from AI context.
- `.obsidian`: local notes workspace; exclude from AI context.
- `.vercel`: generated Vercel metadata; exclude from AI context.
