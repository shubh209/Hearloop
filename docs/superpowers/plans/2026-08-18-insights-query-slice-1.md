# Insights Query Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a flag-gated Partner count query (Cited answer or refusal) plus a demo dashboard form, without list/quote, CloudWatch, or a production protocol flip.

**Architecture:** New read-only Fastify route on the existing API. SQL counts that Partner’s completed `versioned-v1` Sessions. Dashboard panel appears only when GET `/partners/me` reports the flag. Evidence URL is a stub that 404s.

**Tech Stack:** TypeScript, Fastify, Kysely, Jest (API, mocked `db`), Next.js dashboard component. No new packages.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-18-insights-query-program-design.md` (approved).
- Architecture: `docs/superpowers/specs/2026-08-17-insights-query-architecture.md`.
- One job per file (Hearloop SRP).
- TDD: no production code before a failing test for that unit.
- Do not add `INSIGHTS_QUERY_ENABLED` to `validateEnv()` required keys.
- Do not add `NEXT_PUBLIC_*` flags. Do not edit `apps/web/app/api/[...path]/route.ts`.
- Do not implement list/quote SQL, evidence GET, urgency/topic filters, OD-6, or CloudWatch.
- Do not call Bedrock or live Neon in Jest.
- Do not merge, deploy, or open GitHub issues.
- Do not `git commit` unless the user explicitly asks (user rule overrides this skill’s commit steps).
- Domain words: Partner, Session, Insights, Target, Cited answer, Insights query.
- `INSIGHTS_QUERY_ENABLED === "true"` is on; unset / any other value is off.

---

### Task 1: Feature flag helper

**Files:**
- Create: `apps/api/src/lib/insights-query-enabled.ts`
- Create: `apps/api/src/lib/__tests__/insights-query-enabled.test.ts`

**Interfaces:**
- Consumes: `NodeJS.ProcessEnv`
- Produces: `isInsightsQueryEnabled(env?: NodeJS.ProcessEnv): boolean`

- [ ] **Step 1: Write the failing test**

```ts
import { isInsightsQueryEnabled } from "../insights-query-enabled";

