# Spec: Hearloop Insights query

You may know this document as a **PRD**.

**Status:** Approved v4 — signed for **BRD and ticket decomposition**  
**Signed by:** Shubh (Aug 17, 2026): OD-7 A, OD-8 waive for pilot, OD-9 yes, OD-10 accept  
**Source:** `docs/superpowers/specs/2026-08-17-insights-query-design.md` (accepted)  
**Skill:** Matt `to-spec` synthesis + Sol 5.6 / Sonnet review passes (v4)  
**Not:** BRD, implementation plan, GitHub issue set (publish separately if authorized)

**Pilot still requires:** §4 launch gates, **OD-6** (`versioned-v1` production flip), and pinning integrity on new Sessions.

---

## Problem Statement

A **Partner** who captures visit feedback cannot trust two things at once:

1. **Insights labels** (sentiment, topics, urgency, flags) are accurate enough to filter on.
2. **Answers** to questions over their feedback are grounded in real **Sessions**, not fluent guesses.

Hearloop already runs **Capture → Pipeline → Insights**. The gap is not a missing lakehouse. The gap is no published label promotion gates, no query layer that returns **Cited answers**, and voice evidence integrity still unfinished on unreleased pinning work.

The Partner wants **facts**, not Hearloop telling them what to do. The builder wants **eval + citations**, not training on a warehouse dump.

---

## Solution

Keep the existing **Pipeline** spine. Add **Insights query** in the Partner dashboard:

- Bounded questions (count, list, quote) over that Partner’s **completed Sessions** in Postgres.
- **Cited answers** with inspectable evidence, or an explicit **refusal**.
- **Zero count** is a valid answer; **quote with no matches** is a refusal.

Improve accuracy with **eval’d labels** and **citations**, not fine-tuning on bulk data.

**Signed product choices (Shubh, Aug 17, 2026):**

| ID | Decision |
| --- | --- |
| **OD-7** | **A** — Exclude all `legacy-v0` Sessions from query corpus; only pinned / `versioned-v1` completed Sessions are citable |
| **OD-8** | **Waive classifier lineage for pilot** — show `modelUsed` only; **re-decide before GA** (persist lineage or waive for GA) |
| **OD-9** | **Yes** — count uses `totalCount` + paginated `evidenceResultsUrl`; count does not cite every Session |
| **OD-10** | **Accept** — 90d max range, 50 list page size, 10 quote citations, 5s p95 pilot latency target |

---

## User Stories

### Partner

1. As a **Partner**, I want **Insights** for each completed Session (transcript, sentiment, topics, urgency, flags) and that Session’s **Target** (Session metadata, not inside Insights), so that I have visit facts without Hearloop prescribing ops.
2. As a **Partner**, I want to ask how many completed Sessions match filters, so that I get an authoritative `totalCount` I can verify via a full evidence view.
3. As a **Partner**, I want a paginated **evidence results** link when `totalCount > 0`, so that I can inspect every matching Session without the answer embedding hundreds of citations.
4. As a **Partner**, I want a list of matching Sessions with dashboard links, so that I can open each Session’s facts.
5. As a **Partner**, I want short quotes from matching Sessions with Session links, so that I hear wording tied to evidence.
6. As a **Partner**, I want `totalCount: 0` to be a normal answer, so that “none this week” is not treated as failure.
7. As a **Partner**, I want refusal for “what should I do” and open-ended chat, so that Hearloop stays a facts product.
8. As a **Partner**, I want only my Sessions in results, so that another business’s feedback never appears.
9. As a **Partner**, I want Insights delivery (dashboard list, webhook, urgent-alert email) even when Insights query is off, so that gates on query do not break today’s product.

### End user

10. As an **End user**, I want to record after a visit via Capture link / QR, Hosted capture, or widget, so that I can give feedback without a Hearloop account.
11. As an **End user**, I want no access to Insights query, so that staff questions stay in the Partner dashboard.

### Builder

12. As the **builder**, I want a published `GOLDEN_SET` diagnostic in metrics, so that label regression is a number (not a launch gate by itself).
13. As the **builder**, I want Partner-action holdout **15/15** and classifier injection **5/5** before any Partner sees query, so that filters like negative and urgent mean something.
14. As the **builder**, I want query citation, refusal, and query-injection suites at **100%** before Partner pilot, so that grounded answers are a launch gate equal to labels.
15. As the **builder**, I want to run Insights query internally on staging with seeded pinned Sessions before gates pass, so that I can build without exposing a lying bot.
16. As the **builder**, I want legacy Sessions excluded from query (OD-7 A), so that Partner-facing query never cites voice Sessions without pinned evidence — accepting an **empty corpus** until `versioned-v1` traffic exists.
17. As the **builder**, I want production `versioned-v1` flip authorized (OD-6) before Partner pilot, so that new Sessions enter the query corpus.
18. As the **builder**, I want pinning integrity (workers read pin; delete honors pin) before Partner pilot, so that new Sessions are trustworthy.
19. As the **builder**, I want rollout stages (builder → gated pilot → GA) with kill switches, so that query can be turned off per Partner or globally.
20. As the **builder**, I want pilot metrics (answer rate, evidence opens, repeat use, incorrect citation reports, latency), so that GA is evidence-based not vibe-based.

