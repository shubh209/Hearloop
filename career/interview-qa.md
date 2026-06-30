# Hearloop — Interview Q&A

Every answer is grounded in a real file. Every number came from the code.

---

## SYSTEM OVERVIEW

**Q: What is Hearloop? Describe it in one paragraph.**

Hearloop is a voice micro-feedback platform offered as a B2B API. A Partner (a business) embeds a widget or generates a QR code; an End User taps, speaks for up to 5 seconds, and the audio gets uploaded directly to object storage. The API then runs an async pipeline — validate → transcribe → analyze — and delivers structured Insights (transcript, sentiment, topics, urgency, summary, flags) to the Partner's webhook. Partners also get a web dashboard to review sessions.

Evidence: `CONTEXT.md`, `apps/api/src/index.ts`, `apps/api/src/jobs/`

---

## ARCHITECTURE & DESIGN

**Q: Walk me through the overall system architecture.**

Three main pieces:

1. **Fastify API** (`apps/api`) on an EC2 instance, port 3001. Handles HTTP routing, auth, and job enqueueing.
2. **BullMQ workers** — six named queues — running in-process alongside the HTTP server inside the same Docker container. Each worker has its own IORedis connection.
3. **Next.js web app** (`apps/web`) deployed on Vercel. Auth, dashboard, onboarding, and the hosted capture page.

Supporting infra: Cloudflare R2 (audio storage), Upstash Redis (BullMQ queues), PostgreSQL (data), AWS Bedrock (AI analysis), Groq (transcription), AWS CloudWatch (metrics).

Evidence: `apps/api/src/index.ts`, `apps/api/Dockerfile`, `.github/workflows/docker-image.yml`

---

**Q: Why run workers in the same process as the HTTP server instead of separating them?**

**Short answer:** simplicity at this scale. On a single EC2 instance, a separate worker process adds a Docker container, a separate CI job, and shared-state concerns with no real benefit until volume demands it.

- The risk accepted: a CPU-heavy job could slow HTTP response times. At 5-second clips the jobs are fast (Groq transcription + one Bedrock call), so this hasn't been a problem.
- `drainDelay: 600` (10 min idle poll), `concurrency: 1`, `stalledInterval: 600_000` — all tuned to stay well under Upstash's free-tier quota.
- Trade-off accepted: single point of failure. If the container crashes, both HTTP and workers go down together.

Evidence: `apps/api/src/index.ts` `startWorkers()`, `apps/api/src/lib/queue.ts` `WORKER_OPTIONS`

---

**Q: Why BullMQ + Redis instead of a managed queue like SQS?**

**Verdict:** BullMQ + Upstash Redis — fits free tier, gives visibility, retries, and backoff without extra AWS spend.

- SQS would mean another AWS service, IAM policy, and SDK. Upstash Redis is a single connection string and already needed for BullMQ.
- BullMQ gives per-job retry counts and exponential backoff out of the box. SQS needs separate DLQs and visibility-timeout tuning to achieve the same.
- What SQS does better: true at-least-once guarantee and infinite scale. BullMQ on Redis can lose a job if Redis goes down before persistence. Acceptable risk at this stage.

Evidence: `apps/api/src/lib/queue.ts`, `apps/api/package.json` (`bullmq`, `ioredis`)

---

**Q: Why does each BullMQ worker get its own IORedis connection?**

BullMQ workers use Redis blocking commands (`BZPOPMIN`, `RPOPLPUSH`) that monopolize a connection. Sharing one connection across workers causes them to fall back to active polling — which ignores `drainDelay` and burns Upstash's command quota. The comment in `queue.ts` quantifies it: active polling costs ~691K commands/day vs. the ~806-command budget at `drainDelay: 600`.

Enqueue helpers use a separate short-lived Queue instance + connection, closed immediately after `queue.add()` fires.

Evidence: `apps/api/src/lib/queue.ts` (top comment block + `makeWorkerConn()`)

---

**Q: What is the full job pipeline and what does each job do?**

```
finalize (HTTP) → validate-recording → transcribe → analyze → deliver-webhook
```

