# Hearloop — Interview Prep Session

> **Rolling state for grill sessions.** Chat is the draft workspace; Notion is for polished revision.
> Workflow rules: [`interview-prep/WORKFLOW.md`](../interview-prep/WORKFLOW.md)

---

## Future chat starter prompt (CREO)

**Index:** [`interview-prep/README.md`](../interview-prep/README.md) lists all 10 coverage areas + files.

Copy into a new chat (attach `@context/INTERVIEW_PREP.md` + `@interview-prep/README.md`):

```
[C — Context]
Hearloop interview-prep coach. B2B voice micro-feedback; hybrid infra (EC2 workers, Neon, Upstash, Vercel, S3, Groq, Bedrock). All draft answers live under interview-prep/coverage/ and this file.

[R — Request]
Refine ONE section I name: "coverage 4", "mock Q3", "lock coverage 5", etc. Use interview-prep/coverage/*.md as source. Do NOT push Notion unless I say "push to notion".

[E — Explanation]
Review mode: I tweak with "tweak coverage N: ..." or "lock coverage N". Markdown before code. Interview-surface first. Architecture 6/6 + pitch locked; coverage 3–10 draft — batch.

[O — Outcome]
1) Section one-liner 2) Current 30s answer 3) Suggested edits 4) Updated file only if I say lock

Notion: https://www.notion.so/37207530fa6b814ea093f4143cc57962

Open focus: User ran live E2E (completed). Next: refine coverage 3 with real run notes; rewrite coverage 4–10 in self-study format (_TEMPLATE.md); fix Vercel capture URL doc/INFRA.
```

**Also attach:** `@interview-prep/coverage/03-e2e-flows.md` when working on E2E.

---

## Session handoff — June 4, 2026 (read this first in next chat)

### What we set up (workflow agreements)

| Decision | Agreed |
|----------|--------|
| Prep location | **Chat first** → user reviews → **Notion** only when ready |
| Doc before code | `AGENTS.md`, `context/*`, `interview-prep/*` — code only if missing |
| Answer layers | **Self-study explained** first (scenario + what/why/say per step), then **30s interview script** at bottom |
| Batch vs grill | User wanted all areas drafted fast; **outlines were rejected** — use `_TEMPLATE.md` format going forward |
| Review commands | `tweak coverage N: ...` · `lock coverage N` · `push to notion` |
| Handoff | Both: agent offers near context limit; user says `handoff now` |
| Diagrams | Mermaid + `interview-prep/diagrams/`; offer when flows help |
| Notion publish | MCP when user asks; arch #1–6 + pitch pushed earlier in session |

**User learning pattern (optimize for this):**

- Needs **plain narrative** (QuickLube/Maria-style scenario), not bullet outlines.
- Asks **"explain for me"** for concepts — not interview trivia (e.g. skip leading with "216× realtime").
- Locks answers only after understanding; may run **live E2E** to validate.
- Prefers **one section at a time** for tweaks after batch draft exists.

**Key files created/updated this session:**

| Path | Purpose |
|------|---------|
| `interview-prep/README.md` | Master index of all coverage files |
| `interview-prep/WORKFLOW.md` | Portable rules + batch review mode |
| `interview-prep/BATCH_PREP_AGREEMENT.md` | Batch + review commands |
| `interview-prep/coverage/_TEMPLATE.md` | Format for all coverage areas |
| `interview-prep/coverage/03-e2e-flows.md` | **Full self-study E2E** (QuickLube scenario, steps 1–10, failure stories) |
| `interview-prep/coverage/03–10, tech, metrics, mock` | Short drafts — **need rewrite in _TEMPLATE format** |
| `interview-prep/diagrams/*.md` | pipeline-async, pipeline-stages, e2e-failure-paths |
| `CONTEXT.md` | Glossary expanded (Recording, Public token, etc.) |
| `context/INTERVIEW_PREP.md` | This handoff + architecture + pitch |

### Notion (published via MCP)

- Architecture decisions **#1–#6** (all checked) + pitch + pipeline notes + mermaid diagrams
- **Not published yet:** coverage 4–10, mock answers, tech concepts, key metrics (hybrid wording)

### Architecture prep (6/6 locked in repo + Notion)

