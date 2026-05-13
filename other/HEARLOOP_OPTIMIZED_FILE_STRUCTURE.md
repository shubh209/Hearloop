# Hearloop Optimized File Structure

Generated from a scan of the uploaded `hearloop.zip` repo, excluding `node_modules`, `.next`, `.vercel`, `.obsidian`, and other generated/vendor folders.

## Executive summary

The current repo is not too large. The real problem is that responsibilities are mixed together:

- API routes contain business logic and direct database access.
- Workers and HTTP server boot from the same entrypoint.
- AI provider code is named `claude.ts` even though the primary model is Nova Lite.
- The hosted capture flow, widget flow, and API contracts are not centralized.
- The web app has large page files with UI, API calls, styling, and state logic in one place.
- The widget is a large hand-written file in `public/` instead of a source package that gets built.
- Project context files are scattered and stale, which wastes Cursor context.

The optimized structure should keep the monorepo, but enforce cleaner boundaries:

```text
apps/api      -> Fastify HTTP API and backend worker entrypoints
apps/web      -> Next.js marketing site, docs, login, dashboard, hosted capture page
packages/db   -> migrations, Kysely schema, generated DB types, migration tooling
packages/contracts -> shared API/event/session schemas used by API, web, and widget
packages/widget    -> source for embeddable widget, built into apps/web/public/widget.js
packages/config    -> shared TypeScript, lint, and env helpers if needed
infra         -> Docker, deployment, AWS/ECR/EC2/ECS/IAM/CloudWatch assets
docs          -> durable project context, architecture, API, ops, Cursor bootstrapping
```

Do not create a huge enterprise architecture. This is still an MVP. The right move is a modular monorepo with vertical backend modules and shared contracts.

---

## Current scanned structure

Meaningful current files/folders:

```text
hearloop/
├── .cursor/
│   ├── .context.md
│   ├── .patterns.md
│   ├── AI_ASSISTANT_GUIDE.md
│   ├── CLAUDE.md
│   └── copilot-instructions.md
├── .github/workflows/docker-image.yml
├── apps/
│   ├── api/
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── jobs/
│   │       │   ├── analyze.ts
│   │       │   ├── deliver-webhook.ts
│   │       │   ├── expire-session.ts
│   │       │   ├── transcribe.ts
│   │       │   └── validate-recording.ts
│   │       ├── lib/
│   │       │   ├── claude.ts
│   │       │   ├── db.ts
│   │       │   ├── groq.ts
│   │       │   ├── queue.ts
│   │       │   └── storage.ts
│   │       ├── routes/
│   │       │   ├── partners.ts
│   │       │   ├── public.ts
│   │       │   └── sessions.ts
│   │       └── types.d.ts
│   └── web/
│       ├── app/
│       │   ├── api/[...path]/route.ts
│       │   ├── capture/[token]/page.tsx
│       │   ├── dashboard/page.tsx
│       │   ├── docs/page.tsx
│       │   ├── login/page.tsx
│       │   ├── layout.tsx
│       │   └── page.tsx
│       ├── components/Recorder.tsx
│       ├── public/widget.js
│       ├── package.json
│       ├── tsconfig.json
│       └── vercel.json
├── packages/
│   ├── db/migrations/001_initial.sql
│   └── types/
├── other/
├── voice_micro_feedback_sdk_api_spec.pdf
├── package.json
├── package-lock.json
├── turbo.json
├── README.md
└── .gitignore
```

Biggest file-structure issues:

1. `apps/api/src/index.ts` does too much: Fastify creation, auth decorator, CORS, rate limit, route registration, worker startup, shutdown handling.
2. `apps/api/src/routes/*.ts` mix routing, validation, business rules, persistence, and queue orchestration.
3. `apps/api/src/lib/claude.ts` is an AI service, Bedrock client, prompt file, parser, taxonomy, and fallback handler all in one file.
4. `apps/api/src/lib/db.ts` contains both Kysely connection setup and DB table interfaces.
5. `apps/web/app/dashboard/page.tsx`, `apps/web/app/page.tsx`, and `apps/web/app/docs/page.tsx` are too large and should be split into feature components.
6. `apps/web/public/widget.js` should not be hand-maintained directly. It should be a build artifact from `packages/widget`.
7. `.cursor` contains too many overlapping context files. Cursor will waste tokens reading stale or contradictory guidance.
8. `.env.local`, `.vercel`, `.next`, `node_modules`, and personal note folders should not be part of the repo context.