- **validate-recording**: checks mime type (allowlist of 7 types), verifies file size (1 KB min – 10 MB max), reads the first 12 bytes to check the audio header (EBML for webm, RIFF for wav, ftyp for mp4, ID3/sync for mp3, OggS for ogg). Enqueues transcribe on pass, marks session `failed` with a reason code on fail.
- **transcribe**: downloads audio from R2, calls Groq `whisper-large-v3-turbo` with `verbose_json`, extracts text, detected language, duration from segments, and confidence from `avg_logprob` (> -0.5 = high). Inserts into `analyses` table. Enqueues analyze.
- **analyze**: fetches partner's `business_context`, calls Bedrock Nova Lite (Haiku fallback on error/bad JSON), stores sentiment/topics/urgency/summary/flags. Marks session `completed`. Enqueues webhook delivery.
- **deliver-webhook**: builds full event payload, HMAC-signs it, POSTs to partner's webhook URL. Retries up to 7 times with exponential backoff starting at 5s. Dead-letters after 7 failures.
- **expire-session**: scheduled with a `delay` equal to the session TTL (30 min for API sessions, 24h for public/capture sessions). Deletes audio from R2, marks session `expired`.

Evidence: `apps/api/src/jobs/`

---

## DATABASE

**Q: What database do you use and why Kysely instead of Prisma?**

**Verdict:** PostgreSQL with Kysely — full TypeScript type safety without a generated client or Prisma DSL.

- Kysely works directly with the `pg` Pool. No build step for schema changes, no shadow database for migrations.
- Prisma's generated client is heavier. With mostly simple CRUD + one join per query, that overhead isn't worth it.
- Trade-off: Kysely is more verbose than Prisma's ActiveRecord-style API. Fine for this schema size.

Connection pool: `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`, SSL in production.

Evidence: `apps/api/src/lib/db.ts`, `apps/api/package.json`

---

**Q: Walk me through the database schema.**

Eight tables across 8 migrations:

| Table | Purpose |
|---|---|
| `partners` | Business accounts — email, bcrypt password_hash, webhook_url, allowed_origins, business_context |
| `api_keys` | SHA-256 hashed keys, type `secret`/`public`, revocation tracking |
| `sessions` | One capture attempt — 9-state lifecycle (`created` → `completed`/`failed`/`expired`) |
| `recordings` | Audio artifact metadata — storage_key, mime_type, sha256_hash, size_bytes |
| `analyses` | Transcription + AI output — transcript, sentiment, topics_json, moderation_json, token counts |
| `webhook_deliveries` | Delivery log — attempt_count, response_code, status `pending`/`delivered`/`failed`/`dead` |
| `session_create_tokens` | Short-lived (10 min), single-use tokens so the browser creates sessions without repeated embed-key exposure |
| `capture_links` | Durable QR/SMS tokens — target_label, target_key (normalized), soft-deleted with `active=false` |

Evidence: `packages/db/migrations/001_initial.sql`, `apps/api/src/lib/db.ts`

---

**Q: Why store `topics_json` and `moderation_json` as TEXT instead of JSONB?**

The JSON is always written and read as a unit — no need to query inside it with `->` operators — so the column type doesn't affect query performance. The schema was kept portable across PostgreSQL hosts (Neon, RDS, local). If cross-session topic filtering were needed, JSONB with a GIN index would be the upgrade path.

Evidence: `packages/db/migrations/001_initial.sql`

---

## AI / ML

**Q: What AI models do you use and why?**

Two AI calls per pipeline run:

1. **Transcription**: Groq `whisper-large-v3-turbo` via `groq-sdk`. Fast, cheap, Whisper-quality output with `verbose_json` for segment-level confidence and language detection. Temperature `0.0`. Partner can pass a `promptText` (up to 224 chars) for Whisper context priming.

2. **Analysis (classification)**: AWS Bedrock `us.amazon.nova-lite-v1:0` as primary, `us.anthropic.claude-haiku-4-5-20251001-v1:0` as fallback. Nova Lite is the cheapest Bedrock model (~$0.0001/call), sufficient for a fixed JSON classification schema with `maxTokens: 120` and `temperature: 0.0`.

Evidence: `apps/api/src/lib/groq.ts`, `apps/api/src/lib/claude.ts`

---

**Q: Why Bedrock instead of calling the Anthropic or OpenAI API directly?**

**Short answer:** AWS-native billing and credential consolidation.

- The infra already lives on AWS (EC2, IAM, CloudWatch). Bedrock reuses the same IAM credential chain — no separate API key.
- Nova Lite is extremely cheap. The transcript is capped at 800 chars (`MAX_TRANSCRIPT_CHARS`), output at 120 tokens.
- Trade-off: more complex SDK (InvokeModelCommand, manual JSON encoding) vs. the cleaner Anthropic SDK. The `@anthropic-ai/sdk` in `package.json` is a remnant from evaluation before Bedrock was chosen.

