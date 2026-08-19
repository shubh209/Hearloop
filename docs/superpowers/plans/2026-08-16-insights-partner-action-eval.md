> **Status (2026-08-16):** Implemented on `feat/insights-partner-action-eval` (Jest 13/13). Plan checkboxes below are historical execution steps, not remaining work.

# Insights Partner-Action Eval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Subagent-driven-development is optional.

**Goal:** Add a 15-case Partner-action holdout, partition the existing golden set, and deterministic graders so promotion cannot be claimed from improvement-set accuracy alone.

**Architecture:** Pure `grade-insights` and `eval-sets` modules sit in front of the existing Bedrock eval runner. Unit tests never call Bedrock. Production analyze and the classifier prompt stay unchanged.

**Tech Stack:** TypeScript, Jest, existing `GoldenCase` / Insights labels.

## Global Constraints

- Guided; cite `architect-first-tdd-dod`.
- Do not change `apps/api/src/lib/claude.ts` production prompt or tool schema.
- Do not call Bedrock from Jest.
- Do not implement a Champion Propose/compare loop.
- Do not merge, deploy, or auto-promote.
- Preserve untracked `context/research/*` and unrelated worktrees.
- Domain words: Partner, Insights, Session, Target, urgent-alert email.
- One job per new file (Hearloop single-responsibility rule).

Spec: `docs/superpowers/specs/2026-08-16-insights-partner-action-eval-design.md`.

---

### Task 1: Partner-action set and partitions

**Files:**
- Create: `apps/api/src/eval/partner-action-set.ts`
- Create: `apps/api/src/eval/eval-sets.ts`
- Create: `apps/api/src/eval/__tests__/eval-sets.test.ts`
- Modify: `apps/api/src/eval/golden-set.ts` (add optional `partnerAction` type export only if needed — prefer keeping `PartnerAction` in `partner-action-set.ts`)
- Modify: `apps/api/src/eval/__tests__/golden-set.test.ts` (keep 23-case contract; do not require holdout inside `GOLDEN_SET`)

**Interfaces:**
- Consumes: existing `GoldenCase` from `golden-set.ts`
- Produces: `PartnerAction`, `PartnerActionCase`, `PARTNER_ACTION_SET`, `improvementSet()`, `criticalInjectionSet()`, `partnerActionHoldout()`

- [ ] **Step 1: Write the failing partition test**

```ts
import { GOLDEN_SET } from "../golden-set";
import { PARTNER_ACTION_SET } from "../partner-action-set";
import {
  improvementSet,
  criticalInjectionSet,
  partnerActionHoldout,
} from "../eval-sets";

it("partitions improvement, critical injection, and partner-action holdout", () => {
  const improvement = improvementSet();
  const critical = criticalInjectionSet();
  const holdout = partnerActionHoldout();

  expect(improvement).toHaveLength(18);
  expect(critical).toHaveLength(5);
  expect(holdout).toHaveLength(15);
  expect(improvement.every((c) => c.category !== "injection")).toBe(true);
  expect(critical.every((c) => c.category === "injection")).toBe(true);
  expect(improvement.length + critical.length).toBe(GOLDEN_SET.length);

  const holdoutIds = new Set(holdout.map((c) => c.id));
  expect(GOLDEN_SET.every((c) => !holdoutIds.has(c.id))).toBe(true);

  const transcripts = holdout.map((c) => `${c.target ?? ""}|${c.transcript}`);
  expect(new Set(transcripts).size).toBe(15);

  expect(holdout.filter((c) => c.partnerAction === "page_now")).toHaveLength(5);
  expect(holdout.filter((c) => c.partnerAction === "follow_up_today")).toHaveLength(5);
  expect(holdout.filter((c) => c.partnerAction === "ignore_for_ops")).toHaveLength(5);

  const waitNorth = holdout.find((c) => c.id === "pa-wait-north");
  const waitSouth = holdout.find((c) => c.id === "pa-wait-south");
  expect(waitNorth?.transcript).toBe(waitSouth?.transcript);
  expect(waitNorth?.target).toBe("North Ave — Oil Change");
  expect(waitSouth?.target).toBe("South — Inspection");
});

it("lists the fifteen holdout ids from the spec", () => {
  expect(PARTNER_ACTION_SET.map((c) => c.id).sort()).toEqual(
    [
      "pa-acid",
      "pa-arm",
      "pa-did-it",
      "pa-nothing",
      "pa-pitching",
      "pa-pole",
      "pa-price",
      "pa-repeat",
      "pa-smoke",
      "pa-um",
      "pa-wait-north",
      "pa-wait-south",
      "pa-wheel",
      "pa-whisper-ok",
      "pa-rude",
    ].sort()
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

```bash
cd apps/api && ../../node_modules/.bin/jest --runInBand src/eval/__tests__/eval-sets.test.ts
```

Expected: FAIL because `eval-sets` / `partner-action-set` do not exist.

- [ ] **Step 3: Implement the set files**

`partner-action-set.ts` — copy transcripts, targets, and expected labels **verbatim** from the spec roster. Extend:

```ts
import type { GoldenCase } from "./golden-set";