1. Hybrid deployment (not "fully serverless") — EC2 workers + Neon/Upstash/Vercel/S3  
2. Groq Whisper STT  
3. Bedrock Nova Lite + Haiku fallback  
4. Event-driven async pipeline  
5. Five pipeline stages  
6. Multi-tenant design  

### Coverage status

| # | Area | Status |
|---|------|--------|
| 1 | Pitch | locked, Notion |
| 2 | Architecture | locked, Notion |
| 3 | E2E flows | **self-study doc written**; user **ran live E2E** — lock after review |
| 4–10 | Rest | short `draft — batch` only — **rewrite using _TEMPLATE** |

### Live E2E test (user ran — June 4, 2026)

**Test Partner:** Hearloop-test (`hearloop-test@gmail.com`). Partner ID: `58c9ea6f-239b-43b9-bb66-fcaac2db4e10`. API key in user's local shell env only — **rotate** (was pasted in chat).

**Webhook:** webhook.site configured via `PATCH .../settings`.

**Session:** `SESSION_ID=0fca120d-7647-47d5-95a1-bc6e1b5f9a85`, `SESSION_TOKEN=b8e0ff9d-a536-4ff3-90d7-210a9f5830a5`

**Flow executed (curl — capture page 404):**

1. `POST /sessions` → captureUrl returned  
2. `POST .../open` → `opened`  
3. `POST .../upload-url` → presigned S3 URL  
4. `PUT` Desktop `hearloop-test.m4a` → **HTTP 200**  
5. `POST .../finalize` → `submitted`  
6. Poll `GET /sessions/:id` → **`completed`** (`processingStartedAt`/`processingCompletedAt` null — note for interview)  
7. `GET .../result` → transcript + analysis populated  
8. Webhook + dashboard — user should verify  

**Sample result (real):**

- transcript: *"Hello, hello, hello, hello, mic testing, mic testing."*  
- sentiment: neutral (0.5), topics: `other`, qualityFlags: `non_speech`  
- summary noted mic test — pipeline worked end-to-end  

**Blocked issue — production capture page 404:**

- `captureUrl` uses `https://hearloop.vercel.app/capture/:token`  
- Server fetch uses `NEXT_PUBLIC_API_URL` = `.../api/v1` → requests `.../api/v1/public/session/...` → **404**  
- **Working proxy path:** `https://hearloop.vercel.app/api/public/session/:token` (no `/v1` in browser path)  
- **Fix:** Vercel env `NEXT_PUBLIC_API_URL=https://hearloop.vercel.app/api` OR direct `https://18-223-189-193.nip.io/v1`  
- **Workaround used:** curl public routes + local dev: `NEXT_PUBLIC_API_URL=https://hearloop.vercel.app/api npm run dev` in `apps/web`  

**macOS note:** `watch` not installed — use bash `while` loop or `brew install watch`.

### P0 for next session

1. User reviews `03-e2e-flows.md` — add subsection "What I saw in live test" if wanted; `lock coverage 3`  
2. Rewrite `coverage/04`–`10` in **_TEMPLATE** format (not outlines)  
3. Optional: fix INFRA.md `NEXT_PUBLIC_API_URL`; add E2E runbook to `03-e2e-flows.md` appendix  
4. Sync Notion metrics line: hybrid ~$9.60/mo (not "serverless")  
5. Do **not** re-grill architecture unless user asks  

### Commands cheat sheet (production API)

```bash
export API_BASE="https://18-223-189-193.nip.io/v1"
# API_KEY, PARTNER_ID, SESSION_ID from user env
```

---

## External links

| Resource | URL |
|----------|-----|
| Interview Preparation (root) | https://www.notion.so/37207530fa6b81c790b9fad29e0301e5 |
| Projects folder | https://www.notion.so/37207530fa6b81b7900ded1012b486e0 |
| Hearloop page | https://www.notion.so/37207530fa6b814ea093f4143cc57962 |

---

## Markdown scan order (Hearloop)

Use this list before opening any `.ts` / `.tsx` files:

1. `context/INTERVIEW_PREP.md` (this file)
2. `AGENTS.md`
3. `context/DECISIONS.md`
4. `context/CATCHUP.md`
5. `context/METRICS.md`
6. `context/INFRA.md`
7. `.cursor/ARCHITECTURE.md`
8. `.cursor/RESUME_METRICS.md`
9. `.cursor/PROJECT_CONTEXT.md`
10. `testing/load-performance/README.md`, `testing/vulnerability-security/audit-results.md`
11. `README.md`

---

## Notion page ↔ prep sections

| Notion section | Session section below | Status |
|----------------|----------------------|--------|
| Overview | Overview | draft in Notion |
| Architecture Decisions (6 checkboxes) | Architecture decisions | **complete (6/6)** |
| Tech Concepts to Know | tech-concepts.md | draft — batch |
| Key Metrics to Remember | key-metrics.md | draft — batch |
| Mock Interview Questions | 09-mock-interview-bank.md | draft — batch |
| Notes | Session log + polished answers | not started |

---

## Overview (interview-ready)

Multi-tenant voice micro-feedback platform. Businesses embed a widget or use a hosted capture page; customers record ~5 seconds of audio. Structured JSON (transcript, sentiment, topics, urgency, quality flags) is delivered via webhook. Targets low survey-completion industries (automotive, healthcare, hospitality).

---

## Coverage #1 — Pitch & problem (locked)

### 30-second

Hearloop is **voice micro-feedback for businesses** with in-person customers.

**Problem:** Traditional surveys see **under ~5% completion** — people won't stop and type after a service visit.

**Solution:** The customer **taps once, speaks ~5 seconds**, done. The **Partner** (business) gets structured JSON on a **webhook** — transcript, sentiment, topics, urgency.

**Platform:** Multi-tenant B2B — embeddable widget or hosted capture, async backend, Partner dashboard.

### 2-minute (beats)

1. **Problem (~25s):** In automotive, healthcare, hospitality, retail — in-person interactions — email/QR surveys get single-digit completion. You lose signal on wait time, staff, cleanliness, booking friction.
2. **Who (~15s):** **Partners** = businesses (API key, webhook). **End users** = their customers (no account). B2B2C.
3. **Solution (~25s):** ~5 seconds of voice; widget or hosted capture; tap → speak → done.
4. **What Partner gets (~25s):** S3 → async pipeline (validate → Groq STT → Bedrock classify → HMAC webhook) → structured insights, not raw audio.
5. **Why built this way (~20s):** Multi-tenant (`partner_id`, scoped tokens, per-Partner webhook/CORS); hybrid infra ~$9.60/mo at portfolio scale; k6 + OWASP ZAP for defensible claims.
6. **Close (~10s):** Higher completion than surveys, lower customer friction, actionable JSON for the business.

_Status: **locked**. Pushed to Notion._

---

## Architecture decisions

> Checkbox items from Notion. Mark `[x]` when polished answer is ready to publish.

- [x] Why serverless over traditional server? → **See #1 Hybrid deployment** (reframed)
- [x] Why Groq Whisper for STT?
- [x] Why AWS Bedrock Nova Lite for LLM?
- [x] Why event-driven async pipeline?
- [x] Why 5 stages (validate → transcribe → analyze → webhook → expire)?
- [x] Why multi-tenant design?

### Draft answers

#### 1. Hybrid deployment (Notion: "Why serverless?")

**30-second**
- Not fully serverless: **EC2 t3.micro** runs API + **BullMQ workers** — needs a persistent Node process; Lambda is a poor fit (cold start, time limits, no long-running consumers).
- Serverless **where it saves ops/cost**: **Neon** Postgres (auto-pause), **Upstash** Redis, **Vercel** web, **S3** direct upload via presigned URLs.
- Migrated off 24/7 **RDS + ElastiCache** → ~**$9.60/mo** total (was ~$35).
- One-liner: *"Always-on compute for the async pipeline; managed/serverless for data, cache, and frontend."*

**Deep dive**
- **Rejected:** Lambda for workers — BullMQ consumers need always-on process.
- **Rejected:** API proxying audio — browser uploads to S3; API only signs URLs.
- **Tradeoff owned:** Single EC2 = ops surface; mitigated with Docker CI/CD, health monitors, k6 load tests (200 VUs, 149ms p95, 0% errors).
- **Interview trap:** Don't say "fully serverless" — say **hybrid / cost-optimized**.

