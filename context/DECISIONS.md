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

- Nova Lite remains primary; Claude Haiku is the fallback when Nova invocation fails or returns missing/invalid tool input. If both models fail validation, analysis fails the Session rather than persisting invented Insights.
- Both models use the shared Bedrock Converse adapter with forced `record_analysis` tool use. Its JSON Schema defines the complete Insights contract, replacing free-text JSON, markdown-fence stripping, and the silent `parse_error` fallback.
- Business context and Target are separate, labeled Partner-controlled context blocks. The End-user-controlled transcript is a distinct `UNTRUSTED TRANSCRIPT DATA` block, and the system instruction says it is data—not instructions—and cannot override classification rules or the tool schema.
- Target context lets otherwise identical feedback be interpreted against the location, service, product, or staff member the Session is about.
- Staying in AWS retains IAM-based auth and model diversity without another provider integration. Existing successful-call `model_used`, `input_tokens`, and `output_tokens` metrics remain the cost-accounting source.
- Tradeoffs: the classifier is now coupled to the tool schema and topic/flag enums; schema changes require coordinated code and contract-test updates. Forced tool use and structural separation reduce malformed-output and prompt-injection risk, but mocked contracts do not prove live-model quality or eliminate every adversarial-model behavior. Tool definitions and Target context may also change token usage, so production cost must be remeasured.

---

## Queue: BullMQ with Dedicated Queues Per Job Type

Previously used a single shared queue. This caused a race condition where workers completed jobs without executing their handlers (BullMQ pulled jobs from the wrong concurrency slot). Dedicated queues per job type (`hearloop-transcribe`, `hearloop-analyze`, etc.) fixed the issue cleanly.

---

## Storage: direct S3 upload with staged exact-version pinning

Audio bytes travel directly from the capture client to S3 through a signed URL;
the API does not proxy media. S3 versioning, checksum-bound upload grants, and
exact-version primitives establish the evidence boundary. New Sessions remain
on the legacy-v0 protocol until capture clients and finalize/workers support the
versioned contract end to end.

---

## Database: PostgreSQL via Kysely (Not an ORM)

Kysely gives typed SQL without hiding what queries are being run. For a small team/solo project, full ORMs (Prisma, TypeORM) add migration overhead without much benefit. Kysely stays close to SQL while giving TypeScript type safety on query results.

---

## Auth: SHA-256 Hashed API Keys (Not JWT)

Partners authenticate with `sk-live_` prefixed keys. No JWT complexity, no refresh tokens, no clock sync issues. Keys are stateless and easy to rotate. The API hashes the incoming key and compares to the stored hash. Session tokens (for the public widget flow) are separate scoped UUIDs.

---

## HTTPS: Caddy on EC2 plus same-origin web proxy

Caddy terminates public HTTPS for the API at the nip.io endpoint. The Next.js
application also exposes a same-origin `/api` proxy so browser flows avoid
cross-origin and mixed-content coupling. The proxy is an application boundary,
not a substitute for API transport security.

---

## Infra: EC2 + Neon + Upstash

- EC2 over Lambda: BullMQ workers need a persistent process. Lambda cold starts and execution limits are incompatible with long-running queue workers.
- Neon replaced RDS to remove idle database instance cost while retaining
  PostgreSQL and Kysely.
- Upstash replaced ElastiCache to remove idle Redis instance cost. Queue polling,
  health checks, and worker connections are deliberately constrained by its
  command quota.

---

## Capture clients: vanilla widget plus React SDK

The dependency-free `widget.js` supports arbitrary sites. `@hearloop/react`
provides a typed React integration without forcing React on other Partners.
Both clients implement the same public Session lifecycle and must move together
when that protocol changes.

---

## Monorepo: npm Workspaces + Turborepo

The API, web application, QuickLube demo, React SDK, and database migrations
share one npm-workspaces repository. Turborepo coordinates build and development
tasks; workspace boundaries remain explicit rather than introducing a
speculative shared-types package.

---

## What Was Reconsidered

| Original Idea | Changed To | Why |
|---|---|---|
| Cloudflare R2 for storage | AWS S3 | Staying in AWS ecosystem for IAM simplicity; R2 was initially used but R2 SDK adds a thin compatibility layer |
| Direct Claude API (Anthropic) | AWS Bedrock | Cost, IAM auth, no extra API key |
| Single BullMQ queue | Per-job-type queues | Race condition with shared queue workers |
| AWS RDS | Neon PostgreSQL | Remove idle instance cost while preserving PostgreSQL |
| ElastiCache | Upstash Redis | Remove idle instance cost with explicit command-quota guardrails |
