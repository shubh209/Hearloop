# Hearloop — Prioritized Backlog

Last updated: May 13, 2026 (post session-2)

---

## CURRENT BLOCKER — Bedrock Daily Token Quota

- [ ] **Increase Bedrock daily token quota**
  - AWS Console → Service Quotas → search "Bedrock Nova Lite"
  - Find **"Cross-region model inference tokens per day"** → request 50,000,000
  - Find **"Cross-region model inference tokens per minute"** → already requested 10M, check if approved
  - Also: submit Claude Haiku use case form via Bedrock Model Access page
  - Quota resets daily — can test tomorrow morning without a quota increase
  - Until fixed: transcription works but `sentiment_label`, `topics`, `model_used` stay null

---

## P0 — All Fixed ✅ (May 13, 2026)

- [x] **Fix hosted capture contract** — added public upload-url + finalize routes, fixed Recorder.tsx URL, fixed open body issue (empty JSON body for Fastify)
- [x] **Add partner auth migration** — `002_partner_auth.sql` created and run on RDS
- [x] **Hash passwords** — bcrypt was already wired in code; schema fix unblocked it
- [x] **Fix Docker build context in CI** — workflow now uses `-f apps/api/Dockerfile .`
- [x] **Fix Bedrock `maxTokens` key** — fixed + added 800-char transcript cap
- [x] **Wire validation job** — `enqueueValidate` added to queue, finalize now calls it; validate → transcribe chain verified in live logs
- [x] **Add metrics columns** — `002` and `003` migrations run on RDS; `model_used`, `input_tokens`, `output_tokens`, processing timestamps live in DB
- [x] **APP_URL env var** — fixed on EC2 to `https://hearloop.vercel.app`

---

## P1 — Security and Reliability

- [ ] **Verify metrics populated end-to-end** (blocked by Bedrock quota)
  - After quota fixed: run session, check `analyses.model_used`, `input_tokens`, `output_tokens` are non-null
  - Check `GET /partners/:id/dashboard` returns `stats.metrics.avgLatencyMs` and `estimatedCostUsd`

- [ ] **SSRF protection on webhook URLs**
  - Block `http://`, `localhost`, `127.x.x.x`, `10.x`, `172.16-31.x`, `192.168.x` in `jobs/deliver-webhook.ts`
  - Allow only HTTPS

- [ ] **Per-partner CORS allowed_origins**
  - Add `allowed_origins TEXT[]` column to `partners`
  - In `index.ts` CORS config, check request origin against partner's allowed list for public/browser routes

- [ ] **CI/CD pipeline**
  - GitHub Actions: on push to `main` → build Docker image → push ECR → SSH to EC2 → pull and restart
  - Fix build context first (P0 above)

- [ ] **Dashboard real-data end-to-end test**
  - Full manual test: signup → create session → upload audio → verify analysis → see in dashboard
  - Then wire 30-second auto-refresh polling in `apps/web/app/dashboard/page.tsx`

---

## P2 — Maintainability

- [ ] **Extract shared CSS / design tokens**
  - Large inline `<style>` blocks in `page.tsx`, `login/page.tsx`, `dashboard/page.tsx`, `docs/page.tsx`, `capture/[token]/page.tsx`
  - Extract color variables, spacing, typography into a shared CSS module or Tailwind config

- [ ] **Single root package-lock.json**
  - Remove `apps/api/package-lock.json`; install from monorepo root only

- [ ] **Env config validation module**
  - `apps/api/src/lib/env.ts`: validate required env vars on startup (fail fast if missing)
  - Required: `DATABASE_URL`, `REDIS_URL`, `AWS_REGION`, `BEDROCK_REGION`, `S3_BUCKET`, `GROQ_API_KEY`

- [ ] **Structured logging**
  - Replace `console.log/error` with a structured logger (Pino, already bundled with Fastify)
  - Log fields: `sessionId`, `partnerId`, `jobId`, `modelId`, `requestId`

- [ ] **Public widget security path**
  - Current: `apiKey` in browser config (partner secret exposed)
  - Recommended: partner backend creates session server-side, returns scoped session token to browser
  - Add public-key concept (read-only, safe for browser) separate from secret API key

---

## V2 / Future

- [ ] npm package / React SDK wrapper for widget
- [ ] Custom domain + SSL on EC2 (Nginx + Let's Encrypt), remove Vercel proxy dependency
- [ ] Knowledge graph / trend layer (group topics over time, detect patterns)
- [ ] Stripe billing integration
- [ ] Multi-user partner accounts (admin + viewer roles)
- [ ] Branching follow-up prompts (e.g., if urgency = high, ask follow-up)
- [ ] Analytics dashboard with charts (topic frequency, sentiment trends)
- [ ] Real-time dashboard (WebSocket or SSE instead of polling)