Evidence: `apps/api/src/lib/claude.ts`, `apps/api/package.json`

---

**Q: What is the Haiku fallback and when does it trigger?**

If Nova Lite returns invalid JSON (parse error after stripping markdown fences) or throws, `analyzeTranscript()` falls back to `us.anthropic.claude-haiku-4-5-20251001-v1:0`. Same system prompt, same 120-token cap, higher quality.

The model used (`"nova-lite"` or `"haiku-fallback"`) is stored in `analyses.model_used`. CloudWatch metrics are emitted with an `Outcome` dimension (`"success"` or `"fallback"`) to allow alarming on fallback rate.

Evidence: `apps/api/src/lib/claude.ts` `analyzeTranscript()`, `apps/api/src/jobs/analyze.ts`

---

**Q: Is this RAG? Is this an agent or agentic workflow?**

Neither.

- **Not RAG.** There's no vector store or retrieval step. The `business_context` string is fetched from the DB and injected directly into the user message as a prefix (`Business context: ...`). This is prompt injection / prompt context.
- **Not an agent.** There's no multi-step orchestration, tool calling, or state machine. It's two sequential LLM calls per session (Groq transcription, then Bedrock classification), each stateless and deterministic.

Evidence: `apps/api/src/lib/claude.ts` `analyzeTranscript()`, `apps/api/src/jobs/analyze.ts`

---

**Q: What does the analysis output look like and how is it validated?**

The model returns JSON: `sentiment` (positive/neutral/negative), `sentimentScore` (0–1), `topics` (array from an allowlist of 10 slugs), `urgency` (none/follow_up/urgent), `summary` (≤280 chars), `qualityFlags`, `moderationFlags`.

Validation in `parseAnalysis()`:
- Topics filtered against `VALID_TOPICS` (10 allowed values). Unknown values dropped. Empty → `["other"]`.
- Sentiment and urgency sanitized — any invalid value defaults to `"neutral"` / `"none"`.
- `sentimentScore` clamped to [0, 1].
- Transcript with fewer than 2 words skips the LLM entirely → `qualityFlags: ["too_short"]`.
- Empty transcript → `qualityFlags: ["inaudible"]`.

Evidence: `apps/api/src/lib/claude.ts` (`VALID_TOPICS`, `parseAnalysis`, `sanitizeSentiment`, `clamp`)

---

**Q: What is business context and how is it imported?**

Business context is a partner-supplied plain-text description (up to 500 chars) of their business — what they do, who their customers are, what feedback dimensions matter. It gets prepended to the Bedrock prompt so topics and summaries are more relevant.

Import flow:
1. Partner provides a website URL.
2. `assertPublicHttpsUrl` validates it (HTTPS only, no private IPs — SSRF guard).
3. A BullMQ job (`import-business-context`) fires with 1 attempt, 1-hour result TTL.
4. A Crawl4AI sidecar (`SCRAPER_URL`, default `http://127.0.0.1:11235`) fetches the page and converts it to Markdown. Timeout: 25 seconds.
5. Markdown truncated to 8,000 chars (`IMPORT_MARKDOWN_MAX_CHARS`), sent to Bedrock Nova Lite (`maxTokens: 180, temperature: 0.2`) to produce a ≤500-char summary.
6. Draft returned to the frontend. **Partner must click Save** to write it to the DB — the import never auto-saves.
7. Rate limit: 3 imports per partner per hour via Redis INCR + 3600s TTL.

Evidence: `apps/api/src/jobs/import-business-context.ts`, `apps/api/src/lib/scrape-via-crawl4ai.ts`, `apps/api/src/lib/summarize-business-context.ts`, `apps/api/src/lib/import-rate-limit.ts`

---

## AUTHENTICATION & SECURITY

**Q: Walk me through the authentication system.**

Three credential types:

1. **Partner secret key** (`sk-live_…`): server-side API calls. 32 random bytes (`randomBytes(24)`) prefixed with `sk-live_`. Stored as SHA-256 hash in `api_keys.key_hash`. Lookup hashes the incoming key, matches the hash, checks `revoked_at IS NULL` and `partners.status = 'active'`. Updates `last_used_at` on each use.

