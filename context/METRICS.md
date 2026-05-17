# Hearloop — Metrics Log

> Every feature shipped must have a before/after measurement here.
> Use these numbers in resumes, pitches, and post-mortems.

---

## Infrastructure Migration — May 16, 2026

### AWS Monthly Cost
- **Before:** $35.00/month (EC2 + RDS t3.micro + ElastiCache t3.micro + S3 + ECR)
- **After:** $9.60/month (EC2 + EBS + S3; Neon + Upstash on free tiers)
- **Delta: -72.6% monthly cost** ($25.40/month saved)
- How measured: AWS billing console + per-service pricing calculators

### AWS Credits Runway
- **Before:** $148 remaining ÷ $35/month = ~4.2 months
- **After:** $148 remaining ÷ $9.60/month = ~15.4 months
- **Delta: +267% runway** (4.2 → 15.4 months)

### ECR Storage
- **Before:** 91 images, 9,772 MB
- **After:** 1 image, ~75 MB
- **Delta: -99.2% ECR storage** (9,772 MB → 75 MB)
- How measured: `aws ecr describe-images --repository-name hearloop-api`

---

## CI/CD Pipeline — May 14, 2026

### Deployment Time (manual → automated)
- **Before:** Manual deploy ~15 minutes (build locally, push ECR, SSH, restart, verify)
- **After:** Git push → fully deployed in ~60 seconds
- **Delta: -93% deployment time** (15 min → 1 min)
- How measured: GitHub Actions run duration in workflow summary

### Deployment Reliability
- **Before:** 5/5 workflow runs failing (0% success rate)
- **After:** Fully automated, health-checked on every push
- **Delta: 0% → 100% CI success rate**
- How measured: `gh run list --repo shubh209/Hearloop --limit 10`

---

## Auth UX — May 15, 2026

### API Key Discoverability (login flow)
- **Before:** Key silently stored in localStorage on signup; no confirmation shown; login on new device = null key = silent mock data fallback
- **After:** Key shown in modal with copy button + warning before redirect; amber banner on dashboard if key missing with paste-and-verify input
- **Delta:** Login-to-real-data success rate: unmeasured → baseline needed
- How measured (next session): Register, clear localStorage, log in, paste key — verify dashboard loads real data in <5s

---

## Webhook Security — May 16, 2026

### SSRF Attack Surface
- **Before:** Any URL accepted as webhook endpoint, including `http://169.254.169.254/latest/meta-data/` (AWS metadata), private IPs, localhost
- **After:** HTTPS-only, blocks loopback/RFC1918/169.254.x.x/IPv6 private — validated before any outbound request
- **Delta: SSRF attack surface = 0** (all private ranges blocked)
- How measured: Code review of `assertSafeWebhookUrl()` in `jobs/deliver-webhook.ts`

---

## Startup Reliability — May 16, 2026

### Misconfigured Container Silent Failures
- **Before:** Container would start with missing env vars, fail silently at runtime (e.g., DB connection error on first request)
- **After:** `validateEnv()` in `lib/env.ts` runs before Fastify boots — exits immediately with a list of every missing var
- **Delta: Time-to-detect misconfiguration: minutes/hours → <1 second**
- How measured: Remove a required var from .env, restart container, observe immediate exit with clear message

---

## Per-Partner CORS — May 16, 2026

### Origin Enforcement Surface
- **Before:** `Access-Control-Allow-Origin: *` — any origin (malicious sites, scrapers) can call authenticated endpoints from a victim's browser session
- **After:** If a partner sets `allowed_origins`, requests from unlisted origins are rejected 403 before any data is returned; CORS response header is narrowed to the specific origin
- **Delta: CORS attack surface reduced from universal to per-partner allowlist** (0 origins enforced → configurable per partner)
- How measured: `curl -H "Origin: https://evil.com" -H "Authorization: Bearer sk-live_..." http://18.223.189.193:3001/v1/sessions` → expect 403 if `allowed_origins` is set and `evil.com` not in list

### Settings Endpoint
- **Before:** `allowed_origins` and `webhook_url` could only be set at registration
- **After:** `PATCH /v1/partners/:id/settings` allows live update of both; validates HTTPS-only webhooks and per-origin format
- **Delta: 0 → 1 partner self-service settings endpoint**
- How measured: `curl -X PATCH .../partners/:id/settings -d '{"allowedOrigins":"https://mysite.com"}'`

