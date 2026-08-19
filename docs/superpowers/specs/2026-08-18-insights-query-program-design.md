# Insights query — program design (slice 1)

**Gate:** 3 of 4 (product → architecture → **program design** → slices)  
**Status:** Approved — owner 2026-08-18  
**Implements:** `docs/superpowers/specs/2026-08-17-insights-query-architecture.md`  
**Scope:** Builder demo, Path A. Not Partner launch.

**Locked this session (2026-08-18):** defaults D1–D12, except **D3** (API + tiny dashboard form) and **D8** (stub `evidenceResultsUrl`).

This page settles **which files** and **how one request flows**. An implementer should not invent extra endpoints, parsers, or CloudWatch here.

---

## Slice 1 “done”

Against **mocked or seeded** `versioned-v1` Sessions, with the flag on:

1. Signed-in builder submits **count** (sentiment + Target key + from/to).
2. Response is a **Cited answer**: `totalCount`, a **stub** `evidenceResultsUrl`, no per-Session citations.
3. Unsupported intent or range > 90 days → **refusal**.
4. Partner B’s Sessions never appear in Partner A’s count.
5. Dashboard shows a small form when the API says the flag is on; flag off → 404 and no form.

List, quote, real evidence pagination, urgency/topic filters, CloudWatch, OD-6: **out**.

---

## Files (one job each)

| File | Job |
| --- | --- |
| `apps/api/src/lib/insights-query-enabled.ts` | Read `INSIGHTS_QUERY_ENABLED`; unset / not `"true"` → off |
| `apps/api/src/lib/parse-insights-query.ts` | Validate body → `{ intent, filters }` or throw typed error |
| `apps/api/src/lib/count-insights-sessions.ts` | SQL COUNT with tenant + corpus + filters |
| `apps/api/src/lib/insights-query-stub-evidence-url.ts` | Return the stub URL string (no HTTP handler) |
| `apps/api/src/routes/insights-query.ts` | `POST /partners/me/insights-query` only |
| `apps/api/src/lib/register-routes.ts` | Register the new route under `/v1` |
| `apps/api/src/routes/partner-me.ts` | Add `insightsQueryEnabled: boolean` on **GET `/partners/me`** (same Partner profile payload; UI needs this because Vercel cannot read EC2 env) |
| `apps/web/components/InsightsQueryPanel.tsx` | Form + POST + render answer/refusal |
| `apps/web/app/dashboard/page.tsx` | Render the panel on the home dashboard when `insightsQueryEnabled` |
| Tests next to the lib/route they cover | Isolation, flag-off 404, refusal, zero count |

Do **not** add `INSIGHTS_QUERY_ENABLED` to `validateEnv()` required keys.  
Do **not** add a Vercel `NEXT_PUBLIC_*` flag.  
Do **not** change `apps/web/app/api/[...path]/route.ts` — POST already proxies `/api/partners/me/insights-query` → `/v1/partners/me/insights-query`.

---

## Request flow

```
Dashboard InsightsQueryPanel
  GET /api/partners/me  →  insightsQueryEnabled
  if false: render nothing
  if true: POST /api/partners/me/insights-query  { intent, filters }
    → authenticatePartner (existing)
    → if !enabled: 404
    → parse body
    → if not count: 200 CitedAnswer.refusal unsupported_intent
    → if range invalid / > 90d: 200 refusal range_too_wide
    → count-insights-sessions(partnerId, filters)
    → 200 CitedAnswer (totalCount + stub evidenceResultsUrl)
```

HTTP **200** for both answers and product refusals. **404** only when the feature is off (or unknown route). **401** from existing auth. **400** only if JSON is malformed (missing `intent`, unknown filter keys).

Partner id is **only** `req.partner.id`. Body must not accept `partnerId`.

---

## Body and filters (slice 1)

```ts
type InsightsQueryIntent = "count" | "list" | "quote";

type InsightsQueryFilters = {
  sentiment?: "positive" | "neutral" | "negative";
  targetKey?: string;
  from: string; // ISO-8601 instant, UTC
  to: string;   // ISO-8601 instant, UTC; exclusive end
};
```