2. **Widget embed key** (`pk-live_…`): browser-safe. Same format but `type = 'public'`. Restricted to the `/public/sessions/create-token` route. Requires `allowed_origins` to be configured — requests from other origins are rejected with 403.

3. **Dashboard session token** (`hlps.{base64url-body}.{hmac-sig}`): issued after email+password login. HMAC-SHA256 over the base64url-encoded `{sub, exp}` payload using `PARTNER_SESSION_SECRET`. TTL: 30 days. Verified with `timingSafeEqual` to prevent timing attacks. No JWT library — built with Node's `crypto` module.

Evidence: `apps/api/src/lib/authenticate-partner.ts`, `apps/api/src/lib/create-api-key.ts`, `apps/api/src/lib/partner-session.ts`, `apps/api/src/lib/hash-api-key.ts`

---

**Q: Why store API keys as hashes?**

If the database is compromised, a hashed key can't be used to impersonate a partner. SHA-256 is sufficient here (unlike passwords) because the raw key has 192 bits of entropy from `randomBytes(24)` — brute force is infeasible. The `key_prefix` (first 12 chars) is stored in plaintext so the dashboard can show `sk-live_a3f…` for identification without exposing the full key.

Evidence: `apps/api/src/lib/create-api-key.ts`, `apps/api/src/lib/hash-api-key.ts`

---

**Q: How does webhook signing work?**

HMAC-SHA256 over `{timestamp}.{rawBody}` using `WEBHOOK_SIGNING_SECRET`. Signature format: `sha256=` + hex digest. Same scheme as Stripe.

Headers sent: `X-Hearloop-Event`, `X-Hearloop-Delivery`, `X-Hearloop-Timestamp`, `X-Hearloop-Signature`.

The partner's server reconstructs the signed string from the timestamp header + raw body and compares. Including the timestamp prevents replay attacks.

Evidence: `apps/api/src/jobs/deliver-webhook.ts` `signPayload()`

---

**Q: What is SSRF and how do you prevent it?**

SSRF (Server-Side Request Forgery): an attacker supplies a URL that makes the server fetch an internal resource — like `http://169.254.169.254/` (AWS metadata) or `http://localhost:5432` (the database).

Two guards:

1. **`assertPublicHttpsUrl()`** — sync check before any fetch. Rejects: non-HTTPS, embedded credentials, loopback (`127.*`, `::1`), RFC 1918 ranges (`10.*`, `192.168.*`, `172.16-31.*`), link-local (`169.254.*` — AWS metadata), IPv6 local (`fc*`, `fd*`), and `localhost`/`*.local`.

2. **Crawl4AI sidecar** — performs a second DNS-level check at fetch time (returns `blocked_resolved_ip` if the resolved IP is private, protecting against DNS rebinding).

Applied to: business-context import and webhook delivery.

Evidence: `apps/api/src/lib/assert-public-https-url.ts`, `apps/api/src/lib/blocked-hostname.ts`, `apps/api/src/lib/scrape-via-crawl4ai.ts`

---

**Q: How does rate limiting work?**

Two layers:

1. **API rate limit** (`@fastify/rate-limit`): 100 requests per minute. Keyed on the first 16 chars of the Bearer token (falls back to IP). Returns HTTP 429.

2. **Import rate limit**: Redis INCR on `hearloop:import-rate:{partnerId}` with a 3600s TTL. Max 3 imports per partner per hour. No library — just `INCR` + `EXPIRE`.

Evidence: `apps/api/src/index.ts`, `apps/api/src/lib/import-rate-limit.ts`

---

**Q: Why bcrypt with 12 rounds?**

12 rounds is ~300ms per hash on modern hardware — slow enough to defeat offline brute-force, fast enough not to hurt login UX. It's the standard recommendation and matches common production configurations. bcrypt automatically incorporates the salt into the stored hash, so no separate salt column is needed.

Evidence: `apps/api/src/routes/partners.ts` (`SALT_ROUNDS = 12`)

---

## SESSION LIFECYCLE

**Q: Walk me through a complete session from widget embed to webhook delivery.**