describe("isInsightsQueryEnabled", () => {
  it("is false when unset", () => {
    expect(isInsightsQueryEnabled({})).toBe(false);
  });

  it("is false when not the string true", () => {
    expect(isInsightsQueryEnabled({ INSIGHTS_QUERY_ENABLED: "1" })).toBe(false);
    expect(isInsightsQueryEnabled({ INSIGHTS_QUERY_ENABLED: "TRUE" })).toBe(
      false
    );
  });

  it("is true only for the string true", () => {
    expect(
      isInsightsQueryEnabled({ INSIGHTS_QUERY_ENABLED: "true" })
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- src/lib/__tests__/insights-query-enabled.test.ts --runInBand`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
export function isInsightsQueryEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env.INSIGHTS_QUERY_ENABLED === "true";
}
```

- [ ] **Step 4: Run test to verify it passes**

Same command. Expected: PASS

---

### Task 2: Stub evidence URL

**Files:**
- Create: `apps/api/src/lib/insights-query-stub-evidence-url.ts`
- Create: `apps/api/src/lib/__tests__/insights-query-stub-evidence-url.test.ts`

**Interfaces:**
- Produces: `INSIGHTS_QUERY_STUB_EVIDENCE_URL` and `insightsQueryStubEvidenceUrl(): string`

- [ ] **Step 1: Write the failing test**

```ts
import { insightsQueryStubEvidenceUrl } from "../insights-query-stub-evidence-url";

describe("insightsQueryStubEvidenceUrl", () => {
  it("returns the locked stub path", () => {
    expect(insightsQueryStubEvidenceUrl()).toBe(
      "/api/partners/me/insights-query/evidence"
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- src/lib/__tests__/insights-query-stub-evidence-url.test.ts --runInBand`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
export const INSIGHTS_QUERY_STUB_EVIDENCE_URL =
  "/api/partners/me/insights-query/evidence";

export function insightsQueryStubEvidenceUrl(): string {
  return INSIGHTS_QUERY_STUB_EVIDENCE_URL;
}
```

- [ ] **Step 4: Run test to verify it passes**

Same command. Expected: PASS

---

### Task 3: Parse Insights query body

**Files:**
- Create: `apps/api/src/lib/parse-insights-query.ts`
- Create: `apps/api/src/lib/__tests__/parse-insights-query.test.ts`

**Interfaces:**
- Produces:
  - `InsightsQueryIntent = "count" | "list" | "quote"`
  - `InsightsQueryFilters`
  - `ParsedInsightsQuery`
  - `InsightsQueryParseError` (`statusCode: 400`)
  - `parseInsightsQuery(body: unknown): ParsedInsightsQuery`
  - `isRangeTooWide(from: Date, to: Date): boolean` (90 days, exclusive-end window)

**Rules (copy exactly):**
- Body must be an object with `intent` (string) and `filters` (object).
- Allowed filter keys: `from`, `to`, `sentiment`, `targetKey`. Extra keys → parse error.
- `sentiment` if present: `positive` | `neutral` | `negative`.
- `targetKey` if present: non-empty string.
- `intent` `count` | `list` | `quote` | any other non-empty string (unknown intents are parsed so the route can refuse with 200).
- For `intent === "count"`: `from` and `to` required, parseable ISO-8601.
- `isRangeTooWide`: true if `to.getTime() <= from.getTime()` OR `(to - from) > 90 * 24 * 60 * 60 * 1000`.

- [ ] **Step 1: Write the failing test**

```ts
import {
  InsightsQueryParseError,
  isRangeTooWide,
  parseInsightsQuery,
} from "../parse-insights-query";

const from = "2026-01-01T00:00:00.000Z";
const to = "2026-01-08T00:00:00.000Z";

describe("parseInsightsQuery", () => {
  it("parses a count body", () => {
    const parsed = parseInsightsQuery({
      intent: "count",
      filters: {
        from,
        to,
        sentiment: "negative",
        targetKey: "north-ave",
      },
    });
    expect(parsed.intent).toBe("count");
    expect(parsed.filters.sentiment).toBe("negative");
    expect(parsed.filters.targetKey).toBe("north-ave");
    expect(parsed.filters.from.toISOString()).toBe(from);
    expect(parsed.filters.to.toISOString()).toBe(to);
  });

  it("rejects unknown filter keys", () => {
    expect(() =>
      parseInsightsQuery({
        intent: "count",
        filters: { from, to, partnerId: "sneak" },
      })
    ).toThrow(InsightsQueryParseError);
  });

  it("rejects count without from/to", () => {
    expect(() =>
      parseInsightsQuery({ intent: "count", filters: {} })
    ).toThrow(InsightsQueryParseError);
  });

  it("parses list without from/to so the route can refuse", () => {
    const parsed = parseInsightsQuery({ intent: "list", filters: {} });
    expect(parsed.intent).toBe("list");
  });

  it("parses unknown intent strings for unsupported_intent", () => {
    expect(parseInsightsQuery({ intent: "recommend", filters: {} }).intent).toBe(
      "recommend"
    );
  });
});

describe("isRangeTooWide", () => {
  it("is true when end is not after start", () => {
    const t = new Date("2026-01-01T00:00:00.000Z");
    expect(isRangeTooWide(t, t)).toBe(true);
  });

  it("is true when the window is longer than 90 days", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-04-02T00:00:00.000Z");
    expect(isRangeTooWide(start, end)).toBe(true);
  });

  it("is false for a 7-day window", () => {
    expect(
      isRangeTooWide(new Date(from), new Date(to))
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- src/lib/__tests__/parse-insights-query.test.ts --runInBand`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation** matching the rules above. Do not query the database.

- [ ] **Step 4: Run test to verify it passes**

Same command. Expected: PASS

---

### Task 4: Count Sessions (SQL)

**Files:**
- Create: `apps/api/src/lib/count-insights-sessions.ts`
- Create: `apps/api/src/lib/__tests__/count-insights-sessions.test.ts`

**Interfaces:**
- Consumes: Kysely `db`, `partnerId: string`, `ParsedInsightsQuery["filters"]`
- Produces: `countInsightsSessions(partnerId, filters): Promise<number>`

Always apply:
- `sessions.partner_id = partnerId`
- `sessions.status = 'completed'`
- `sessions.upload_protocol = 'versioned-v1'`
- `sessions.created_at >= from` AND `sessions.created_at < to`
- If `sentiment` set: left join `analyses` on `session_id`, `analyses.sentiment_label = sentiment`
- If `targetKey` set: `(sessions.metadata_json::jsonb -> 'target' ->> 'key') = targetKey` via Kysely `sql` tagged template

Return `Number(row.count ?? 0)`.

- [ ] **Step 1: Write the failing test** (mock `db` so no Neon)

Record every `.where` column/value. Assert `partner_id` is the caller’s id, never a second Partner id. Return `{ count: "0" }` from `executeTakeFirst`.

```ts
const whereCalls: Array<[string, string, unknown]> = [];

const mockQuery: any = {
  leftJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn((col: string, op: string, val: unknown) => {
    whereCalls.push([String(col), op, val]);
    return mockQuery;
  }),
  executeTakeFirst: jest.fn().mockResolvedValue({ count: "0" }),
};

jest.mock("../db", () => ({
  db: {
    selectFrom: jest.fn(() => mockQuery),
  },
}));

import { countInsightsSessions } from "../count-insights-sessions";

describe("countInsightsSessions", () => {
  it("scopes to the requesting Partner and corpus", async () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-08T00:00:00.000Z");
    const n = await countInsightsSessions("partner-a", { from, to });
    expect(n).toBe(0);
    expect(whereCalls).toEqual(
      expect.arrayContaining([
        ["sessions.partner_id", "=", "partner-a"],
        ["sessions.status", "=", "completed"],
        ["sessions.upload_protocol", "=", "versioned-v1"],
      ])
    );
    expect(whereCalls.some((c) => c[2] === "partner-b")).toBe(false);
  });
});
```

If the real `where` uses `sql` fragments for dates/target, still assert `partner_id` and that `partner-b` never appears.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- src/lib/__tests__/count-insights-sessions.test.ts --runInBand`

Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation** using `db` from `../db`.

- [ ] **Step 4: Run test to verify it passes**

Same command. Expected: PASS

---

### Task 5: POST route

**Files:**
- Create: `apps/api/src/routes/insights-query.ts`
- Create: `apps/api/src/routes/__tests__/insights-query.test.ts`
- Modify: `apps/api/src/lib/register-routes.ts` (register `insightsQueryRoutes` with prefix `/v1`)

**Interfaces:**
- Consumes: `authenticatePartner`, flag, parse, count, stub URL
- Produces: `insightsQueryRoutes(app)` registering `POST /partners/me/insights-query`

**Behavior:**
- PreHandler: `app.authenticatePartner`
- If flag off → `404` `{ error: "not_found" }`
- Parse errors → `400` `{ error: "bad_request", message }`
- `intent !== "count"` → `200` Cited answer with `refusal.code = "unsupported_intent"`, no `totalCount`
- Count with too-wide range → `200` `refusal.code = "range_too_wide"`
- Else count → `200` `{ summary, totalCount, evidenceResultsUrl }` (stub). Zero is valid.

Use the same fake Fastify app pattern as `apps/api/src/routes/__tests__/partners.test.ts` (`handlers["POST /partners/me/insights-query"]`). Mock `countInsightsSessions`. Set `process.env.INSIGHTS_QUERY_ENABLED` in tests; restore after.

- [ ] **Step 1: Write the failing tests** covering: flag off 404; `intent: "list"` unsupported; 91-day range; count 0 + stub URL; isolation (`countInsightsSessions` called with `req.partner.id` `"partner-a"` only); unknown filter key 400.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- src/routes/__tests__/insights-query.test.ts --runInBand`

Expected: FAIL

- [ ] **Step 3: Write the route + register it**

`register-routes.ts` add:

```ts
import { insightsQueryRoutes } from "../routes/insights-query";
// inside registerRoutes, with the other /v1 partners routes:
await app.register(insightsQueryRoutes, { prefix: "/v1" });
```

- [ ] **Step 4: Run route tests + `src/routes/__tests__/register.test.ts`**

Expected: PASS (retired import routes still 404)

---

### Task 6: Expose flag on GET `/partners/me`

**Files:**
- Modify: `apps/api/src/routes/partner-me.ts`
- Create: `apps/api/src/routes/__tests__/partner-me.insights-query-flag.test.ts`

**Interfaces:**
- GET `/partners/me` JSON adds `insightsQueryEnabled: boolean` from `isInsightsQueryEnabled()`.

- [ ] **Step 1: Write the failing test** using the same fake-app + mocked `db` pattern as `partner-me.allowed-origins.test.ts`. Call `GET /partners/me` with `process.env.INSIGHTS_QUERY_ENABLED` unset → `insightsQueryEnabled === false`; set to `"true"` → `true`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && npm test -- src/routes/__tests__/partner-me.insights-query-flag.test.ts --runInBand`

Expected: FAIL (field missing)

- [ ] **Step 3: Add `insightsQueryEnabled: isInsightsQueryEnabled()` to the existing `reply.send` object. Do not add env to `validateEnv`.

- [ ] **Step 4: Run test to verify it passes**

Same command. Expected: PASS

---

### Task 7: Dashboard demo panel

**Files:**
- Create: `apps/web/components/InsightsQueryPanel.tsx`
- Modify: `apps/web/app/dashboard/page.tsx`

Web has **no Jest**. Verification: `cd apps/web && npx tsc --noEmit` (or the repo’s web typecheck). Manual: flag off → no card; flag on → form posts.

**Panel behavior:**
- On mount, `GET /api/partners/me`. If `insightsQueryEnabled !== true`, return `null`.
- Card title: **Insights query (demo)**
- Intent display: Count (not a chat box)
- Sentiment: any / positive / neutral / negative
- Target key text input
- `from` / `to` as `datetime-local`; convert to UTC ISO on submit
- POST `/api/partners/me/insights-query` with `{ intent: "count", filters }`
- Success without refusal: show `summary`, `totalCount`, link to `evidenceResultsUrl` plus text **Evidence list not built yet.**
- Refusal: show `refusal.message`
- Flag off: render nothing (no toast)

**page.tsx:** import `InsightsQueryPanel`. Inside `nav === "dashboard"`, immediately **after** the `metrics` div, render `<InsightsQueryPanel />`. Do not add a sidebar nav item.

- [ ] **Step 1: Add the component** (no production API changes in this task)

- [ ] **Step 2: Wire it on the dashboard home**

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && npx tsc --noEmit`

Expected: exit 0

---

### Task 8: Full API regression

- [ ] **Step 1: Run API tests**

Run: `cd apps/api && npm test -- --runInBand`

Expected: existing tests still pass; new tests pass

---

## Done when

- Flag off: POST 404; GET `/partners/me` has `insightsQueryEnabled: false`; dashboard panel hidden.
- Flag on: count returns `totalCount` + stub URL; list/unknown intent refuse; wide range refuses; Partner B never queried.
- No CloudWatch, no OD-6, no evidence GET handler.

## Execution note

Do not commit unless the user asks. After the plan is executed, record a METRICS.md entry only if a number exists (test counts); do not invent Partner demand metrics.