---

## Recommended target structure

```text
hearloop/
├── README.md
├── package.json
├── package-lock.json
├── turbo.json
├── tsconfig.base.json
├── .gitignore
├── .env.example
│
├── .cursor/
│   ├── SESSION_BOOTSTRAP.md
│   ├── PROJECT_CONTEXT.md
│   ├── ARCHITECTURE.md
│   ├── AI_BEDROCK_RUNBOOK.md
│   ├── KNOWN_ISSUES.md
│   └── CODE_STYLE.md
│
├── .github/
│   └── workflows/
│       ├── api-ci.yml
│       ├── web-ci.yml
│       └── deploy-api.yml
│
├── apps/
│   ├── api/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   ├── src/
│   │   │   ├── server.ts
│   │   │   ├── worker.ts
│   │   │   ├── app.ts
│   │   │   │
│   │   │   ├── config/
│   │   │   │   ├── env.ts
│   │   │   │   ├── constants.ts
│   │   │   │   └── feature-flags.ts
│   │   │   │
│   │   │   ├── plugins/
│   │   │   │   ├── auth.plugin.ts
│   │   │   │   ├── cors.plugin.ts
│   │   │   │   ├── rate-limit.plugin.ts
│   │   │   │   └── error-handler.plugin.ts
│   │   │   │
│   │   │   ├── modules/
│   │   │   │   ├── partners/
│   │   │   │   │   ├── partner.routes.ts
│   │   │   │   │   ├── partner.service.ts
│   │   │   │   │   ├── partner.repository.ts
│   │   │   │   │   ├── partner.schemas.ts
│   │   │   │   │   └── partner.types.ts
│   │   │   │   │
│   │   │   │   ├── sessions/
│   │   │   │   │   ├── session.routes.ts
│   │   │   │   │   ├── session.service.ts
│   │   │   │   │   ├── session.repository.ts
│   │   │   │   │   ├── session.state.ts
│   │   │   │   │   ├── session.schemas.ts
│   │   │   │   │   └── session.types.ts
│   │   │   │   │
│   │   │   │   ├── public-capture/
│   │   │   │   │   ├── public-capture.routes.ts
│   │   │   │   │   ├── public-capture.service.ts
│   │   │   │   │   └── public-capture.schemas.ts
│   │   │   │   │
│   │   │   │   ├── recordings/
│   │   │   │   │   ├── recording.service.ts
│   │   │   │   │   ├── recording.repository.ts
│   │   │   │   │   ├── recording.validation.ts
│   │   │   │   │   └── recording.types.ts
│   │   │   │   │
│   │   │   │   ├── transcription/
│   │   │   │   │   ├── transcription.service.ts
│   │   │   │   │   ├── groq-transcription.client.ts
│   │   │   │   │   └── transcription.types.ts
│   │   │   │   │
│   │   │   │   ├── ai-analysis/
│   │   │   │   │   ├── analysis.service.ts
│   │   │   │   │   ├── analysis.repository.ts
│   │   │   │   │   ├── analysis.schemas.ts
│   │   │   │   │   ├── analysis.parser.ts
│   │   │   │   │   ├── analysis.taxonomy.ts
│   │   │   │   │   ├── prompts.ts
│   │   │   │   │   └── providers/
│   │   │   │   │       ├── bedrock.client.ts
│   │   │   │   │       ├── nova-analyzer.ts
│   │   │   │   │       └── anthropic-fallback.ts
│   │   │   │   │
│   │   │   │   ├── webhooks/
│   │   │   │   │   ├── webhook.service.ts
│   │   │   │   │   ├── webhook.repository.ts
│   │   │   │   │   ├── webhook.signing.ts
│   │   │   │   │   ├── webhook.payloads.ts
│   │   │   │   │   └── webhook.types.ts
│   │   │   │   │
│   │   │   │   └── dashboard/
│   │   │   │       ├── dashboard.routes.ts
│   │   │   │       ├── dashboard.service.ts
│   │   │   │       └── dashboard.repository.ts
│   │   │   │
│   │   │   ├── jobs/
│   │   │   │   ├── queues.ts
│   │   │   │   ├── worker-registry.ts
│   │   │   │   ├── job-options.ts
│   │   │   │   └── processors/
│   │   │   │       ├── validate-recording.processor.ts
│   │   │   │       ├── transcribe.processor.ts
│   │   │   │       ├── analyze.processor.ts
│   │   │   │       ├── deliver-webhook.processor.ts
│   │   │   │       └── expire-session.processor.ts
│   │   │   │
│   │   │   ├── infrastructure/
│   │   │   │   ├── db/
│   │   │   │   │   ├── kysely.ts
│   │   │   │   │   └── transaction.ts
│   │   │   │   ├── redis/
│   │   │   │   │   └── redis.ts
│   │   │   │   ├── storage/
│   │   │   │   │   ├── s3.client.ts
│   │   │   │   │   ├── storage.service.ts
│   │   │   │   │   └── storage.keys.ts
│   │   │   │   └── observability/
│   │   │   │       ├── logger.ts
│   │   │   │       ├── metrics.ts
│   │   │   │       └── ai-invocation-logger.ts
│   │   │   │
│   │   │   ├── shared/
│   │   │   │   ├── errors.ts
│   │   │   │   ├── http.ts
│   │   │   │   ├── dates.ts
│   │   │   │   ├── crypto.ts
│   │   │   │   └── result.ts
│   │   │   │
│   │   │   └── types/
│   │   │       └── fastify.d.ts
│   │   │
│   │   └── test/
│   │       ├── unit/
│   │       ├── integration/
│   │       └── fixtures/
│   │
│   └── web/
│       ├── package.json
│       ├── tsconfig.json
│       ├── next.config.ts
│       ├── vercel.json
│       ├── .env.example
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── globals.css
│       │   ├── api/[...path]/route.ts
│       │   ├── (marketing)/
│       │   │   └── page.tsx
│       │   ├── (auth)/
│       │   │   └── login/page.tsx
│       │   ├── (dashboard)/
│       │   │   └── dashboard/page.tsx
│       │   ├── capture/[token]/page.tsx
│       │   └── docs/page.tsx
│       │
│       ├── features/
│       │   ├── capture/
│       │   │   ├── api.ts
│       │   │   ├── CaptureShell.tsx
│       │   │   ├── Recorder.tsx
│       │   │   ├── recorder-state.ts
│       │   │   └── types.ts
│       │   ├── dashboard/
│       │   │   ├── api.ts
│       │   │   ├── DashboardShell.tsx
│       │   │   ├── SessionList.tsx
│       │   │   ├── MetricsCards.tsx
│       │   │   └── types.ts
│       │   ├── auth/
│       │   │   ├── api.ts
│       │   │   ├── LoginForm.tsx
│       │   │   └── RegisterForm.tsx
│       │   ├── docs/
│       │   │   ├── ApiDocs.tsx
│       │   │   ├── CodeBlock.tsx
│       │   │   └── EndpointCard.tsx
│       │   └── marketing/
│       │       ├── Hero.tsx
│       │       ├── HowItWorks.tsx
│       │       ├── Pricing.tsx
│       │       └── CTA.tsx
│       │
│       ├── components/
│       │   ├── ui/
│       │   │   ├── Button.tsx
│       │   │   ├── Card.tsx
│       │   │   ├── Input.tsx
│       │   │   ├── Badge.tsx
│       │   │   └── Spinner.tsx
│       │   └── layout/
│       │       ├── Header.tsx
│       │       └── Footer.tsx
│       │
│       ├── lib/
│       │   ├── api-client.ts
│       │   ├── env.ts
│       │   ├── format.ts
│       │   └── storage.ts
│       │
│       ├── public/
│       │   └── widget.js
│       │
│       └── test/
│           ├── unit/
│           └── e2e/
│
├── packages/
│   ├── contracts/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── api/
│   │       │   ├── partners.contract.ts
│   │       │   ├── sessions.contract.ts
│   │       │   ├── public-capture.contract.ts
│   │       │   └── dashboard.contract.ts
│   │       ├── events/
│   │       │   ├── webhook-events.ts
│   │       │   └── session-events.ts
│   │       ├── schemas/
│   │       │   ├── analysis.schema.ts
│   │       │   ├── recording.schema.ts
│   │       │   └── session.schema.ts
│   │       └── types/
│   │           ├── analysis.ts
│   │           ├── partner.ts
│   │           ├── recording.ts
│   │           └── session.ts
│   │
│   ├── db/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── schema.ts
│   │   │   └── migrations.ts
│   │   ├── migrations/
│   │   │   ├── 001_initial.sql
│   │   │   ├── 002_partner_auth.sql
│   │   │   ├── 003_ai_invocations.sql
│   │   │   └── 004_public_capture_uploads.sql
│   │   └── seeds/
│   │       └── dev.sql
│   │
│   ├── widget/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── index.ts
│   │       ├── HearloopWidget.ts
│   │       ├── recorder.ts
│   │       ├── api-client.ts
│   │       ├── styles.css
│   │       └── types.ts
│   │
│   ├── config/
│   │   ├── package.json
│   │   ├── tsconfig.base.json
│   │   └── eslint.config.mjs
│   │
│   └── types/
│       ├── package.json
│       ├── tsconfig.json
│       └── src/index.ts
│
├── infra/
│   ├── docker/
│   │   ├── api.Dockerfile
│   │   └── worker.Dockerfile
│   ├── aws/
│   │   ├── iam/
│   │   │   ├── bedrock-policy.json
│   │   │   ├── s3-policy.json
│   │   │   └── ecr-policy.json
│   │   ├── cloudwatch/
│   │   │   ├── bedrock-dashboard.json
│   │   │   └── alarms.json
│   │   └── ec2/
│   │       └── user-data.sh
│   └── scripts/
│       ├── deploy-api.sh
│       ├── run-migrations.sh
│       └── clear-queues.sh
│
├── docs/
│   ├── README.md
│   ├── architecture/
│   │   ├── overview.md
│   │   ├── session-lifecycle.md
│   │   ├── data-model.md
│   │   └── async-jobs.md
│   ├── api/
│   │   ├── public-api.md
│   │   ├── partner-api.md
│   │   ├── webhook-signatures.md
│   │   └── error-codes.md
│   ├── operations/
│   │   ├── aws-bedrock-runbook.md
│   │   ├── deployment.md
│   │   ├── env-vars.md
│   │   ├── observability.md
│   │   └── incident-response.md
│   ├── product/
│   │   ├── positioning.md
│   │   ├── roadmap.md
│   │   └── demo-script.md
│   └── archive/
│       ├── api-spec-original.pdf
│       └── old-notes/
│
└── scripts/
    ├── dev.sh
    ├── build.sh
    ├── test.sh
    └── lint.sh
```