export type PartnerAction = "page_now" | "follow_up_today" | "ignore_for_ops";

export interface PartnerActionCase extends GoldenCase {
  partnerAction: PartnerAction;
}
```

Use `category: "negative_urgent"` for `page_now`, `"neutral"` is wrong for follow_up — add no new EvalCategory; use `"negative_urgent"` only for page_now rows, and for follow_up/ignore use existing categories that fit (`neutral` / `off_topic` / `too_short` / do not invent). Spec does not require holdout `category` for promotion. Set:

- `page_now` → `category: "negative_urgent"`
- `follow_up_today` → `category: "neutral"` is misleading. Add `"partner_action"` to `EvalCategory` **only if** golden-set.test still passes. Prefer: keep `EvalCategory` unchanged; holdout cases use `category: "negative_urgent" | "neutral" | "off_topic" | "too_short"` as fits (`pa-pitching` off_topic, `pa-um` too_short, follow_ups cannot use negative_urgent). **Do not add them to `GOLDEN_SET`.** `GoldenCase.category` on holdout is inventory-only.

`eval-sets.ts`:

```ts
import { GOLDEN_SET } from "./golden-set";
import { PARTNER_ACTION_SET } from "./partner-action-set";

export function improvementSet() {
  return GOLDEN_SET.filter((c) => c.category !== "injection");
}

export function criticalInjectionSet() {
  return GOLDEN_SET.filter((c) => c.category === "injection");
}

export function partnerActionHoldout() {
  return PARTNER_ACTION_SET;
}
```

Exact holdout objects (ids, transcripts, expected fields) must match the spec table. `pa-wait-north` and `pa-wait-south` share the exact same transcript string.

- [ ] **Step 4: Run tests and verify GREEN**

```bash
cd apps/api && ../../node_modules/.bin/jest --runInBand src/eval/__tests__/eval-sets.test.ts src/eval/__tests__/golden-set.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/eval/partner-action-set.ts apps/api/src/eval/eval-sets.ts apps/api/src/eval/__tests__/eval-sets.test.ts
git commit -m "$(cat <<'EOF'
test(eval): add Partner-action holdout partition

EOF
)"
```

Only include golden-set.ts if you had to export a type. Do not commit untracked research files.

---

### Task 2: Deterministic graders and promotion gate

**Files:**
- Create: `apps/api/src/eval/grade-insights.ts`
- Create: `apps/api/src/eval/__tests__/grade-insights.test.ts`

**Interfaces:**
- Consumes: `PartnerAction`
- Produces: `gradeContract`, `gradePartnerAction`, `promotionDecision`

- [ ] **Step 1: Write failing grader tests**

```ts
import {
  gradeContract,
  gradePartnerAction,
  promotionDecision,
} from "../grade-insights";

it("gradeContract matches current golden-set rules", () => {
  expect(
    gradeContract(
      {
        expectedSentiment: "negative",
        expectedUrgency: "urgent",
        expectedTopics: ["service_quality"],
      },
      {
        sentiment: "negative",
        urgency: "urgent",
        topics: ["service_quality", "wait_time"],
      }
    )
  ).toEqual([]);
  expect(
    gradeContract(
      {
        expectedSentiment: "neutral",
        expectedUrgency: "none",
        expectedTopics: ["other"],
      },
      { sentiment: "positive", urgency: "none", topics: ["other"] }
    )
  ).toContain("sentiment positive != neutral");
});

it("page_now passes only on negative+urgent", () => {
  expect(
    gradePartnerAction("page_now", { sentiment: "negative", urgency: "urgent" })
  ).toEqual([]);
  expect(
    gradePartnerAction("page_now", {
      sentiment: "negative",
      urgency: "follow_up",
    })
  ).not.toEqual([]);
});

it("follow_up_today rejects urgent pages", () => {
  expect(
    gradePartnerAction("follow_up_today", {
      sentiment: "negative",
      urgency: "follow_up",
    })
  ).toEqual([]);
  expect(
    gradePartnerAction("follow_up_today", {
      sentiment: "negative",
      urgency: "urgent",
    })
  ).not.toEqual([]);
});

it("ignore_for_ops rejects negative+urgent", () => {
  expect(
    gradePartnerAction("ignore_for_ops", {
      sentiment: "neutral",
      urgency: "none",
    })
  ).toEqual([]);
  expect(
    gradePartnerAction("ignore_for_ops", {
      sentiment: "positive",
      urgency: "none",
    })
  ).toEqual([]);
  expect(
    gradePartnerAction("ignore_for_ops", {
      sentiment: "negative",
      urgency: "urgent",
    })
  ).not.toEqual([]);
});