### Insights query behavior (Partner-facing detail)

21. As a **Partner**, I want single-turn questions only, so that there is no multi-turn chat or follow-up memory.
22. As a **Partner**, I want half-open time ranges in my timezone, so that “this week” does not have DST or end-of-day bugs.
23. As a **Partner**, I want deleted Sessions to show as removed on drill-down, so that point-in-time answers are honest after privacy deletes.
24. As a **Partner**, I want list results paginated (50 per page) and quote results capped (10 with disclosure), so that answers stay usable.
25. As a **Partner**, I want query date range capped at 90 days, so that overly broad questions are refused clearly.

---

## Implementation Decisions

### Spine (keep)

- Capture surfaces, Session lifecycle, Pipeline (validate → transcribe → analyze → webhook, expiry), Insights persistence, dashboard, webhook delivery, urgent-alert email. Improve; do not replace with ELT.

### Insights query (new)

- **Surface:** Partner dashboard only; Partner **owner** until OD-3 (staff roles) is signed.
- **Store:** Postgres Sessions + analyses + Session metadata (Target). No lakehouse v1.
- **Intents:** `count`, `list`, `quote` only. No recommendations, no multi-turn.
- **Tenant scope:** Server-side Partner filter on every retrieval. Cross-Partner data is impossible by construction — not exposed as a probeable refusal.
- **Corpus:** Completed Sessions only. **OD-7 A:** `upload_protocol = versioned-v1` with pinned evidence (non-legacy). ~1,882 legacy Sessions and 0 versioned-v1 today → **empty Partner query corpus until OD-6 flip and new captures**.

### Cited answer contract (OD-9 signed)

```text
CitedAnswer {
  summary: string
  totalCount?: number          // required for count intent
  evidenceResultsUrl?: string  // required when count intent and totalCount > 0
  citations?: Citation[]       // list and quote intents only
  refusal?: { code, message, suggestedIntents? }
}

Citation {
  sessionId, dashboardUrl, supports: "list_item" | "quote"
  quote?: string               // quote intent only
  modelUsed?: string            // from analyses.model_used (OD-8: no lineage in pilot)
}
```

- Count intent: **no per-Session citations**. `totalCount` is authoritative; full set via `evidenceResultsUrl`.
- Zero count: valid answer, not refusal. Zero matches on **quote**: refusal `insufficient_evidence`.

### Filter scope (OD-1 open — default Proposal A for count/list draft)

- **Proposal A (draft default):** sentiment, urgency, topic, calendar time range, Target (Session metadata).
- **Quote retrieval** waits on OD-1 sign-off and OD-4 (SQL vs embedding).

### Time semantics

- Half-open ranges `[start, nextPeriodStart)` in Partner timezone (OD-2 open; fallback UTC).

### Operational limits (OD-10 signed)

| Limit | Value | On exceed |
| --- | --- | --- |
| Max date range | 90 days | Refusal `range_too_wide` |
| List page size | 50 | Paginate |
| Max quote citations | 10 | Truncate + disclose in summary |
| Query p95 (pilot) | 5 s | Blocks GA if sustained above target |

### Classifier versions (OD-8 signed for pilot)

- Persisted field today: **`model_used` only**. Citations expose `modelUsed`.
- **Pilot:** no `analyzeRunId` / prompt version — known limitation, waived for pilot.
- **GA:** must sign OD-8 again — implement lineage or waive explicitly for GA.

### Evidence / pinning

- Pinning code (workers + delete/sweep + tests) prerequisite for trustworthy **new** Sessions.
- **OD-6:** production `versioned-v1` flip required before Partner **pilot** (with OD-7 A).
- Legacy Sessions cannot be retroactively proven; exclusion is permanent for query unless re-captured under versioned protocol.

### Deleted Sessions

- Answers are point-in-time. Session detail 404 + “Session removed”; evidence results refresh excludes deleted rows.

### Launch gates (all before Partner pilot)

| Gate | Bar | Current status |
| --- | --- | --- |
| `GOLDEN_SET` | Diagnostic only | **17/23** published |
| Partner-action holdout | **15/15** | Not run live |
| Classifier injection | **5/5** | Previously **3/5** |
| Query citations | **100%** | Suite not built |
| Query refusals | **100%** | Suite not built |
| Query injection | **100%** | Suite not built |
| Cross-Partner isolation | **0** leaks | Tests not built |

### Rollout

| Stage | Audience | Kill switch |
| --- | --- | --- |
| 0 — Builder | Staging/dev, seeded data | Prod flag off |
| 1 — Gated pilot | Named Partners after gates + OD-6 | Per-Partner flag |
| 2 — GA | All Partners | Global + per-Partner |