---

## Backend structure reasoning

### Keep `apps/api`, but split server and worker entrypoints

Current file:

```text
apps/api/src/index.ts
```

Recommended split:

```text
apps/api/src/app.ts       -> builds and configures Fastify app
apps/api/src/server.ts    -> starts HTTP server only
apps/api/src/worker.ts    -> starts BullMQ workers only
```

Why this matters:

- You can deploy API and workers separately later.
- You can scale HTTP and background jobs independently.
- Tests can import `buildApp()` without accidentally starting workers.
- Cursor can reason about API boot without loading worker logic.

Suggested responsibility split:

```text
app.ts
  create Fastify instance
  register plugins
  register routes
  register error handler
  return app

server.ts
  import buildApp
  listen on PORT
  handle shutdown

worker.ts
  import worker registry
  start validate/transcribe/analyze/webhook/expire workers
  handle shutdown
```

### Use vertical backend modules

Instead of this:

```text
routes/sessions.ts
lib/storage.ts
lib/queue.ts
jobs/transcribe.ts
jobs/analyze.ts
```

Use this:

```text
modules/sessions/
modules/recordings/
modules/transcription/
modules/ai-analysis/
modules/webhooks/
jobs/processors/
infrastructure/
```

This keeps product concepts together while still separating route/service/repository layers.