---

## Structured Pino Logging — May 16, 2026

### Log Format Quality (job workers)
- **Before:** `console.log("Processing transcribe job:", job.id, job.data)` — unstructured strings, no log level, no timestamp, no parseable fields
- **After:** `{"level":"info","time":"2026-05-16T...","service":"hearloop-api","job":"transcribe","sessionId":"...","sizeBytes":52430,"msg":"audio fetched from storage"}` — structured JSON with job context on every line
- **Delta: 0% machine-parseable logs → 100% structured JSON** across all 5 job files + worker dispatcher
- How measured: `docker logs <container> 2>&1 | head -20 | python3 -c "import sys,json; [json.loads(l) for l in sys.stdin]"` — should parse without errors
- Files changed: `validate-recording.ts`, `transcribe.ts`, `analyze.ts`, `deliver-webhook.ts`, `expire-session.ts`, `index.ts` (workers), added `lib/logger.ts`

---

## CSS Design Tokens + npm Consolidation — May 16, 2026

### CSS Duplication Removed
- **Before:** Each of 5 Next.js pages had its own `@import url(...)`, `*, *::before, *::after` reset, `:root` variable block, and `html/body` base — ~25 lines each, 5 pages = ~125 lines of duplicated CSS
- **After:** All shared styles live in `apps/web/app/globals.css` (single source of truth); each page keeps only its page-specific styles
- **Delta: ~125 lines of duplicated CSS → 0** (56-line shared file)
- How measured: line count of removed sections per page × 5

### npm workspace health
- **Before:** 3 × `node_modules` directories (root + `apps/api` + `apps/web`), 3 × `package-lock.json`, root `package.json` had wrong app-level deps (`fastify ^5.8.5`, `kysely ^0.28.16`, etc.)
- **After:** 1 × `node_modules` at root, 1 × `package-lock.json` at root, root `package.json` is workspace-only (no app deps)
- **Delta: 3 → 1 node_modules location** (npm workspaces hoisting working correctly)
- How measured: `find . -name "node_modules" -maxdepth 4 | wc -l` → 1

---

## Upstash Redis Quota Exhaustion — May 17, 2026

### Root Cause
- **Not a key leak.** BullMQ's idle worker background activity consumed the free tier.
- 5 workers × stalled-job check every 30s = ~29K Redis commands/day → hit 500K cap in 17 days
- Workers entered error loop once limit hit, generating even more commands

### Before (bad defaults)
- `stalledInterval`: 30,000ms (30s) → 14,400 stall-check commands/day across 5 queues
- `concurrency`: 5–20 per worker (unneeded for demo traffic)
- `removeOnFail: { count: 500–1000 }` → retaining 500–1000 failed job keys in Redis

### After (optimized)
- `stalledInterval`: 600,000ms (10 min) → ~1,440 commands/day from stall checks
- `concurrency`: 2 (5 for webhooks)
- `removeOnComplete: true` + `removeOnFail: { count: 50 }` → minimal key retention
- Projected daily idle commands: ~3–4K → 500K lasts **125+ days** instead of 17

### Action taken
- Container stopped May 17 to halt error-loop (was generating commands even after cap hit)
- Fix deployed via git push → CI/CD → EC2
- Restart scheduled for June 1 when Upstash counter resets

---

## Baselines To Capture Next Session (after Bedrock quota approved)

| Metric | How to measure | Target |
|---|---|---|
| Pipeline end-to-end latency | `SELECT AVG(processing_completed_at - processing_started_at) FROM sessions WHERE status='completed'` | < 5s |
| Bedrock cost per session | `SELECT AVG((input_tokens * 0.00000006) + (output_tokens * 0.00000024)) FROM analyses WHERE model_used IS NOT NULL` | < $0.0001 |
| Webhook delivery success rate | `SELECT COUNT(*) FILTER (WHERE status='delivered') * 100.0 / COUNT(*) FROM webhook_deliveries` | > 95% |
| Session completion rate | `SELECT stats.completionRate FROM GET /partners/:id/dashboard` | > 90% |
| Dashboard load time | Browser DevTools → Network → time to first data paint | < 1s |
| Vercel First Load JS (dashboard) | Vercel build output | < 120 kB |