1. **Embed init**: widget calls `POST /v1/public/sessions/create-token` with the embed key. API validates origin against `allowed_origins`, issues a session-create token (32 random bytes, 10-min TTL, stored in DB).
2. **Session create**: widget exchanges the token for a session via `POST /v1/public/sessions`. Token is validated (expiry + `used_at` check), session created in `created` state.
3. **Open**: `POST /v1/public/session/:token/open` → `opened`.
4. **Upload URL**: `POST /v1/public/session/:token/upload-url` returns a pre-signed R2 PUT URL (900s TTL). Browser uploads audio directly — never through the API server.
5. **Finalize**: `POST /v1/public/session/:token/finalize` upserts the `recordings` row, moves session to `submitted`, enqueues `validate-recording`.
6. **Pipeline**: validate → transcribe → analyze → webhook. Session moves `submitted` → `processing` → `completed` (or `failed`).
7. **Webhook**: partner receives a signed `POST` with the full Insights payload.

Evidence: `apps/api/src/routes/public.ts`, `apps/api/src/routes/sessions.ts`

---

**Q: What is the session-create token and why does it exist?**

The embed key (`pk-live_…`) is long-lived. If the widget called `POST /sessions` directly on every page load, the embed key would appear in every network request visible in browser devtools.

The session-create token is single-use (marked `used_at` on consumption) and expires in 10 minutes. So the embed key only appears once per "capture intent" rather than on every session creation.

Evidence: `apps/api/src/routes/public.ts` `POST /public/sessions/create-token`

---

**Q: How does the expiry job work?**

When a session is created, `enqueueExpireSession(sessionId, delayMs)` enqueues a BullMQ job with a `delay` equal to the session's TTL. BullMQ holds the job in a delayed set in Redis and promotes it after the delay.

When the job runs, it checks if the session is already terminal (`completed`, `failed`, `expired`, `deleted`). If so, it's a no-op. Otherwise it deletes the audio from R2 and marks the session `expired`.

Evidence: `apps/api/src/jobs/expire-session.ts`, `apps/api/src/routes/sessions.ts`

---

## STORAGE & INFRA

**Q: Why Cloudflare R2 instead of S3?**

**Short answer:** zero egress fees.

The transcribe worker downloads audio from R2 and re-uploads to Groq — a full round-trip. S3 charges for that egress. R2 doesn't. The storage client uses the AWS S3 SDK pointed at the R2 endpoint (`STORAGE_ENDPOINT`) — R2 is S3-compatible, so no SDK change was needed.

Evidence: `apps/api/src/lib/storage.ts`, `apps/api/src/lib/env.ts`

---

**Q: How does direct-browser upload work and why not route audio through the API?**

The API issues a pre-signed PUT URL (`@aws-sdk/s3-request-presigner`, 900s TTL). The browser uploads audio directly to R2. The API never handles the audio bytes for upload.

Routing megabyte audio files through the API wastes bandwidth, increases latency, and strains the EC2 instance. Direct upload is the standard pattern for user-generated content.

Evidence: `apps/api/src/lib/storage.ts` `getUploadSignedUrl()`, `apps/api/src/routes/public.ts`

---

**Q: Walk me through the CI/CD pipeline.**

GitHub Actions on push to `main`:

1. **Validate job**: `tsc --noEmit` TypeScript check + Hadolint Dockerfile lint. Fast gate before any AWS spend.
2. **Deploy job** (only if validate passes):
   - Adds the GitHub runner's IP to EC2 Security Group `sg-0fdee87e11e224206` on port 22 (ephemeral firewall hole).
   - Authenticates to ECR, builds `--platform linux/amd64 --no-cache`, pushes to ECR.
   - SSH into EC2, pulls image, stops old container, starts new one with `--env-file /home/ec2-user/.env --restart unless-stopped`.
   - `docker image prune -af` — added after the root volume hit 14 GB (55 orphaned images).
   - Health check: `curl --fail --retry 3 /health` after 15s.
3. **Revoke runner IP** — always runs, even on failure. Cleans up the ephemeral firewall hole.

Evidence: `.github/workflows/docker-image.yml`

---

**Q: Why a 4-stage Dockerfile?**

```
base → deps (all deps + devDeps) → prod-deps (no devDeps) → builder (compiles TS) → runner (prod-only)
```

The `prod-deps` stage exists because devDependencies like `babel`, `jest`, `ts-jest` carry transitive CVEs but are never used at runtime. The final `runner` image copies from `prod-deps` + compiled `dist/` — smallest image, fewest vulnerabilities.

Evidence: `apps/api/Dockerfile`

---

**Q: How does CloudWatch observability work?**

