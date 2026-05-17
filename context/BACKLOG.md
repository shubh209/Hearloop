# Hearloop — Prioritized Backlog

Last updated: May 16, 2026 (post session-3)

---

## CURRENT BLOCKER — Bedrock Daily Token Quota

- [ ] **Bedrock quota approval pending**
  - Nova Lite: "Cross-region model inference tokens per day" → requested 50M (case open)
  - Claude Haiku: model access use case form submitted
  - Quota resets daily — may work at low volume already
  - Until approved: transcription works but `sentiment_label`, `topics`, `model_used` stay null

---

## P0 — All Fixed ✅

- [x] Fix hosted capture contract (public upload-url + finalize routes)
- [x] Partner auth migration (email + password_hash columns)
- [x] Hash passwords with bcrypt
- [x] Fix Docker build context in CI
- [x] Fix Bedrock `maxTokens` key + 800-char transcript cap
- [x] Wire validation job in pipeline
- [x] Add metrics columns (003 migration)
- [x] APP_URL env var on EC2
- [x] **CI/CD fully working** — push to main → ECR → EC2 → health check (~1 min)
- [x] **API key reveal modal** — shown once after signup with copy button + warning
- [x] **Missing key banner on dashboard** — paste input when apiKey absent from localStorage
- [x] **Dashboard 30s auto-refresh** — setInterval polling, cleans up on unmount
- [x] **SSRF protection on webhooks** — blocks HTTP, loopback, RFC1918, 169.254.x.x, IPv6 private
- [x] **Env config validation** — `lib/env.ts` validates all required vars at startup, exits clearly
- [x] **Migrated RDS → Neon** (free tier, auto-pause) — saves $15/month
- [x] **Migrated ElastiCache → Upstash Redis** (free tier) — saves $12/month
- [x] **ECR cleanup** — 90 old images deleted, lifecycle policy set
- [x] **Deleted:** RDS, ElastiCache, CloudWatch RDSOSMetrics log group
- [x] **Monthly AWS cost: ~$9.60/month** (was $35/month)

---

## P1 — After Bedrock Quota Approved

- [ ] **Verify metrics populated end-to-end**
  - Run a session, check `analyses.model_used`, `input_tokens`, `output_tokens` are non-null
  - Check `GET /partners/:id/dashboard` returns `stats.metrics.avgLatencyMs` and `estimatedCostUsd`

- [ ] **Dashboard real-data E2E test**
  - Full manual test: signup → create session → upload audio → verify analysis → see in dashboard
  - Auto-refresh already wired — verify live data appears without page reload

- [x] **Per-partner CORS `allowed_origins`** ✅ May 16
  - Column was in `001_initial.sql` (no migration needed)
  - `authenticate` decorator enforces 403 on unlisted origins, narrows header from `*` to specific origin
  - `PATCH /v1/partners/:id/settings` to configure `allowed_origins` + `webhook_url`

---

## P2 — Maintainability

- [x] **Structured logging (Pino)** ✅ May 16
  - `lib/logger.ts` shared logger, `jobLogger(job)` child helper
  - All 5 job files + worker dispatcher emit structured JSON

- [x] **Extract shared CSS / design tokens** ✅ May 16
  - `apps/web/app/globals.css` — Google Fonts, reset, `:root` tokens, `@keyframes fadeUp`
  - Imported in `layout.tsx`; all 5 pages stripped of duplicate `@import`, reset, `:root`, `html/body` base

- [x] **Single root node_modules + package-lock.json** ✅ May 16
  - Removed `apps/api/package-lock.json`, `apps/package-lock.json`, and nested `node_modules`
  - Removed incorrect root-level app deps from root `package.json` (fastify v5, kysely v0.28, etc.)
  - `npm install` from root now manages everything via npm workspaces
  - `.gitignore` fixed: `node_modules/` pattern (was `/node_modules` — only matched root)

- [ ] **Public widget security path**
  - Current: `apiKey` in browser config (partner secret exposed — OK for demo)
  - Future: partner backend creates session server-side, returns scoped session token to browser

---

## V2 / Future

- [ ] Custom domain + SSL on EC2 (Nginx + Let's Encrypt), remove Vercel proxy dependency
- [ ] npm package / React SDK wrapper for widget
- [ ] Knowledge graph / trend layer (group topics over time, detect patterns)
- [ ] Stripe billing integration
- [ ] Multi-user partner accounts (admin + viewer roles)
- [ ] Branching follow-up prompts (if urgency = high, ask follow-up)
- [ ] Analytics dashboard with charts (topic frequency, sentiment trends)
- [ ] Real-time dashboard (WebSocket or SSE instead of polling)
- [ ] Full migration off EC2 → Railway (~$5/mo, brings total to ~$5/mo)