**POST body:** `{ "intent": "count", "filters": { "from": "...", "to": "...", "sentiment": "negative", "targetKey": "north-ave" } }`

- `from` and `to` are required for `count`.
- `sentiment` and `targetKey` are optional.
- Extra keys → 400.
- `intent` other than `count` → 200 + `refusal.code = "unsupported_intent"` (this is how “what should I do?” is refused: the form does not send it; a raw POST of `intent: "recommend"` is the test).
- `(to - from) > 90 days` → `range_too_wide`.
- `to <= from` → `range_too_wide`.

Target: filter `sessions.metadata_json` JSON path used today (`target.key`), not a new column.

Timezone: **UTC only** (OD-2 parked).

---

## SQL (count)

Always:

- `sessions.partner_id = :partnerId`
- `sessions.status = 'completed'`
- `sessions.upload_protocol = 'versioned-v1'`
- `sessions.created_at >= :from AND sessions.created_at < :to`
- left join `analyses` when `sentiment` is set → `analyses.sentiment_label = :sentiment`
- when `targetKey` is set → metadata Target key equals that string

**Zero rows → `totalCount: 0`**, valid answer, not a refusal.

`count-insights-sessions` returns a number only. The route builds `CitedAnswer`.

---

## Cited answer (slice 1)

```ts
type CitedAnswer = {
  summary: string;
  totalCount: number;
  evidenceResultsUrl: string; // stub, see below
  citations?: undefined;
  refusal?: { code: string; message: string; suggestedIntents?: string[] };
};
```

When refusing, omit `totalCount` / `evidenceResultsUrl`; set `refusal` and a short `summary`.

**Stub URL (locked):**  
`/api/partners/me/insights-query/evidence`  

No GET handler in slice 1 → clicking it **404s**. The UI must label it “Evidence list not built yet.” Do not invent a working sessions deep-link.

---

## Dashboard UI

- New component `InsightsQueryPanel` (same pattern as `CaptureLinksPanel`: fetch + form, not dumped into `page.tsx` logic).
- Parent: dashboard **home** (`nav === "dashboard"`), below the metric cards.
- Show only if GET `/api/partners/me` has `insightsQueryEnabled === true`.
- Controls: intent fixed to **Count** (display only); sentiment select (any / pos / neu / neg); Target key text input; from/to datetime inputs (send UTC ISO).
- Submit → POST; show `summary`, `totalCount`, and the stub link with the “not built” note.
- Refusal: show `refusal.message`.
- Flag off: panel not mounted (no error toast).

Copy: label the card **Insights query (demo)** so it is not mistaken for a Partner product.

---

## Tests (Jest, mocked `db` — existing API pattern)

| Test | Passes when |
| --- | --- |
| Flag off | POST → 404; GET `/partners/me` has `insightsQueryEnabled: false` |
| Flag on, `intent: "list"` | 200, `refusal.code === "unsupported_intent"` |
| Range 91 days | 200, `range_too_wide` |
| Count 0 | 200, `totalCount === 0`, stub URL present |
| Isolation | Partner A request; mock/query builder must be called with A’s id only; a row for B must not affect A’s count |
| Unknown filter key | 400 |

No live Neon. No Bedrock. No new CloudWatch test.

---

## Logging

Fastify request log is enough. If a structured line is added, fields: `intent`, `refusalCode` or `totalCount`, `latencyMs`. **Never** log a free-text question (there isn’t one). No `partnerId` in log dimensions.

---

## Out of this page / slice 1

- `list` / `quote` SQL and citations
- Working evidence GET
- Urgency / topic filters
- Partner timezone
- `Hearloop/InsightsQuery` metrics
- Production `versioned-v1` flip
- GitHub issues, deploy, commit (unless you ask)

---

## Next gate

Implementation plan: `docs/superpowers/plans/2026-08-18-insights-query-slice-1.md`. Code only after you pick how to execute.