_Status: draft locked in chat — user may still tweak._

#### 5. Five pipeline stages

**30-second (interview surface)**
- Each stage has different **cost, failure mode, and retry policy** — don't re-run Bedrock because a webhook timed out, or pay Groq on a corrupt file.
1. **Validate** — fail cheap (MIME/size/header) before paid APIs.
2. **Transcribe** — Groq; isolate STT failures; save transcript before LLM.
3. **Analyze** — Bedrock; structured JSON + optional `business_context`; session **`completed` in DB** when insights exist.
4. **Webhook** — delivery to Partner (SSRF, HMAC, retries); decoupled from inference.
5. **Expire** — scheduled cleanup for abandoned sessions; **not** on hot path after finalize.
- One BullMQ **queue per job type** — independent retries/concurrency (shared queue caused real bugs).
- *One-liner:* "Separate stages so I fail fast, retry independently, and decouple AI from Partner delivery."

**Diagram:** [`interview-prep/diagrams/pipeline-stages.md`](../interview-prep/diagrams/pipeline-stages.md)

_Status: **locked**. Pushed to Notion._

#### 6. Multi-tenant design

**30-second (interview surface)**
- **B2B platform** — many **Partners**, one deployment; each Partner's End users leave feedback.
- **Data isolation:** `partner_id` on sessions; API key → one Partner; dashboard scoped to their data only.
- **Scoped capture tokens:** widget **create-token** (TTL, single-use); public **session token** for one recording — raw API key not in browser.
- **Per-Partner:** webhook URL, **allowed_origins** (CORS 403), optional **business_context**.
- **Rate limits** per API key prefix (+ IP on public routes).
- **Tradeoff:** shared infra / noisy neighbor at scale; OK for portfolio.
- *One-liner:* "Multi-tenant infrastructure; isolation via partner_id, scoped tokens, per-partner webhook/CORS."

_Status: **locked**. Pushed to Notion._

#### 4. Event-driven async pipeline

**30-second (interview surface — Notion-ready)**
- **Finalize returns fast** — End user shouldn’t wait on STT + LLM + webhook.
- Work is **seconds-long and can fail** — async jobs **retry per step** without holding HTTP open.
- **API vs workers** — HTTP accepts and enqueues; EC2 workers drain BullMQ on Upstash.
- Session: `processing` → workers set `completed` or `failed`; Partner notified via webhook.
- **vs sync finalize:** timeouts, thread starvation, all-or-nothing failures.

**Diagram:** [`interview-prep/diagrams/pipeline-async.md`](../interview-prep/diagrams/pipeline-async.md)

**Deep dive (self-study):** See chat section "Full pipeline walkthrough" in session log entry 2026-05-31.

_Status: **locked for Notion**._

#### 3. AWS Bedrock Nova Lite (+ Haiku fallback)

**30-second (interview surface)**
- After STT I need **structured JSON** (sentiment, topics, urgency, flags) — not open-ended chat.
- **Nova Lite** on Bedrock is primary: cheap per session on a portfolio budget, ~**~1s** analysis step in practice.
- **Haiku** on Bedrock is fallback when Nova returns unparseable JSON — same IAM/auth path, no second vendor.
- **vs direct Anthropic/OpenAI API:** IAM, one cloud bill, no extra API key sprawl; already on AWS for S3/EC2.
- **Tradeoff:** AWS model catalog + quotas; mitigated by storing `model_used`, token counts, dashboard metrics.
- Optional **business_context** injected into prompt so classification matches the Partner’s domain.

**If they drill down:** Groq = audio; Bedrock = transcript only. Cost measurable from `input_tokens` / `output_tokens` per session.

_Status: **locked**._

#### 2. Groq Whisper for STT

**30-second (interview surface)**
- Short clips (~5s), need **fast STT** so the async pipeline stays responsive; Groq Whisper was the best speed/quality/cost for a solo project.
- **vs AWS Transcribe:** slower and more AWS coupling on a path where I already use Bedrock for analysis.
- **vs self-host Whisper:** no GPU on t3.micro; not worth ops for portfolio scale.
- **Tradeoff:** third-party API dependency — mitigated with job failures/retries and session `failed` state.

