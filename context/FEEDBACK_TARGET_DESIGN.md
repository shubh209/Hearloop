# Feedback Target — Design

> Goal: a Partner pastes **one** embed snippet across their whole site, and every Session
> is automatically attributed to **what the feedback is about** (a product, a page, a
> service, a location). The dashboard then groups Insights and trends by that thing.
>
> Status: **design / not built.** No code yet.

---

## Domain language (proposed — to fold into `CONTEXT.md` once accepted)

**Target** — the thing a Session's feedback is about. Generalizes beyond "product" so it
fits service verticals too (a product page, a booking page, a clinic location, a service).
Identified by a normalized `target_key` and a human `target_label`.
_Avoid_: "Product" (too narrow — Hearloop also serves automotive/healthcare/hospitality).

**Page context** — the raw bundle the widget reads from the page it is embedded on
(`url`, `title`, JSON-LD product data, OG tags). A Target is *derived* from page context.
_Avoid_: "Scrape result" (nothing is scraped server-side — see Decision below).

**Target identity merge** — Partner-facing cleanup that collapses near-duplicate Targets
(e.g. `Blue Widget` vs `blue-widget` vs `/products/blue-widget?ref=ig`) into one.

---

## Decision: client-side page-context read, NOT server-side web scraping

The widget runs **inside the customer's browser, on the exact page they are viewing.**
It already has the DOM. We read context client-side and send it with the Session. We do
**not** have the Hearloop backend fetch and parse partner URLs.

**Why not server-side scraping:**

| Concern | Server-side scrape | Client-side read (chosen) |
|---|---|---|
| SSRF | Backend fetches arbitrary partner URLs — reintroduces the exact risk `deliver-webhook.ts` guards against | No backend fetch at all |
| SPAs (Shopify/React) | Server gets an empty HTML shell; product renders client-side → detects nothing | Reads the live, rendered DOM |
| Latency / free-tier cost | Extra fetch + parse per Session on t3.micro + Neon/Upstash quota | Zero extra network calls |
| Auth / staleness | Page may need login or differ from what the customer saw | Exactly what the customer saw |
| Privacy | Backend pulls full pages | Capture only metadata, never page body/PII |

This is deterministic parsing (no ML), and it is a strong interview line:
*"zero-config feedback attribution via client-side structured-data extraction — one snippet,
auto-tagged per page, no SSRF, no backend fetch."*

---

## Detection tiers (first match wins, explicit always overrides)

| Tier | Source | Yields |
|---|---|---|
| 0 | Explicit `data-hl-target` attribute / `target` prop in `@hearloop/react` | label + key (authoritative) |
| 1 | **JSON-LD `Product`** (`<script type="application/ld+json">`, `@type: Product`) | name, sku, price — gold standard, most e-commerce emits this for SEO |
| 2 | OpenGraph / meta (`og:title`, `product:*`, `<meta name="...">`) | name |
| 3 | URL path + `document.title` | label from path + title (always-available fallback) |

The widget emits a `pageContext` bundle:

```jsonc
{
  "url": "https://shop.example.com/products/blue-widget",
  "title": "Blue Widget — Example Shop",
  "targetLabel": "Blue Widget",
  "targetKey": "blue-widget",      // normalized: lowercased, path-based, query stripped
  "sku": "BW-001",                 // when available (JSON-LD)
  "source": "json-ld"              // which tier produced it (for trust/debugging)
}
```

`targetKey` normalization (prevents cardinality explosion):
strip query string + fragment, lowercase, trim trailing slash, prefer SKU when present,
else last meaningful path segment, else hostname.

---

## Data model — phased

**Phase 1 (no migration):** ride the existing `sessions.metadata_json` channel.
The dashboard already selects and parses `metadata_json`. Store `pageContext` there and
group client-side. Ships fast, proves the detector, zero schema risk.

**Phase 2 (migration `007`):** promote to first-class once the shape is stable.

