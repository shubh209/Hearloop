# Business Context Import (Crawl4AI) — Design

> Goal: a Partner pastes their **website URL once** at onboarding (or in settings).
> Hearloop fetches the public homepage, summarizes what the business does, and
> pre-fills `partners.business_context` — so classification (topics, sentiment)
> matches their domain without the owner writing copy from scratch.
>
> Status: **built (Jun 17, 2026)** — HTTP-only sidecar + API routes + queue/job + onboarding/settings UI are implemented.

---

## How this differs from Feedback Target scraping

`context/FEEDBACK_TARGET_DESIGN.md` rejected **server-side** fetching for **per-Session
widget attribution** (SSRF, SPAs, per-session cost). That decision stands.

This feature is a different concern:

| | Feedback Target (widget) | Business context import |
|---|---|---|
| **When** | Every Session (high volume) | Once per Partner (onboarding / settings) |
| **Who initiates** | Automatic on embed | Partner explicitly pastes *their* URL |
| **Output** | `target` on a Session | `business_context` on the Partner row |
| **Server fetch** | No (client-side DOM read) | Yes (controlled, rate-limited, SSRF-guarded) |
| **Storage** | Session metadata | Partner settings (already exists) |

Interview line: *"We don't scrape the web on every feedback event — we import business
context once at onboarding with the same SSRF discipline as webhooks."*

---

## Domain language (fold into `CONTEXT.md` when built)

