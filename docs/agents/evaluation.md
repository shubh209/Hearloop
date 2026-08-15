# Harness evaluation

Grade **task attempts**, not document text. A task attempt freezes adapter, model, starting commit, task prompt, permissions, budget, and condition (`control` or `harness`). The evaluator observes visible actions and final repository state. See `evals/README.md`.

Process-compliance metrics diagnose the mechanism. They do not prove engineering value.

## Telemetry

Every attempt records: task ID, category, risk, condition, model/version, tools, budget, start commit, timestamped stage/decision/skill/escalation/approval/test/review/release events, final artifacts, test outputs, elapsed time, token/tool cost, human review minutes, acceptance result, and policy findings.

## Scorecard

| Dimension | Headline measure | Interpretation |
| --- | --- | --- |
| Correctness and authority | Safe maintainer-accepted task yield | Primary outcome: hidden tests pass, blinded maintainer accepts, no critical policy violation |
| Reliability | `pass^3`: all three independent attempts succeed safely | Guards against lucky runs |
| Escalation quality | Precision, recall, and `Ask-F1` for consequential pages | Balances silent assumptions against question spam |
| Policy safety | Critical authorization or scope violations | Must remain zero |
| Engineering quality | First-review acceptance, defects, regressions, rework | Must not worsen |
| Human burden | Active review, clarification, approval, and correction minutes per accepted task | Prevents shifting work to the user |
| Efficiency | Time and model/tool cost per safe accepted task | Counts only guarded success |
| Delivery stability | Change failure, rollback, recovery, and deployment rework | Downstream impact |
| Learning | User can identify the decision, evidence, risk, and next stage at checkpoints | Apprenticeship value |

Leading diagnostics, never the goal: contract completeness, stage-order compliance, decision application accuracy, skill-routing accuracy, TDD evidence rate, review closure, verification evidence completeness.

Primary-source rationale: `context/research/agent-engineering-harness-metrics.md`.

## Phased evaluation

1. **Instrumentation pilot:** 12 representative scenarios to debug capture, graders, traces, and scoring. Not a stable effectiveness claim.
2. **Private comparison:** 24–40 tasks across bugs, features, refactors, design/research, authority/security, and release/operations. Same model, tools, permissions, start state, task, and budget with and without the harness. Three independent trials per condition.
3. **Grading:** Executable outcome checks, separate trajectory-policy checks, blinded maintainer acceptance where practical. Retain failures for taxonomy.
4. **Live rollout:** After no safety regression, introduce by task category. Track 30- and 90-day rework, escaped defects, change failures, cost, and human burden. Version model and harness inputs.
5. **Ablation:** Only after the primary comparison is credible, remove one harness element at a time.

Pre-register adoption and non-inferiority thresholds after the instrumentation pilot shows ordinary variance. Keep the scorecard decomposed: faster completion never compensates for a critical policy violation.

## Goodhart safeguards

Do not reward gate count, test count, lines changed, tool calls, or escalation volume. Success is conjunctive: acceptance predicates plus zero critical policy violations. Hide and refresh acceptance cases. Grade false positives and false negatives for escalation. Sample successful traces. Measure 30/90-day downstream effects.

## Follow-up outside this rollout

Task 4 versioned upload-grant tests used grouped red-green batches and route tests that mock an internal module. That Matt-TDD architecture gap is separate follow-up. Do not expand this harness rollout into feature-test refactoring without a new task contract.

Adapter execution records live in `evals/results/`. Codex and Kiro were `not_run` in this environment.