Example for sessions:

```text
modules/sessions/
├── session.routes.ts       -> HTTP endpoints only
├── session.service.ts      -> business rules and state transitions
├── session.repository.ts   -> database reads/writes
├── session.state.ts        -> legal state transitions
├── session.schemas.ts      -> request/response validation
└── session.types.ts        -> module-local types
```

The current `sessions.ts` route file should eventually become thin. It should not know how to build storage keys, enqueue jobs, or directly format every database row.

### Rename `claude.ts`

Current:

```text
apps/api/src/lib/claude.ts
```

Recommended:

```text
apps/api/src/modules/ai-analysis/providers/bedrock.client.ts
apps/api/src/modules/ai-analysis/providers/nova-analyzer.ts
apps/api/src/modules/ai-analysis/providers/anthropic-fallback.ts
apps/api/src/modules/ai-analysis/prompts.ts
apps/api/src/modules/ai-analysis/analysis.parser.ts
apps/api/src/modules/ai-analysis/analysis.taxonomy.ts
apps/api/src/modules/ai-analysis/analysis.service.ts
```

The current name is misleading. The file primarily invokes Nova Lite on Bedrock, not Claude. Misleading names cost you real time because every future model/session has to relearn the mismatch.

### Move DB interfaces out of `lib/db.ts`

