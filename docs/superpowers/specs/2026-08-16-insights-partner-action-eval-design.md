# Insights Partner-Action Eval Design

## Goal

Give Hearloop a **Partner-action holdout** and **deterministic graders** so a later Champion Loop can promote or reject a classifier change without a model-as-judge, without touching production analyze, and without burning Bedrock until a human starts a capped run.

This slice is the Architect-First blueprint for **eval infrastructure**. It is not the Champion Loop runner and not a shipped Pipeline change.

## Why

Urgent-alert email is the only push Insights channel for a non-technical Partner. The existing 23-case `GOLDEN_SET` is a **contract/safety regression set**. Climbing 17/23 does not prove a shop owner would walk to the bay, call the customer, or ignore the email.

A holdout labeled as that owner (`page_now` / `follow_up_today` / `ignore_for_ops`) is the promotion gate. Injection cases stay **critical**: a challenger that wins Partner-action but loses injection is rejected.

## Locked decisions applied

- `architect-first-tdd-dod` — blueprint and TDD before code; DoD rejects vague specs.
- `agent-harness-mode` — guided.
- `media-upload-protocol-rollout` — untouched (out of scope).

Conversation locks (record on the GitHub Issue when authorized): Champion offline; shadow/suggest only; freeze transcription; ≤ $2 / 8 rounds / stall after 2 (Champion runner is a **later** slice); parallel to media pinning; option A holdout.

## Non-goals

- Do not call Bedrock from unit tests.
- Do not change `SYSTEM_PROMPT`, tool schema, or production analyze.
- Do not auto-promote or deploy a champion.
- Do not add Kaggle rows.
- Do not loop Whisper/Groq.
- Do not merge to `main` or deploy.
- Do not implement the Propose → test → compare Champion runner in this slice.

## Sets

| Set | Source | Role |
| --- | --- | --- |
| Improvement | `GOLDEN_SET` minus `category === "injection"` (18 cases) | Practice / failure mining for a later Champion |
| Critical | `GOLDEN_SET` where `category === "injection"` (5 cases) | Promotion blocker |
| Holdout | New `PARTNER_ACTION_SET` (15 cases) | Promotion blocker |

No transcript is shared between holdout and improvement. Existing `urg-*` cases stay in improvement; holdout uses new wording.

## Partner-action contract

```ts
export type PartnerAction = "page_now" | "follow_up_today" | "ignore_for_ops";
```

Map onto existing Insights labels (code, not a second model):

| `partnerAction` | Pass when | Fail means |
| --- | --- | --- |
| `page_now` | `sentiment === "negative"` and `urgency === "urgent"` | Missed urgent-alert |
| `follow_up_today` | `sentiment === "negative"` and `urgency === "follow_up"` | False page or buried complaint |
| `ignore_for_ops` | not (`negative` and `urgent`) | False page |

Holdout cases still carry `expectedSentiment`, `expectedUrgency`, and `expectedTopics` so contract grading can run. **Promotion** uses Partner-action + injection only. Topic misses on holdout are diagnostic, not promotion blockers (avoids optimizing `other` instead of paging).

Critical injection cases keep current expected sentiment/urgency. Contract grade must pass all five.

## Holdout roster (QuickLube / auto shop)

Business context for eval runs stays:

`Quick-service automotive shop. Oil changes, tire rotations, brake jobs.`

### `page_now` (5)

| id | target | transcript |
| --- | --- | --- |
| `pa-wheel` | `South — Tires` | `the wheel almost came off after you did my tires I nearly hit someone` |
| `pa-acid` | `North Ave — Battery` | `battery acid leaked in the waiting area and got on a kid's shoe` |
| `pa-pole` | _(none)_ | `your guy took my car for a test drive and hit a pole I want that in writing` |
| `pa-smoke` | `North Ave — Oil Change` | `I smelled burning and saw smoke after the oil change on the way home` |
| `pa-arm` | _(none)_ | `when I asked about the bill a staff member grabbed my arm I am reporting this` |

Expected: negative / urgent. Topics: `service_quality` for 1–4; `staff_friendliness` + consider `moderationFlags` unused in grade; `pa-arm` topics `staff_friendliness`.

### `follow_up_today` (5)

| id | target | transcript |
| --- | --- | --- |
| `pa-wait-north` | `North Ave — Oil Change` | `I waited an hour and a half past what you quoted I'm pretty annoyed` |
| `pa-price` | _(none)_ | `you said eighty and charged two ten I want that explained` |
| `pa-rude` | _(none)_ | `the advisor talked over me and walked off that was rude` |
| `pa-repeat` | `South — Brakes` | `third time in for the same noise and it still isn't fixed` |
| `pa-wait-south` | `South — Inspection` | `I waited an hour and a half past what you quoted I'm pretty annoyed` |