**Pilot → GA:** ≥14 days or ≥50 supported queries; zero isolation incidents; eval suites 100%; answer rate ≥70%; p95 within OD-10; **OD-8 re-signed for GA**.

---

## Testing Decisions

### What makes a good test

- Exercise **external behavior** through public interfaces: HTTP response shape, eval scores, isolation.
- Wrong Session id in a citation fails even if prose sounds right.
- No Bedrock in unit tests for label eval.
- Do not test model internals or “fluent” prose quality without a frozen gold set.

### Test seams (Matt `to-spec` — prefer highest seam)

| Seam | What it tests | Priority |
| --- | --- | --- |
| **1. Partner Insights query HTTP API** | Auth scope, Cited answer JSON, refusal codes, `totalCount` + `evidenceResultsUrl`, zero-count vs refusal, pagination limits | **Primary** — ideal single integration seam with seeded Postgres |
| **2. Label eval graders** | Partner-action mapping, injection partition, promotion decision | Existing pure functions — no Bedrock |
| **3. Pipeline pin integrity** | Validate/transcribe read pinned VersionId; delete removes exact version | Job-level integration |
| **4. Query eval corpora** | Frozen questions → Session ids; refusal cases; query injection cases | New — blocks pilot |

**Ideal:** one primary seam = authenticated query API against seeded Sessions. Label and pin seams stay separate slices; they gate pilot but are not the query feature seam.

### Prior art

- Golden-set and grade-insights tests in API eval package.
- Session route tests for upload protocol dispatch.
- Pipeline job tests for validate/transcribe/analyze.

---

## Out of Scope

- Lakehouse / Snowflake / Databricks as source of truth or training set
- Fine-tuning on bulk feedback
- Knowledge graph
- Multi-turn chat, recommendations, ticketing
- Stars, MCQ, yes/no, arbitrary forms (later appendix)
- Live shop as launch gate
- Champion auto-promote, Bedrock in CI, Kaggle
- Citing legacy Sessions in query (OD-7 A signed)
- Classifier lineage in pilot UI (OD-8 waived for pilot only)
- GitHub issue publish from this file alone

---

## Further Notes

### Behavioral annex

Worked examples, refusal matrix, and deleted-Session behavior: see **Annex A** below (preserved from v3 reviews).

### Open decisions (not blocking BRD / early tickets)

| ID | Topic | Blocks |
| --- | --- | --- |
| OD-1 | Filter scope A/B/C | Quote tickets |
| OD-2 | Timezone source | Implementation detail |
| OD-3 | Staff roles | Post–owner-only |
| OD-4 | SQL vs embedding for quotes | Quote tickets |
| OD-5 | Query injection case list | Query eval ticket |
| OD-6 | Production `versioned-v1` flip | **Partner pilot** |
| OD-8 (GA) | Lineage vs waive for GA | **GA** (pilot waived) |

### Document chain

| Doc | Next step |
| --- | --- |
| Design spec | Strategic direction |
| This spec (PRD) | **Approved** |
| BRD | Why citations + eval; cost |
| Tickets (`to-tickets`) | After BRD |

### Dual review summary (Sol 5.6 + Sonnet criteria, v4)

| Reviewer lens | v3 score | v4 verdict |
| --- | --- | --- |
| **Sol 5.6** | 8.5 conditional | **9.0 — approve for BRD/tickets** after OD sign-off; OD-6 empty-corpus risk documented |
| **Sonnet** | 9/10 ship-ready modulo OD-1, OD-6 | **9.5 — approve**; OD-1 still blocks quote; OD-6 blocks pilot |

**Remaining before Partner pilot (not BRD):** §4 gates, OD-6, pinning integrity, query eval suites built.

### Revision log

| Ver | Trigger | Change |
| --- | --- | --- |
| v1–v3 | Reviews | See git history / prior headers |
| v4 | OD sign-off + `to-spec` | Matt template; signed OD-7/8/9/10; test seams; approved status |

---

## Annex A — Worked examples and refusal matrix

### Count (zero — valid)

**Q:** How many urgent Sessions this week at North Ave?  
**A:** `totalCount: 0`, `evidenceResultsUrl: null`, `citations: []`, `refusal: null`

### Count (non-zero)

**Q:** How many negative Sessions last 7 days?  
**A:** `totalCount: 3`, `evidenceResultsUrl: /dashboard/query/results?…`, `citations: []`

### Quote refusal (no evidence)

**Q:** Quote battery acid at North Ave.  
**A:** `refusal: insufficient_evidence`

### Unsupported intent

**Q:** What should I do about rude staff?  
**A:** `refusal: unsupported_intent`

### Intent × zero matches

| Intent | Zero matches |
| --- | --- |
| Count | Valid `totalCount: 0` |
| List | Valid empty list |
| Quote | Refusal |

### Post-launch pilot metrics

Supported-query answer rate, evidence open rate, repeat query use, Partner-reported incorrect citation, query p95 latency.