After each successful Bedrock call, the analyze job calls `emitBedrockInvocation()` as fire-and-forget (`.catch()` swallows the error so a CloudWatch failure never blocks the pipeline).

Four metrics emitted in one `PutMetricDataCommand` to namespace `CLOUDWATCH_NAMESPACE`:
- `BedrockLatencyMs`
- `BedrockInputTokens`
- `BedrockOutputTokens`
- `BedrockInvocationCount`

Two dimensions: `ModelId` (full Bedrock model string) and `Outcome` (`"success"` for nova-lite, `"fallback"` for haiku). Enables alarming on fallback rate.

Evidence: `apps/api/src/lib/cloudwatch.ts`, `apps/api/src/jobs/analyze.ts`

---

## MONOREPO & TOOLING

**Q: Why a Turborepo monorepo?**

Three workspaces: `apps/api`, `apps/web`, `packages/db`. Turbo handles build ordering (`dependsOn: ["^build"]`) and output caching (`dist/**`). The `packages/db` migrations can be shared by both apps. Without Turbo, you'd manually coordinate build order across packages.

Evidence: `turbo.json`, root `package.json` workspaces

---

**Q: Why Fastify over Express?**

Type-safe request handling, a plugin system (`app.register()`) that makes route isolation clean, and faster JSON serialization. `@fastify/rate-limit` integrates natively as a plugin.

Trade-off: smaller ecosystem and less Stack Overflow coverage than Express. Not a real concern for a greenfield API this size.

Evidence: `apps/api/src/index.ts`, `apps/api/package.json` (`fastify@^5.8.3`)

---

**Q: What testing exists in this codebase?**

Jest with Babel transformer (`babel-jest`, `@babel/preset-typescript`). Test files in `__tests__/`:

- `jobs/__tests__/analyze.test.ts` — analyze job unit tests
- `lib/__tests__/assert-public-https-url.test.ts` — SSRF guard, includes property-based tests with `fast-check`
- `lib/__tests__/cloudwatch.test.ts`
- `lib/__tests__/env.test.ts`
- `lib/__tests__/partner-session.test.ts`
- `routes/__tests__/` — route-level tests

`fast-check` (`^3.23.2`) is used on the SSRF guard — generates arbitrary hostname inputs to verify the blocklist is exhaustive.

Evidence: `apps/api/package.json`, file tree

---

## CAPTURE LINKS & TARGETS

**Q: What is a capture link and how does it differ from the widget embed?**

A capture link is a durable token (32 random hex bytes, path `/c/{token}`) that creates a fresh session each time it's visited. It's printed as a QR code on a receipt or counter signage for in-person feedback — the primary capture surface for service businesses.

The widget embed (`pk-live_…`) is the online surface — a floating button on the partner's website.

Key differences:
- Capture link: durable, no JS, works as a plain URL, creates a new session per scan.
- Widget embed: tied to an origin (CORS check), requires JS, shorter-lived session-create token flow.

A capture link can carry a **Target** (`targetLabel` / `targetKey`) — a normalized slug identifying the thing being reviewed (location, service, staff member). Sessions created from the link carry the target in `metadata_json`. Dashboard groups sessions by `target_key` in the "By-Target" view.

Evidence: `apps/api/src/routes/capture-links.ts`, `apps/api/src/routes/public.ts` (`POST /public/capture/:linkToken/session`)

---

## KEY TRADE-OFF SUMMARY

| Decision | Chose | Passed On | Why |
|---|---|---|---|
| Query builder | Kysely | Prisma | No generated client, no build step, raw SQL control |
| Queue | BullMQ + Upstash Redis | SQS | Free tier fits, retries + backoff built in, single connection string |
| AI classification | AWS Bedrock Nova Lite | OpenAI / Anthropic direct | Same IAM credentials, ~$0.0001/call, no extra API key |
| Transcription | Groq Whisper | AWS Transcribe | Faster, cheaper, verbose_json gives confidence + language |
| Object storage | Cloudflare R2 | AWS S3 | Zero egress fees for the download-then-upload pattern |
| Worker topology | In-process with HTTP | Separate service | Simpler ops at current scale, easy to split later |
| Session tokens | Custom HMAC (crypto) | JWT library | No extra dependency, Node crypto is sufficient |
| Passwords | bcrypt 12 rounds | argon2 | Standard, well-audited, right cost factor for login UX |