**Self-study only (do not lead with this):** "216× realtime" = throughput jargon from docs; means model processes audio much faster than its duration. Interviewers rarely ask; use only if they push on latency math.

_Status: **locked** (interview surface)._

---

## Coverage plan

> **Start here:** [`interview-prep/README.md`](../interview-prep/README.md) — full file index.

| # | Area | Status | File |
|---|------|--------|------|
| 1 | Pitch & problem | locked | [`coverage/01-pitch-and-problem.md`](../interview-prep/coverage/01-pitch-and-problem.md) |
| 2 | Architecture (6) | locked | § Architecture decisions below + Notion |
| 3 | End-to-end flows | self-study + **live E2E run** | [`coverage/03-e2e-flows.md`](../interview-prep/coverage/03-e2e-flows.md) |
| 4 | Scale, performance, cost | draft — batch | [`coverage/04-scale-performance-cost.md`](../interview-prep/coverage/04-scale-performance-cost.md) |
| 5 | Security & reliability | draft — batch | [`coverage/05-security-reliability.md`](../interview-prep/coverage/05-security-reliability.md) |
| 6 | Observability & ops | draft — batch | [`coverage/06-observability-ops.md`](../interview-prep/coverage/06-observability-ops.md) |
| 7 | Data & consistency | draft — batch | [`coverage/07-data-consistency.md`](../interview-prep/coverage/07-data-consistency.md) |
| 8 | Tradeoffs & hindsight | draft — batch | [`coverage/08-tradeoffs-hindsight.md`](../interview-prep/coverage/08-tradeoffs-hindsight.md) |
| 9 | Mock interview bank | draft — batch | [`coverage/09-mock-interview-bank.md`](../interview-prep/coverage/09-mock-interview-bank.md) |
| 10 | Behavioral (STAR) | draft — batch | [`coverage/10-behavioral-star.md`](../interview-prep/coverage/10-behavioral-star.md) |
| — | Tech concepts | draft — batch | [`coverage/tech-concepts.md`](../interview-prep/coverage/tech-concepts.md) |
| — | Key metrics | draft — batch | [`coverage/key-metrics.md`](../interview-prep/coverage/key-metrics.md) |

**Review:** `tweak coverage N: ...` · `lock coverage N` · See [`BATCH_PREP_AGREEMENT.md`](../interview-prep/BATCH_PREP_AGREEMENT.md)

---

## Tech concepts

→ [`interview-prep/coverage/tech-concepts.md`](../interview-prep/coverage/tech-concepts.md)

---

## Key metrics

→ [`interview-prep/coverage/key-metrics.md`](../interview-prep/coverage/key-metrics.md)

---

## Mock Q&A

→ [`interview-prep/coverage/09-mock-interview-bank.md`](../interview-prep/coverage/09-mock-interview-bank.md)

---

## Notion publish pack — Pipeline / async (#4)

Copy into Hearloop page when ready. Full self-study narrative stays in chat history only unless you trim further.

| Notion section | Paste from |
|----------------|------------|
| Architecture checkbox #4 | **30-second** under `#4 Event-driven` below |
| Embed / link diagram | Export from [`interview-prep/diagrams/pipeline-async.md`](../interview-prep/diagrams/pipeline-async.md) (mermaid.live → PNG) or paste Mermaid if your Notion supports it |
| **Notes** | Bullets under **Notion Notes — pipeline walkthrough** below |

### Notion Notes — pipeline walkthrough (short)

**Capture (HTTP, fast)**
- Partner or widget creates a **Session**; widget uses short-lived **create-token**, never raw API key in browser.
- End user records ~5s audio → **presigned S3 upload** (API does not proxy bytes) → **finalize** → session `processing`, HTTP returns immediately.

**Processing (async jobs on EC2 + BullMQ/Upstash)**
1. **Validate** — MIME/size/header checks; fail cheap before paid APIs.
2. **Transcribe** — pull S3 → **Groq Whisper** → store transcript → enqueue analyze.
3. **Analyze** — optional **business_context** → **Bedrock Nova Lite** (Haiku if JSON bad) → session `completed` in DB.
4. **Webhook** — SSRF-safe HTTPS POST + **HMAC**; retries/backoff; Partner notified async.
5. **Expire** (scheduled) — cleanup abandoned/expired sessions; not on hot path after finalize.