it("promotion requires perfect holdout and critical even if improvement is high", () => {
  const blocked = promotionDecision({
    improvementPassed: 18,
    improvementTotal: 18,
    holdoutPassed: 14,
    holdoutTotal: 15,
    criticalPassed: 5,
    criticalTotal: 5,
    pageNowFailures: ["pa-wheel"],
    ignoreForOpsFailures: [],
    criticalFailures: [],
  });
  expect(blocked.promote).toBe(false);

  const injectionFail = promotionDecision({
    improvementPassed: 10,
    improvementTotal: 18,
    holdoutPassed: 15,
    holdoutTotal: 15,
    criticalPassed: 4,
    criticalTotal: 5,
    pageNowFailures: [],
    ignoreForOpsFailures: [],
    criticalFailures: ["inj-roleplay"],
  });
  expect(injectionFail.promote).toBe(false);

  const ok = promotionDecision({
    improvementPassed: 12,
    improvementTotal: 18,
    holdoutPassed: 15,
    holdoutTotal: 15,
    criticalPassed: 5,
    criticalTotal: 5,
    pageNowFailures: [],
    ignoreForOpsFailures: [],
    criticalFailures: [],
  });
  expect(ok.promote).toBe(true);
});
```

- [ ] **Step 2: Run and verify RED**

```bash
cd apps/api && ../../node_modules/.bin/jest --runInBand src/eval/__tests__/grade-insights.test.ts
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement graders**

`gradeContract` — same three checks as current `grade()` in `run-analysis-eval.ts`.

`gradePartnerAction`:

- `page_now`: fail unless negative and urgent.
- `follow_up_today`: fail unless negative and follow_up.
- `ignore_for_ops`: fail if negative and urgent.

`promotionDecision`: `promote` iff `holdoutPassed === holdoutTotal && criticalPassed === criticalTotal && holdoutTotal > 0 && criticalTotal > 0`. `reason` is a short string naming the blocking slice or `"holdout_and_critical_passed"`.

- [ ] **Step 4: Run and verify GREEN**

```bash
cd apps/api && ../../node_modules/.bin/jest --runInBand src/eval/__tests__/grade-insights.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/eval/grade-insights.ts apps/api/src/eval/__tests__/grade-insights.test.ts
git commit -m "$(cat <<'EOF'
feat(eval): grade Partner-action holdout for promotion

EOF
)"
```

---

### Task 3: Wire the live eval runner (print-only)

**Files:**
- Modify: `apps/api/src/eval/run-analysis-eval.ts`

**Interfaces:**
- Consumes: `eval-sets`, `gradeContract`, `gradePartnerAction`, `promotionDecision`
- Produces: stdout with improvement / holdout / critical ratios and promote true/false

- [ ] **Step 1: Write a runner-contract unit test that does not import Bedrock**

Do **not** add a Jest test that imports `run-analysis-eval.ts` if that pulls `claude.ts`/Bedrock. Instead add `buildEvalReport` in `grade-insights.ts` (or a new `eval-report.ts` if `grade-insights.ts` would then do two jobs — prefer `eval-report.ts` with one job: assemble slice scores from already-graded case rows).

If adding `eval-report.ts`:

```ts
export function buildSliceScores(rows: Array<{
  slice: "improvement" | "holdout" | "critical";
  id: string;
  pass: boolean;
  partnerAction?: "page_now" | "follow_up_today" | "ignore_for_ops";
}>): SliceScores
```

Test: 18 improvement all pass, 15 holdout with one `page_now` fail, 5 critical pass → `promote: false`.

If `grade-insights.ts` stays one job (grading one case), put `buildSliceScores` in `eval-report.ts`.

- [ ] **Step 2: RED then GREEN that helper**

- [ ] **Step 3: Change `run-analysis-eval.ts` to grade three slices**

Loop improvement, holdout, critical. Holdout uses `gradePartnerAction` for `pass` (not topic contract). Critical and improvement use `gradeContract`. Print:

```text
improvement: X/18
holdout: Y/15
critical: Z/5
promote: true|false
reason: ...
```

Keep per-id failure lines. Do not change analyze call signature.

- [ ] **Step 4: Run Jest for all eval unit tests**

```bash
cd apps/api && ../../node_modules/.bin/jest --runInBand src/eval/__tests__/
```

Expected: PASS. Do not claim live `eval:analysis` unless you run it (Bedrock; separately authorized).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/eval/run-analysis-eval.ts apps/api/src/eval/eval-report.ts apps/api/src/eval/__tests__/eval-report.test.ts
git commit -m "$(cat <<'EOF'
feat(eval): report Partner-action promotion without changing analyze

EOF
)"
```

---

## Verification (this slice)

Required: `jest --runInBand src/eval/__tests__/` from `apps/api`.

Not required: `npm run eval:analysis`, full API suite, deploy.

**implemented:** tests green; runner wired; production prompt unchanged.  
**released / complete:** not this task.