```sql
-- 007_feedback_targets.sql (proposed)
create table feedback_targets (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  target_key  text not null,              -- normalized identity
  label       text not null,              -- display name (partner-editable)
  sku         text,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  merged_into uuid references feedback_targets(id),  -- identity merge
  unique (partner_id, target_key)
);

alter table sessions add column target_id uuid references feedback_targets(id);
create index idx_sessions_target_id on sessions(target_id);
```

A Target is upserted at finalize time from `pageContext.targetKey`; `sessions.target_id`
is set. `merged_into` lets the Partner collapse duplicates without losing history.

---

## Flow

```
Widget (browser)                  API / pipeline                     Dashboard
─────────────────                 ──────────────                     ─────────
read pageContext (tier 0→3)
  └─ POST finalize {pageContext} → store in metadata_json (P1)
                                   upsert feedback_target (P2)
                                   set sessions.target_id (P2)
                                   → existing validate→transcribe→analyze→webhook
                                                                      group Insights by Target;
                                                                      per-Target sentiment + trend;
                                                                      identity-merge UI
```

The analyze step can optionally pass `targetLabel` into the Bedrock prompt as extra
context (alongside `business_context`) for sharper topic/sentiment — but attribution
does **not** depend on the LLM. It is deterministic from page context.

---

## Dashboard changes (this is what makes it "real")

- New **"By Target"** view: list of Targets with session count, % positive, urgent count,
  and a sparkline trend — replacing the hardcoded `LOCATIONS` mock.
- Per-Target drill-in: sentiment over time (real time-series, replacing the
  "wire to real data in v2" placeholder), top topics, recent transcripts.
- **Identity merge** control on the Target list.

---

## Edge cases & guardrails

- **No detectable context** → Target = "Unattributed" (URL/host fallback). Never block capture.
- **Cardinality** → normalization above; cap distinct Targets shown, bucket the long tail.
- **Privacy** → capture metadata only (url, title, structured product fields). Never the page
  body, never form/PII content. Document this for Partners.
- **Spoofing** → page context is partner-origin data already gated by `allowed_origins`; treat
  `targetLabel` as untrusted display text (escape in dashboard).

---

## What to measure (per `measure-everything`)

| Metric | How | Baseline | Target |
|---|---|---|---|
| Attribution coverage | % of completed Sessions with a non-"Unattributed" Target | capture after Phase 1 | >80% on a JSON-LD site |
| Detection source mix | count by `source` (json-ld / og / url) | — | JSON-LD dominant on e-commerce |
| Partner setup effort | # of config steps to attribute N product pages | manual today = N | **1** (one snippet) |
| Dashboard "real data" ratio | mock arrays remaining in `dashboard/page.tsx` | many | 0 |
| Added latency | finalize p95 before vs after | current finalize p95 | ~0 (no server fetch) |

---

## Rollout / tasks (tracer-bullet order)

1. **Widget detector** (`packages/react` + `public/widget.js`): tiered `pageContext`
   reader + `targetKey` normalizer (single-responsibility file, e.g. `detect-target.ts`).
2. Send `pageContext` on finalize; persist to `metadata_json` (Phase 1).
3. Surface raw Target on the dashboard session list (prove it end-to-end on quicklube-demo).
4. **By-Target dashboard view** + real per-Target time-series; delete the mock arrays.
5. Migration `007` + finalize-time upsert + `sessions.target_id` (Phase 2).
6. Identity-merge UI.
7. (Optional) pass `targetLabel` into the analyze prompt.

---

## Open questions

- Phase 2 trigger: do we need `feedback_targets` for the demo, or is `metadata_json`
  grouping enough to tell the story? (Lean: ship P1, only migrate when the merge UI needs it.)
- Should explicit `data-hl-target` be required for non-e-commerce verticals, or is
  URL/title fallback good enough? (Lean: fallback is fine; explicit is the power-user path.)
- Trend window + bucketing (daily/weekly) for the per-Target time-series.