Current:

```text
apps/api/src/lib/db.ts
```

Recommended:

```text
packages/db/src/schema.ts       -> Kysely table interfaces
apps/api/src/infrastructure/db/kysely.ts -> API database connection
packages/db/migrations/*.sql    -> source of truth migrations
```

The database schema should be shared infrastructure, not hidden inside the API app.

### Add AI invocation observability as first-class structure

Add:

```text
modules/ai-analysis/analysis.repository.ts
infrastructure/observability/ai-invocation-logger.ts
packages/db/migrations/003_ai_invocations.sql
```

This exists because your Bedrock cost/token problem is not solvable cleanly without durable per-call telemetry.

---

## Frontend structure reasoning

### Use Next route groups

Current:

```text
apps/web/app/page.tsx
apps/web/app/login/page.tsx
apps/web/app/dashboard/page.tsx
apps/web/app/docs/page.tsx
apps/web/app/capture/[token]/page.tsx
```

Recommended:

```text
apps/web/app/(marketing)/page.tsx
apps/web/app/(auth)/login/page.tsx
apps/web/app/(dashboard)/dashboard/page.tsx
apps/web/app/capture/[token]/page.tsx
apps/web/app/docs/page.tsx
```

Route groups do not change URLs, but they organize intent.

### Split large pages into feature components

Your biggest web files are currently page-level files:

```text
apps/web/app/dashboard/page.tsx
apps/web/app/page.tsx
apps/web/app/docs/page.tsx
apps/web/app/login/page.tsx
apps/web/components/Recorder.tsx
```

Recommended target:

```text
features/dashboard/
features/marketing/
features/docs/
features/auth/
features/capture/
```

A route file should mostly assemble components:

```tsx
import { DashboardShell } from "@/features/dashboard/DashboardShell";

export default function DashboardPage() {
  return <DashboardShell />;
}
```

That is much easier for Cursor and humans than a 40 KB page file.

### Move capture API calls out of `Recorder.tsx`

Current:

```text
apps/web/components/Recorder.tsx
```

Recommended:

```text
apps/web/features/capture/Recorder.tsx
apps/web/features/capture/api.ts
apps/web/features/capture/recorder-state.ts
apps/web/features/capture/types.ts
```

`Recorder.tsx` should own browser recording UI/state. It should not hardcode API routes or know the full upload/finalize protocol.

### Turn `widget.js` into a source package

Current:

```text
apps/web/public/widget.js
```

Recommended source:

```text
packages/widget/src/index.ts
packages/widget/src/HearloopWidget.ts
packages/widget/src/recorder.ts
packages/widget/src/api-client.ts
packages/widget/src/styles.css
```

Recommended build output:

```text
apps/web/public/widget.js
```

Do not manually edit `public/widget.js` long term. Generated/browser-distributed assets belong in `public`; source code does not.

---

## Shared packages

### `packages/contracts`

This is the most important new package.

Purpose:

- One source of truth for request/response shapes.
- Shared session statuses.
- Shared webhook event payloads.
- Shared analysis schema.
- Prevents API, web, and widget from drifting.

Recommended contents:

```text
packages/contracts/src/api/sessions.contract.ts
packages/contracts/src/api/public-capture.contract.ts
packages/contracts/src/events/webhook-events.ts
packages/contracts/src/schemas/analysis.schema.ts
packages/contracts/src/types/session.ts
```

This would directly prevent bugs like the hosted capture page calling routes that the backend does not implement.

### `packages/db`

Purpose:

- SQL migrations.
- Kysely schema types.
- Migration runner.
- Seed data.

Recommended contents:

```text
packages/db/migrations/001_initial.sql
packages/db/migrations/002_partner_auth.sql
packages/db/migrations/003_ai_invocations.sql
packages/db/src/schema.ts
packages/db/src/migrations.ts
packages/db/seeds/dev.sql
```

The migration files must match what the API actually expects. Right now, they do not.

### `packages/widget`

Purpose:

- Source for the embeddable customer widget.
- Compiles to one browser script.
- Can import shared contracts.

Recommended contents:

```text
packages/widget/src/index.ts
packages/widget/src/HearloopWidget.ts
packages/widget/src/recorder.ts
packages/widget/src/api-client.ts
packages/widget/src/types.ts
packages/widget/src/styles.css
```

### `packages/types`

Either delete it or make it real. Empty packages waste context.

Good use:

```text
packages/types/src/index.ts
```

Bad use:

```text
packages/types/
```

with no package.json, no source, and no imports.

---

## Docs and Cursor context structure

The docs should be durable and small enough to help Cursor, not confuse it.

Recommended:

```text
docs/
├── architecture/
│   ├── overview.md
│   ├── session-lifecycle.md
│   ├── data-model.md
│   └── async-jobs.md
├── api/
│   ├── public-api.md
│   ├── partner-api.md
│   ├── webhook-signatures.md
│   └── error-codes.md
├── operations/
│   ├── aws-bedrock-runbook.md
│   ├── deployment.md
│   ├── env-vars.md
│   ├── observability.md
│   └── incident-response.md
└── product/
    ├── positioning.md
    ├── roadmap.md
    └── demo-script.md
```

Recommended `.cursor`:

```text
.cursor/
├── SESSION_BOOTSTRAP.md
├── PROJECT_CONTEXT.md
├── ARCHITECTURE.md
├── AI_BEDROCK_RUNBOOK.md
├── KNOWN_ISSUES.md
└── CODE_STYLE.md
```

Do not keep five overlapping assistant instruction files. That creates contradictory context.

Move stale docs here:

```text
docs/archive/old-context/
```

Or delete them.

---

## Infrastructure structure

Current:

```text
.github/workflows/docker-image.yml
apps/api/Dockerfile
apps/web/vercel.json
```

Recommended:

```text
infra/
├── docker/
│   ├── api.Dockerfile
│   └── worker.Dockerfile
├── aws/
│   ├── iam/
│   ├── cloudwatch/
│   └── ec2/
└── scripts/
    ├── deploy-api.sh
    ├── run-migrations.sh
    └── clear-queues.sh
```

You can keep Dockerfiles inside `apps/api` while the project is small, but deployment scripts and AWS policies should live under `infra/`.

---

## Files/folders to remove from repo context

These should not be committed or included in Cursor indexing:

```text
node_modules/
apps/**/node_modules/
.next/
apps/**/.next/
.vercel/
apps/**/.vercel/
.env
.env.*
!.env.example
apps/web/.env.local
.obsidian/
dist/
coverage/
*.log
.DS_Store
```