**Business context import** — one-time, Partner-initiated fetch of a public website
URL to draft `business_context`. The Partner reviews/edits before save.
_Avoid_: "Web scraping" (too broad), "Page context" (that's per-Session widget metadata).

**Import source URL** — the HTTPS URL the Partner supplied (typically homepage).
Stored optionally on `partners.website_url` for re-import and display.
_Avoid_: "Webhook URL", "Capture link".

---

## User experience

### Primary surface: onboarding (`/onboarding`)

Current flow: textarea + automotive template + skip.

**Proposed:**

```
┌─────────────────────────────────────────────────────────┐
│  Tell us about your business                            │
│                                                         │
│  Website (optional)                                     │
│  [ https://quicklube-example.com          ] [ Import ]  │
│                                                         │
│  ── or describe it yourself ──                          │
│  [ textarea …                                           │
│    What does your business do? … ]                      │
│                                                         │
│  [ Use automotive template ]  [ Skip for now ]          │
└─────────────────────────────────────────────────────────┘
```

**Import button behavior:**

1. Validate URL client-side (https, looks like a hostname).
2. `POST /partners/me/business-context/import { websiteUrl }` → `202 { importId }`.
3. Show spinner: *"Reading your website… usually 10–20 seconds."*
4. Poll `GET /partners/me/business-context/import/:importId` every 2s.
5. On success: pre-fill textarea with draft; Partner **must click Save** (no silent overwrite).
6. On failure: toast with friendly message; textarea + templates remain.

### Secondary surface: settings

Same URL + Import block in `EmbedSettingsPanel` (or a slim **Business** settings tab)
for partners who skipped onboarding.

### Non-goals (v1)

- Multi-page crawl (sitemap, /services, /locations) — homepage only.
- Scheduled re-scrape / "watch my site".
- Storing full page HTML or markdown long-term.
- Verifying domain ownership (DNS TXT) — defer.

---

## Architecture

```
Partner UI                API (Fastify)                    Scrape + AI
─────────                 ─────────────                    ──────────
[Import] ──POST import──► assert-public-url (SSRF)
                          enqueue import-business-context
                                    │
                                    ▼
                          jobs/import-business-context.ts
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            scrape-via-crawl4ai.ts          summarize-business-context.ts
            (HTTP → sidecar)                (Bedrock Nova Lite)
                    │                               │
                    └───────────────┬───────────────┘
                                    ▼
                      return draft in BullMQ returnvalue
                                    │
                          poll status → UI pre-fill
                                    │
                  Partner clicks Save (PATCH /partners/me/settings)
```

### Why Crawl4AI as a sidecar (not inside the API container)

| Approach | Verdict |
|---|---|
| `pip install crawl4ai` inside `hearloop-api` image | ❌ Bloats Node image; mixed runtimes |
| Subprocess from Node on EC2 host | ❌ Fragile; hard to reproduce in CI |
| **Crawl4AI Docker sidecar on localhost (HTTP-only v1)** | ✅ Isolated; Apache-2.0; no Chromium RAM hit |
| Crawl4AI Cloud (paid beta) | ⏸ Defer — adds vendor + cost |

**Sidecar contract (internal only, `127.0.0.1:11235`):**

```http
POST /crawl
Content-Type: application/json

{ "url": "https://example.com", "mode": "http", "timeoutMs": 25000 }

→ 200 { "markdown": "...", "title": "...", "bytes": 12345 }
```

`mode: "http"` — static fetch + markdown conversion only on v1. Browser mode is post-v1.

The API never exposes this port publicly. Caddy/EC2 security group unchanged.

### Fallback ladder (resilience + t3.micro)

**Default path: HTTP-only** — no Playwright/Chromium on v1. Crawl4AI (or a thin
`fetch` + HTML-to-text step) pulls static HTML only. Most local-business homepages
(brochure sites, WordPress, Wix) are sufficient.

| Step | When | Action |
|---|---|---|
| 1 | Always (v1) | HTTP-only crawl → markdown |
| 2 | Empty/garbage markdown | Job `failed` → UI: manual textarea or template |
| 3 | Post-v1 only | Browser/Playwright for JS-heavy sites — **not** v1 scope |

If HTTP-only quality is poor on target verticals, revisit browser mode or EC2 sizing
**after** measuring import success rate — do not preemptively upgrade t3.micro.

---

## Security (SSRF)

Reuse the spirit of `jobs/deliver-webhook.ts` → extract shared guard.

**New file:** `lib/assert-public-https-url.ts`

| Rule | Detail |
|---|---|
| Scheme | `https:` only — reject `http://` (matches webhook policy) |
| Hostname blocklist | `localhost`, `*.local`, metadata IPs, RFC1918, link-local, IPv6 ULA |
| IP literal URLs | Reject `https://127.0.0.1`, `https://10.x`, etc. |
| DNS rebinding | Resolve hostname → verify resolved IP is public before fetch (sidecar responsibility) |
| Size cap | Max 2 MB response body |
| Timeout | 25s crawl + 10s summarize |
| Redirects | Max 3; re-validate each hop |
| Rate limit | 3 imports / partner / hour; 1 concurrent import / partner |

**Not** the same as webhooks: Partner supplies URL at click-time (intent), not stored
arbitrary URL fetched later without user action.

Audit log (structured Pino): `partnerId`, `websiteUrl` (host only in logs if preferred), `outcome`, `durationMs` — no full markdown in logs.

---

## Data model

### Migration 009 (proposed)

```sql
ALTER TABLE partners
  ADD COLUMN website_url TEXT,
  ADD COLUMN business_context_source VARCHAR(20)
    CHECK (business_context_source IN ('manual', 'template', 'import', 'import_edited'));
```

No `business_context_imports` table in v1 — import status lives in BullMQ job state;
the UI polls by `importId` (job ID).

### Existing column

`business_context TEXT` (migration 005) — unchanged. Import **drafts** into the UI
textarea only; the Partner **confirms** via **Save** (`PATCH /partners/me/settings`).
Import never writes `business_context` directly to the DB.

---

## API routes (prefix `/v1`, partner session auth)

```
POST   /partners/me/business-context/import
       Body: { websiteUrl: string }
       → 202 { importId, status: "pending" }
       → 400 { error: "ssrf_blocked" | "website_url_required" }
       → 429 { error: "rate_limited" }
       → 409 if import already running for this partner

GET    /partners/me/business-context/import/:importId
       → 200 { status, draftContext?, errorCode?, websiteUrl }
```

Save (unchanged):

```
PATCH  /partners/me/settings
       Body: { businessContext, businessContextSource?: "import_edited" }
```

---

## Job: `import-business-context`

**New queue:** `hearloop-import-context` (or reuse analyze queue with low priority — prefer **dedicated queue** so a slow crawl never blocks feedback pipeline).

**Worker options:** `concurrency: 1` globally for scrape jobs (protect t3.micro).

**Steps:**

1. Load `websiteUrl`, `partnerId` from job payload.
2. `assertPublicHttpsUrl(websiteUrl)`.
3. Call Crawl4AI sidecar → `markdown` (truncate to ~8K chars before LLM).
4. `summarizeBusinessContext(markdown, title)` via Bedrock Nova Lite:

   ```
   System: You write short business descriptions for a feedback analytics product.
   Output plain text only, max 500 characters, no markdown.

   User: Summarize what this business does, who their customers are, and what
   services matter for feedback (wait time, staff, pricing, quality).
   Site title: {title}
   Page content:
   {markdown}
   ```

5. Return `draft_context` in job result (BullMQ `returnvalue`) — **do not** UPDATE `partners.business_context`.
6. On failure: `failed` + `error_code` (`ssrf_blocked`, `timeout`, `scrape_empty`, `scrape_error`, `summarize_error`).

Partner saves draft via existing `PATCH /partners/me/settings` → sets `business_context`
and `business_context_source` (`import` or `import_edited` if they changed the text).

**Downstream:** `jobs/analyze.ts` already reads `partners.business_context` at runtime — no pipeline change.

---

## File map (single-responsibility)

```
apps/api/src/
  lib/assert-public-https-url.ts     — SSRF guard (shared; webhook may adopt later)
  lib/scrape-via-crawl4ai.ts         — HTTP client to sidecar
  lib/summarize-business-context.ts  — Bedrock prompt for import (not analyze.ts)
  jobs/import-business-context.ts    — job orchestration
  routes/business-context-import.ts  — POST import + GET status

apps/web/
  app/onboarding/page.tsx            — URL field + import + poll
  components/EmbedSettingsPanel.tsx  — same import block (or BusinessSettingsPanel split)

infra/
  docker-compose.scraper.yml         — Crawl4AI sidecar for local dev + EC2 reference
  (EC2 deploy: second container or documented manual step for v1)

packages/db/migrations/
  009_business_context_import.sql    — website_url + business_context_source only
```

---

## Infra & cost

| Resource | Impact |
|---|---|
| EC2 RAM | HTTP-only sidecar — no Chromium on v1; stays on t3.micro |
| Bedrock | ~1 import/partner lifetime: ~2–4K input tokens + ~100 output ≈ $0.0002 |
| Crawl4AI license | $0 (Apache-2.0) |
| Redis | +1 worker ≈ +100 cmds/day idle (within budget if `drainDelay: 600`) |
| Neon | Optional columns; negligible |

**Do not** run import on the feedback hot path. Onboarding-only keeps p95 session latency untouched.

---

## Metrics (`context/METRICS.md` — capture before build)

| Metric | Before | Target | How |
|---|---|---|---|
| Onboarding completion w/ non-null `business_context` | ~?% (manual/template) | +30pp | `SELECT COUNT(*) FILTER (WHERE business_context IS NOT NULL) / COUNT(*) FROM partners` |
| Time-to-first-save on onboarding | manual baseline | <30s with import | UI timestamp |
| Import success rate | N/A | >80% on automotive sample URLs | job outcomes |
| Topic relevance (qualitative) | generic "other" | fewer mislabels | same transcript, with/without imported context |
| EC2 OOM / scrape p95 | N/A | 0 OOM; HTTP p95 <15s | sidecar logs + job duration |

---

## Tracer-bullet implementation order

1. ~~**Spike (half day):** HTTP-only crawl on EC2 (no browser); 5 automotive homepages; record latency, markdown quality, import success rate.~~ ✅ **Done** — 5/5 success, p95 572ms, EC2 OK at 512MB. Report: `testing/spike/SPIKE_REPORT.md`.
2. ~~**SSRF guard + unit tests** — HTTPS-only; port webhook patterns; no UI yet.~~ ✅ **Done** — `lib/blocked-hostname.ts`, `lib/assert-public-https-url.ts`, 16 tests; webhooks refactored to shared guard.
3. ~~**Sidecar + `scrape-via-crawl4ai.ts`** — HTTP-only mode; curl-able from API container.~~ ✅ **Done** — `services/scraper/` FastAPI sidecar + Dockerfile + `infra/docker-compose.scraper.yml` + `lib/scrape-via-crawl4ai.ts`.
4. ~~**`summarize-business-context.ts`** — Bedrock only; feed fixture markdown.~~ ✅ **Done** — dedicated Bedrock summarizer with 500-char plain-text output cap.
5. ~~**Job + routes + BullMQ poll** — draft in job `returnvalue`; end-to-end without UI.~~ ✅ **Done** — `jobs/import-business-context.ts`, `routes/business-context-import.ts`, queue + worker wiring, rate limit + 409 concurrent guard.
6. ~~**Onboarding UI** — Import → poll → pre-fill textarea → partner Save.~~ ✅ **Done** — onboarding imports draft context and saves via explicit partner confirmation.
7. ~~**Settings UI + migration 009** — `website_url`, `business_context_source`.~~ ✅ **Done** — shared import block in settings + migration 009 applied to Neon.
8. ~~**Metrics entry** — before/after onboarding completion rate.~~ ✅ **Done** — baseline logged in `context/METRICS.md` as pending live production imports.

---

## Locked decisions (Jun 17, 2026)

| # | Decision |
|---|---|
| 1 | **HTTPS-only** — reject `http://` URLs |
| 2 | **HTTP-only fallback first** — no Playwright/Chromium on v1; no preemptive EC2 resize |
| 3 | **Pre-fill only** — import drafts into textarea; partner confirms via Save |
| 4 | **No import history table** — BullMQ job ID polling only for v1 status |

---

## Explicit non-decisions (defer)

- Crawling Google Business / Yelp profiles (ToS + fragility).
- Multi-language detection beyond Bedrock's default.
- Wiring import into **signup** `POST /partners/register` (keep import post-auth only for v1).