**Why async:** STT + LLM + Partner callback = seconds and flaky; sync finalize → timeouts, blocked threads, no per-step retry.

**Why separate stages:** different cost, failure, and retry per step; webhook delivery decoupled from analysis.

---

## Session log

| Date | Topic | Outcome |
|------|-------|---------|
| 2026-05-31 | Workflow setup | Chat-first prep; Notion = revision; md-before-code; created WORKFLOW.md + this file |
| 2026-05-31 | Handoff trigger | **Both** — agent offers when long/section done; user can say "handoff now" anytime |
| 2026-05-31 | Doc conflicts | METRICS.md + AGENTS.md = facts; DECISIONS.md = why; flag conflicts, agree framing |
| 2026-05-31 | Answer format | Two layers (30-sec bullets + deep dive); **revisable** if prep experience suggests otherwise |
| 2026-05-31 | Code access | Only per WORKFLOW.md criteria; ask before opening source if unsure |
| 2026-05-31 | CONTEXT.md | Create at repo root during grill; glossary only; interview answers stay here |
| 2026-05-31 | Grill order | Hearloop first; architecture decisions → tech concepts → mock Q&A |
| 2026-05-31 | Multi-project | One repo per prep session; copy WORKFLOW.md per repo; no mega session file |
| 2026-05-31 | Diagrams | Mermaid in chat first; save to `interview-prep/diagrams/` on request; see DIAGRAM_TRIGGERS.md |
| 2026-05-31 | Skills & coverage | Agent recommends skills + "coverage check" via PREP_CHECKLIST.md / SKILLS_AND_TRIGGERS.md |
| 2026-05-31 | Arch #1 hybrid | Draft locked in INTERVIEW_PREP; CONTEXT.md created |
| 2026-05-31 | Prep calibration | Split **interview surface** vs **self-study**; no vendor jargon unless user asks |
| 2026-05-31 | Arch #2–#3 | Groq STT + Bedrock Nova Lite locked |
| 2026-05-31 | Arch #4 + self-study | Event-driven locked; full pipeline explain in chat; `diagrams/pipeline-async.md` |
| 2026-05-31 | Notion publish | Arch decisions #1–#4 + Notes + mermaid diagram pushed to Hearloop page |
| 2026-05-31 | Arch #5 | Five stages locked; diagram `pipeline-stages.md` |
| 2026-05-31 | Notion publish | Arch #5–#6 + stage/multi-tenant diagrams in Notes |
| 2026-05-31 | Arch #6 | Multi-tenant locked |
| 2026-05-31 | Coverage plan | User approved 10-area queue; arch done; work 1→10 one-by-one (skip #2) |
| 2026-05-31 | Coverage #1 | Pitch 30s + 2min locked; Notion |
| 2026-05-31 | Batch restore | coverage/03–10 + mock + metrics + tech files; interview-prep/README.md index |
| 2026-06-04 | Format | User rejected outline-only batch; `_TEMPLATE.md` + full `03-e2e-flows.md` |
| 2026-06-04 | Live E2E | Hearloop-test; curl public flow; completed; capture 404 bug + INFRA fix noted |
| 2026-06-04 | Handoff | Session block at top of this file for next chat |

---

## Open items

- [x] Workflow, index, arch 6/6, pitch, `03-e2e-flows.md` explained
- [x] Live E2E run (pipeline completed)
- [x] **Phase 1 platform** — see `context/PHASE1_PLATFORM.md` (session login, embed keys, onboarding)
- [ ] Deploy Phase 1 + migration `006` + `PARTNER_SESSION_SECRET`
- [x] `apps/quicklube-demo` (widget embed; deploy + env pending)
- [ ] `lock coverage 3` after user review
- [ ] Rewrite coverage 4–10 in _TEMPLATE format
- [ ] Vercel `NEXT_PUBLIC_API_URL` fix for hosted capture
- [ ] Notion sync on request (metrics: hybrid ~$9.60/mo)
- [ ] Rotate test API key (exposed in chat)

---

## Glossary pointers

Domain terms live in repo-root [`CONTEXT.md`](../CONTEXT.md) — created/updated as terms lock during grill. Do not duplicate implementation detail there or here.