The current uploaded archive includes `apps/web/.env.local`. That is bad. Treat any token inside it as exposed and rotate it if this zip was shared anywhere.

Recommended `.gitignore`:

```gitignore
# dependencies
node_modules/
apps/**/node_modules/
packages/**/node_modules/

# builds
.next/
apps/**/.next/
dist/
build/
.turbo/
coverage/

# deployment/local tooling
.vercel/
apps/**/.vercel/
.obsidian/

# env files
.env
.env.*
!.env.example

# logs / OS
*.log
.DS_Store

# generated widget output if you decide to build during CI instead of commit
# apps/web/public/widget.js
```

Fix this broken current line:

```text
/.env.examplenode_modules/
```

It should not exist.

---

## Current-to-target mapping

Use this table when refactoring.

| Current file | Target location | Notes |
|---|---|---|
| `apps/api/src/index.ts` | `apps/api/src/app.ts`, `server.ts`, `worker.ts` | Split HTTP app construction from process startup and worker startup. |
| `apps/api/src/routes/sessions.ts` | `modules/sessions/*`, `modules/recordings/*`, `modules/public-capture/*` | Route file is doing too much. |
| `apps/api/src/routes/public.ts` | `modules/public-capture/public-capture.routes.ts` | Public token routes belong in their own module. |
| `apps/api/src/routes/partners.ts` | `modules/partners/*`, `modules/dashboard/*` | Partner auth and dashboard query should be separated. |
| `apps/api/src/lib/db.ts` | `packages/db/src/schema.ts`, `infrastructure/db/kysely.ts` | Separate DB schema from connection. |
| `apps/api/src/lib/storage.ts` | `infrastructure/storage/*` | Storage client and storage service should be separate. |
| `apps/api/src/lib/queue.ts` | `jobs/queues.ts`, `jobs/job-options.ts`, `jobs/worker-registry.ts` | Queue config and worker creation should not be one generic lib. |
| `apps/api/src/lib/groq.ts` | `modules/transcription/groq-transcription.client.ts` | Provider client belongs in transcription module. |
| `apps/api/src/lib/claude.ts` | `modules/ai-analysis/*` | Rename. It is not just Claude. Split prompt, parser, taxonomy, provider client. |
| `apps/api/src/jobs/*.ts` | `jobs/processors/*.processor.ts` | Jobs should call services, not hold core business logic. |
| `apps/web/app/page.tsx` | `app/(marketing)/page.tsx`, `features/marketing/*` | Split into sections. |
| `apps/web/app/login/page.tsx` | `app/(auth)/login/page.tsx`, `features/auth/*` | Split forms and API client. |
| `apps/web/app/dashboard/page.tsx` | `app/(dashboard)/dashboard/page.tsx`, `features/dashboard/*` | Split metrics, session list, filters, detail modal. |
| `apps/web/app/docs/page.tsx` | `features/docs/*` or MDX docs | Page file is too large. |
| `apps/web/components/Recorder.tsx` | `features/capture/Recorder.tsx` | Keep recorder near capture feature. |
| `apps/web/public/widget.js` | `packages/widget/src/*` -> build output to `public/widget.js` | Do not hand-edit public JS. |
| `packages/db/migrations/001_initial.sql` | `packages/db/migrations/*` | Add migrations for partner auth and AI invocation logging. |
| `packages/types/` | `packages/contracts/` or real `packages/types/src/index.ts` | Empty package should be deleted or made useful. |
| `other/*` | `docs/archive/` or delete | Do not pollute source tree. |
| `voice_micro_feedback_sdk_api_spec.pdf` | `docs/archive/api-spec-original.pdf` | Keep as historical source, not active source of truth. |

---

## Minimum viable refactor order

Do not refactor everything at once. That would be a self-inflicted mess.

### Phase 1: Clean context and source control

1. Fix `.gitignore`.
2. Remove `.env.local`, `.vercel`, `.next`, `node_modules`, and generated junk from the repo.
3. Replace overlapping `.cursor` files with the compact context files.
4. Move `other/` and the original PDF spec into `docs/archive/`.

### Phase 2: Stabilize backend entrypoints