`pa-wait-south` is the **Target twin** of `pa-wait-north`: same words, different Target. Partner-action is still `follow_up_today`. This slice does **not** assert Target identity in Insights (Insights have no Target field). The twin exists so a later Target-aware check can be added without new capture copy. For v0, both must pass `follow_up_today` only.

Expected: negative / follow_up. Topics: wait_time, price, staff_friendliness, service_quality, wait_time respectively.

### `ignore_for_ops` (5)

| id | target | transcript |
| --- | --- | --- |
| `pa-did-it` | `North Ave — Oil Change` | `they did the oil change I paid I left` |
| `pa-nothing` | _(none)_ | `bay was fine nothing to add` |
| `pa-pitching` | _(none)_ | `who is pitching tonight` |
| `pa-whisper-ok` | _(none)_ | `it was okay uh thanks bye` |
| `pa-um` | _(none)_ | `uhh` |

Expected: not (negative ∧ urgent). Concrete labels: `pa-did-it` and `pa-whisper-ok` and `pa-nothing` → neutral / none / topics `other` or `service_quality` for did-it; `pa-pitching` and `pa-um` → neutral / none / `other`. **Pass rule for promotion is the ignore_for_ops predicate**, not exact topic match.

## Modules (one job each)

| File | Job |
| --- | --- |
| `apps/api/src/eval/golden-set.ts` | Existing 23 contract cases only |
| `apps/api/src/eval/partner-action-set.ts` | The 15 holdout cases |
| `apps/api/src/eval/eval-sets.ts` | Partition: `improvementSet()`, `criticalInjectionSet()`, `partnerActionHoldout()` |
| `apps/api/src/eval/grade-insights.ts` | Pure graders + `promotionDecision` |
| `apps/api/src/eval/run-analysis-eval.ts` | Live Bedrock orchestration and printed report |
| `apps/api/src/eval/__tests__/grade-insights.test.ts` | Grader + promotion tests (no Bedrock) |
| `apps/api/src/eval/__tests__/eval-sets.test.ts` | Partition and holdout inventory tests |
| `apps/api/src/eval/__tests__/golden-set.test.ts` | Keep existing coverage; do not require holdout inside `GOLDEN_SET` |

`grade-insights.ts` interface:

```ts
export function gradeContract(
  expected: Pick<GoldenCase, "expectedSentiment" | "expectedUrgency" | "expectedTopics">,
  actual: { sentiment: string; urgency: string; topics: string[] }
): string[]; // empty => pass; same rules as current run-analysis-eval

export function gradePartnerAction(
  partnerAction: PartnerAction,
  actual: { sentiment: string; urgency: string }
): string[]; // empty => pass

export interface SliceScores {
  improvementPassed: number;
  improvementTotal: number;
  holdoutPassed: number;
  holdoutTotal: number;
  criticalPassed: number;
  criticalTotal: number;
  pageNowFailures: string[];
  ignoreForOpsFailures: string[];
  criticalFailures: string[];
}

export function promotionDecision(scores: SliceScores): {
  promote: boolean;
  reason: string;
};
```

Promotion: `promote` is true only when `criticalPassed === criticalTotal` and `holdoutPassed === holdoutTotal`. Improvement score is logged and must not be the sole promotion signal. Tie / partial holdout → do not promote.

`run-analysis-eval.ts` still iterates cases (improvement, then holdout, then critical), prints three ratios plus `promotionDecision` against a hypothetical “all current outputs” baseline for a **single** champion (today’s prompt). It does not propose challengers.

## Testing strategy

Red-green on graders and set partitions. Known-good literals from this spec. No `analyzeTranscript` in Jest.

Live `npm run eval:analysis` remains optional, costs Bedrock, and is **not** required to mark this slice `implemented`. When run later, it is shadow-only.

## Observability / budget

This slice adds no production metrics. Jest is free. A later Champion slice must enforce ≤ $2, ≤ 8 rounds, stall-2, and count Cursor + Bedrock + Groq.

## Rollback

Delete or revert the new eval files. Production Pipeline unchanged.

## Completion

- **implemented (2026-08-16):** graders, sets, and tests green on `feat/insights-partner-action-eval` (`e894dd7` docs + `a41deca` review fixes); eval runner prints three slices; production analyze unchanged. Live `eval:analysis` not run.
- **released / complete:** not this slice. Champion runner and any prompt change are later authorized work.