1. Split `apps/api/src/index.ts` into `app.ts`, `server.ts`, and `worker.ts`.
2. Move auth/CORS/rate-limit into plugins.
3. Keep routes exactly as-is at first to avoid breaking behavior.

### Phase 3: Add contracts

1. Create `packages/contracts`.
2. Define session status, public capture payloads, finalize payloads, analysis result, and webhook event schemas.
3. Import these types/schemas in API and web.

This is where you stop the hosted capture/web/API contract drift.

### Phase 4: Refactor backend by domain

Refactor in this order:

1. `sessions`
2. `public-capture`
3. `recordings`
4. `transcription`
5. `ai-analysis`
6. `webhooks`
7. `partners/dashboard`

Do not start with dashboard. Start with the session lifecycle because everything depends on it.

### Phase 5: Refactor frontend features

1. Move `Recorder.tsx` into `features/capture`.
2. Move capture API calls into `features/capture/api.ts`.
3. Split dashboard page.
4. Split login page.
5. Split docs and marketing page.

### Phase 6: Move widget to package

1. Create `packages/widget`.
2. Move the widget source there.
3. Build to `apps/web/public/widget.js`.
4. Add a CI check that fails if source and built widget drift.

---

## Practical first target tree

If you want the shortest useful version, aim for this first, not the full tree above:

```text
hearloop/
├── apps/
│   ├── api/
│   │   └── src/
│   │       ├── app.ts
│   │       ├── server.ts
│   │       ├── worker.ts
│   │       ├── config/env.ts
│   │       ├── plugins/
│   │       │   ├── auth.plugin.ts
│   │       │   ├── cors.plugin.ts
│   │       │   └── rate-limit.plugin.ts
│   │       ├── modules/
│   │       │   ├── sessions/
│   │       │   ├── public-capture/
│   │       │   ├── recordings/
│   │       │   ├── transcription/
│   │       │   ├── ai-analysis/
│   │       │   ├── webhooks/
│   │       │   └── partners/
│   │       ├── jobs/
│   │       │   ├── queues.ts
│   │       │   ├── worker-registry.ts
│   │       │   └── processors/
│   │       ├── infrastructure/
│   │       │   ├── db/
│   │       │   ├── redis/
│   │       │   ├── storage/
│   │       │   └── observability/
│   │       └── shared/
│   └── web/
│       ├── app/
│       │   ├── (marketing)/page.tsx
│       │   ├── (auth)/login/page.tsx
│       │   ├── (dashboard)/dashboard/page.tsx
│       │   ├── capture/[token]/page.tsx
│       │   ├── docs/page.tsx
│       │   └── api/[...path]/route.ts
│       ├── features/
│       │   ├── capture/
│       │   ├── dashboard/
│       │   ├── auth/
│       │   ├── docs/
│       │   └── marketing/
│       ├── components/ui/
│       └── lib/
├── packages/
│   ├── contracts/
│   ├── db/
│   └── widget/
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── operations/
│   ├── product/
│   └── archive/
├── infra/
├── scripts/
└── .cursor/
```

That is the right level of structure for this project today.

---

## What not to do

Do not do these yet:

1. Do not create a separate microservice per domain.
2. Do not introduce NestJS just to look organized.
3. Do not create ten shared packages that contain one file each.
4. Do not move every component into `components/` with no feature grouping.
5. Do not keep generated files in repo because “Cursor might need them.” It does not.
6. Do not keep stale docs just because they once helped. Stale docs are worse than no docs.
7. Do not refactor the whole codebase before fixing the broken capture/upload/finalize flow.

---

## Final recommendation

The best optimized structure for Hearloop is:

- **Monorepo stays.**
- **Backend becomes vertical-slice modules.**
- **API server and workers get separate entrypoints.**
- **Database schema and migrations move to a real `packages/db`.**
- **Shared API/event schemas move to `packages/contracts`.**
- **Widget source moves to `packages/widget`.**
- **Web app uses route groups plus feature folders.**
- **Docs become intentional, small, and Cursor-friendly.**

This gives you enough structure to scale the product without turning the repo into ceremony-heavy enterprise theater.
