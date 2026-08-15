# Measuring the AI engineering harness

_Researched 2026-08-15. Sources are primary research papers, official standards/docs, and first-party source repositories. Recommendations labeled “proposed” are applications of those sources to Hearloop, not claims made by the source authors._

## Bottom line

Yes—substantial pieces of this have been measured before, but there is no established single metric for a repository-level agent harness. The defensible approach is to combine five established evaluation patterns:

1. **Executable, end-state task grading plus maintainer acceptance** from coding-agent research: did the change satisfy the issue, preserve existing behavior, and meet repository standards?
2. **Repeated-trial reliability** from tool-agent benchmarks: does the workflow succeed consistently, not merely once?
3. **Trace-level policy grading**: did it reach the goal without bypassing approvals, scope, stage, or safety constraints?
4. **Balanced delivery outcomes** from DORA and SPACE: measure speed together with stability, rework, quality, and human experience.
5. **A controlled local experiment**: compare the same agent/model/tooling with and without the harness on representative Hearloop work.

The harness is working only if it increases **safe, accepted task completion** or reduces time/cost while holding quality and policy compliance steady. High checklist compliance alone is not success.

## What prior work establishes

### 1. Grade repository outcomes, not persuasive transcripts

[SWE-bench](https://arxiv.org/abs/2310.06770) turns real GitHub issues into repository tasks and grades patches with executable tests. This is the closest established analogue for “did the engineering agent complete the work?” It supports using a task’s acceptance tests and final repository state as core evidence rather than judging the agent’s explanation.

Tests are necessary but not sufficient. METR had active maintainers blindly review 296 agent-created pull requests across three SWE-bench repositories. Automated-grader scores averaged 24.2 percentage points above maintainer merge decisions, with rejections covering core functionality, regressions, and code quality ([METR maintainer review](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/)). Therefore Hearloop’s strongest implementation outcome is **maintainer-accepted task yield**, with hidden tests as a required gate rather than the final definition of usefulness.

Benchmark construction quality matters. [SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/) used professional developers, three independent annotations per sample, and conservative filtering to remove underspecified issues and inadequate tests. OpenAI later reported that the set had become contaminated for frontier-model evaluation and stopped treating it as a frontier capability measure ([OpenAI, 2026](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)). For Hearloop, the lesson is to use private or newly constructed tasks, validate their tests and specifications with humans, and refresh them as agents gain exposure to solutions.

### 2. Measure consistent success, not best-case success

[τ-bench](https://arxiv.org/abs/2406.12045) evaluates agents that must use tools while following domain policies. It grades the final state against an annotated goal and introduces **pass^k**, the probability that all `k` repeated trials succeed. A workflow that passes once but drifts on retries is not operationally reliable. The [official τ-bench repository](https://github.com/sierra-research/tau2-bench) also exposes component rewards and diagnostic action correctness rather than only a headline result.

Applied to Hearloop: report ordinary pass rate and `pass^3` for the same task/configuration. Three runs are a practical pilot compromise; expand repetitions for high-risk release or migration scenarios.

### 3. Separate successful outcomes from compliant trajectories

A final state can look correct even when the path violated a required approval or procedure. NIST’s [AI Risk Management Framework Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/) calls for documented human-oversight roles, test sets and metrics, deployment-representative evaluation, production monitoring, independent assessment, and ongoing measurement. This supports grading both:

- **Outcome predicates:** requirements satisfied, tests pass, no regression, artifact usable.
- **Trajectory predicates:** required skill read, stage order respected, locked decision applied, consequential uncertainty escalated, approval obtained before controlled action, no unauthorized scope or side effect.

Anthropic’s first-party study of millions of agent interactions found that auto-approval, human interruption, and agent clarification behavior all change with user experience and task complexity ([Measuring AI agent autonomy in practice](https://www.anthropic.com/research/measuring-agent-autonomy)). Those are useful oversight signals, but their meaning depends on context: fewer escalations can mean better autonomy or missed escalation; more interruptions can mean healthy supervision or poor agent performance. They need correctness labels, not raw counts alone.

[HiL-Bench](https://arxiv.org/abs/2604.09408) directly evaluates whether coding agents know when to ask for help. It seeds human-validated blockers and balances **question precision** (relevant questions / questions asked) against **blocker recall** (blockers surfaced / known blockers) using their harmonic mean, `Ask-F1`. This is a ready-made measurement model for the harness’s human-escalation rule because it penalizes both silent guessing and question spam.

### 4. Balance throughput with stability and human impact

DORA deliberately pairs throughput measures with instability measures. Its current delivery measures include change lead time, deployment frequency, failed-deployment recovery time, change fail rate, and deployment rework rate ([DORA metrics](https://dora.dev/guides/dora-metrics/)). This prevents “shipped faster” from hiding rollback, hotfix, or recovery costs.

The [SPACE framework](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/) states that developer productivity cannot be captured by one metric or dimension. It covers satisfaction/well-being, performance, activity, communication/collaboration, and efficiency/flow. For this harness, human review effort, interruption burden, trust, and perceived clarity therefore belong beside task speed and pass rate.

This balance is especially important for AI-assisted delivery. Google’s [2024 DORA research](https://research.google/pubs/dora-accelerate-state-of-devops-2024-report/) found beneficial individual-level associations alongside worse delivery throughput and stability associations, showing that local coding speed does not imply better system delivery.

### 5. Run a local causal experiment; perceptions are not enough

First-party controlled studies have produced context-dependent results. GitHub’s controlled experiment had 95 developers implement the same JavaScript task and found higher completion and materially lower completion time with Copilot ([GitHub research](https://github.blog/news-insights/research/research-quantifying-github-copilots-impact-on-developer-productivity-and-happiness-/)). METR instead randomized 246 real issues from repositories familiar to 16 experienced maintainers and found that early-2025 AI tooling increased completion time by 19%, while participants believed it had reduced time ([METR study](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)).

The studies measure different tools, tasks, and populations; their disagreement is a reason to measure this harness on Hearloop rather than borrow an industry productivity claim. METR’s design is particularly relevant: define real tasks before randomization, randomize treatment at the task level, record actual work, and compare observed time with subjective estimates.

## Measurement model for Hearloop

### Unit of analysis

One **task attempt** is one agent working from a frozen repository state and task contract, using a recorded model/runtime configuration and a fixed budget. Every attempt should emit:

- task ID, category, risk, and estimated human duration;
- condition (`harness` or `control`), model/version, tools, budget, and start commit;
- timestamped stage, decision, skill, escalation, approval, test, review, and release events;
- final patch/artifacts, test outputs, elapsed time, token/tool cost, and human review minutes;
- blinded acceptance result, policy findings, and post-merge outcomes.

Prefer deterministic predicates and executable tests. Use a written human rubric where judgment is unavoidable, require evidence for every failing criterion, and periodically double-grade a sample to check reviewer agreement.

### Leading process metrics

These diagnose whether the harness is operating as designed. They are **not** proof that it improves engineering.

| Metric | Definition | Why it matters |
| --- | --- | --- |
| Contract completeness | Tasks with goal, scope, assumptions, required verification, and authority gates recorded before implementation / eligible tasks | Detects missing task framing. |
| Stage-order compliance | Attempts whose trace follows every applicable required transition / attempts | Tests the workflow state machine. |
| Decision application accuracy | Applicable locked decisions correctly used / applicable decisions | Requires a human-labeled applicability sample; raw lookup count is insufficient. |
| Skill-routing accuracy | Correct required skill selected and fully read / tasks with a required skill | Separately record false routing and missing-skill fallback attempts. |
| Escalation recall | Consequential situations correctly escalated / all consequential situations | Measures dangerous misses. Seeded scenarios make the denominator observable. |
| Escalation precision | Correct consequential escalations / all escalations | Measures unnecessary paging and friction. |
| TDD evidence rate | Eligible implementation attempts with an observed failing test before the implementation passes / eligible attempts | Trace evidence is stronger than a final claim that TDD occurred. |
| Review closure rate | Valid review findings resolved or explicitly dispositioned / valid findings | Tracks whether review changes outcomes. |
| Verification evidence completeness | Required checks with retained command/result evidence / required checks | Prevents unsupported “passes” claims. |
| Harness overhead | Added elapsed time, tokens/cost, and human minutes versus control | Exposes process tax. |

### Outcome and quality metrics

| Metric | Definition | Role |
| --- | --- | --- |
| **Safe maintainer-accepted task yield** | Attempt passes hidden acceptance/regression tests, is accepted under blinded maintainer review, **and** has no critical policy violation | Proposed primary metric. Report by task category and risk. |
| `pass^3` | Fraction of tasks for which all three independent attempts are safe successes | Reliability guard against lucky one-off passes. |
| First-review acceptance | Attempts accepted without a major correctness/security/scope finding / reviewed attempts | Fast quality feedback. |
| Time to accepted completion | Start to reviewer-accepted result, including agent rework and required human wait | Primary efficiency measure; raw coding time is too narrow. |
| Human review burden | Active review, clarification, approval, and correction minutes per accepted task | Ensures agent speed is not shifted to humans. |
| Rework rate | Accepted changes needing unplanned corrective work within the chosen window / accepted changes | Local analogue of DORA deployment rework. |
| Change fail rate | Deployed harness-authored changes requiring rollback, hotfix, or immediate intervention / deployed harness-authored changes | Production stability. |
| Escaped-defect rate | Confirmed defects attributable to an accepted change within the chosen window / accepted changes | Captures failures missed by the eval. |
| Cost per safe success | Model/tool cost plus valued human time / safe successes | Makes added gates economically visible. |
| Reviewer trust/clarity | Short periodic rubric on confidence, auditability, and cognitive load | SPACE-aligned qualitative counterweight; do not substitute it for observed quality. |

## Proposed baseline and experiment

### Phase 0 — instrument without claiming improvement

For 2–4 weeks, record the above fields on normal tasks. Retrospectively grade at least 20 recently completed tasks where timestamps, reviews, and verification evidence are usable. This establishes metric feasibility and reveals missing telemetry; it is an observational baseline, not causal evidence.

### Phase 1 — private, sandboxed benchmark

1. Build **24–40 tasks** stratified across bug diagnosis/fix, small feature, refactor, research/design, security/authority, and release/operational work. Include different risk and estimated-human-time bands.
2. Use resolved Hearloop work only after removing solution leakage from the starting state, plus novel seeded scenarios for scope, missing-skill, destructive-action, approval, and locked-decision tests.
3. Before any run, have a human define hidden acceptance predicates, regression tests, allowed scope, and critical policy violations. Have a second reviewer validate ambiguous or high-risk cases.
4. Randomize each task/configuration between:
   - **Control:** the same repository instructions and safety boundary, without the new staged harness.
   - **Treatment:** the proposed task contract, stage gates, decision registry, skill routing, escalation, TDD/review/release workflow.
5. Hold model/version, reasoning setting, tools, permissions, context, start commit, and budget constant. Run each task **three times per condition** with independent sessions.
6. Blind the acceptance reviewer to condition and attempt identity where practical. Grade repository state first, then policy trace separately.
7. Report per-condition safe success, pass rate, `pass^3`, critical violations, time to accepted completion, human minutes, and cost—with paired differences and uncertainty intervals. Preserve failures for taxonomy analysis rather than reporting only an average.

After the full-harness comparison is powered, add component ablations—such as no task contract, no skill router, or no authority gates—to learn which parts create value. Do not begin with many ablations: they multiply the sample requirement and can leave the primary comparison inconclusive.

At 24 tasks × 2 conditions × 3 trials, the pilot is 144 agent attempts. If that is too expensive, start with 12 tasks for instrumentation debugging, but do not treat it as a stable effectiveness estimate.

### Phase 2 — stepped live rollout

After the sandboxed benchmark shows no safety regression, introduce the harness to live tasks by category or week while retaining pre-specified comparison periods. Track 30- and 90-day rework, escaped defects, change failures, and human burden. Log model and harness versions because both are moving treatments. Do not randomize reduced safety controls onto production work; the live comparison should be between acceptable safety baselines.

### Proposed decision rule

Pre-register the rule before viewing results. A sensible pilot rule is:

- adopt when safe task success improves meaningfully **or** time/cost per safe success falls meaningfully;
- require zero critical authorization/scope violations in treatment;
- require no material worsening of first-review acceptance, human review burden, rework, or change-fail rate;
- report uncertainty and category-level results instead of declaring success from the pooled point estimate alone.

Set numerical improvement and non-inferiority margins only after Phase 0 shows ordinary variance and the number of feasible trials. Choosing thresholds after seeing treatment results would bias the conclusion.

## Compact Hearloop scorecard

Use this as a dashboard, not an arithmetic composite. A release is “green” only when the primary outcome improves and no guardrail crosses its limit.

| Dimension | Headline measure | Secondary diagnostic | Initial interpretation |
| --- | --- | --- | --- |
| Correctness + authority | **Safe maintainer-accepted task yield** | Hidden-test resolution and failure taxonomy | Primary outcome |
| Reliability | `pass^3` | Variance across repeat attempts | Must improve or hold |
| Policy safety | Critical violations; escalation recall | Stage, decision, skill, and approval compliance | Critical violations must be zero |
| Quality | First-review acceptance | Major findings and escaped defects per task | Must not worsen |
| Flow | Median time to accepted completion | p75 time, blocked/wait time | Improvement only counts with quality guardrails |
| Human load | Median active human minutes per accepted task | Interruptions, clarifications, unnecessary escalations | Must not be displaced from agent to reviewer |
| Delivery stability | Rework rate and change fail rate | Recovery time | Review monthly/quarterly due low volume |
| Economics | Cost per safe success | Tokens, tool calls, compute, human cost | Compare by task class |
| Harness operation | Applicable-gate compliance | Contract completeness and evidence completeness | Diagnostic, never the headline target |

## Goodhart safeguards

The harness will be gamed—by humans or agents—if process counts become the target. Use these controls:

- **Do not reward gate count, test count, lines changed, tool calls, or escalation volume.** They are trace diagnostics and can rise while outcomes worsen.
- **Keep success conjunctive:** acceptance predicates plus absence of critical policy violations. Never let faster completion compensate mathematically for unsafe behavior.
- **Keep the scorecard decomposed.** SPACE’s central warning is that productivity is multidimensional; DORA likewise balances throughput with instability. Do not collapse the dashboard into an opaque weighted score.
- **Hide and refresh acceptance cases.** Prevent agents from optimizing to known tests; retain a sealed holdout and add new tasks from real failures.
- **Grade false positives and false negatives.** For escalation and routing, raw compliance can be made perfect by escalating everything or loading every skill.
- **Sample successful traces for audit.** Outcome-only grading can miss procedural violations; trace-only grading can reward ceremony without correctness.
- **Measure downstream effects.** Review at 30 and 90 days so short-term acceptance cannot hide rework, rollback, or operational burden.
- **Version everything.** Treat model, prompt/kernel, skills, repository state, and grader as experimental inputs; rerun sentinel tasks after any material change.
- **Keep qualitative review.** Periodic reviewer interviews and failure review catch construct drift that a fixed metric cannot.

These are not merely theoretical precautions. OpenAI’s controlled study of proxy optimization found regimes where continued improvement of a proxy reward eventually reduced the held-out “true” objective ([Measuring Goodhart’s law](https://openai.com/index/measuring-goodharts-law/)). Harness-process metrics are proxies; retained human acceptance and downstream outcomes are the closer checks on actual engineering value.

## Practical conclusion

The proposed harness is measurable. The most credible claim it could eventually support is not “agents followed our workflow more often,” but:

> On representative Hearloop tasks, the harness changed the probability of a repeatably correct, policy-compliant result by _X_, changed time and cost per accepted result by _Y_, and did not worsen review burden or downstream delivery stability.

Until the controlled comparison and downstream window exist, stage compliance and verification capture show only that the mechanism is installed—not that it works.

## Primary source set

- [SWE-bench paper](https://arxiv.org/abs/2310.06770)
- [OpenAI: Introducing SWE-bench Verified](https://openai.com/index/introducing-swe-bench-verified/)
- [OpenAI: Why SWE-bench Verified no longer measures frontier coding capabilities](https://openai.com/index/why-we-no-longer-evaluate-swe-bench-verified/)
- [τ-bench paper](https://arxiv.org/abs/2406.12045)
- [Official τ-bench source repository and evaluation docs](https://github.com/sierra-research/tau2-bench)
- [METR: Many SWE-bench-passing PRs would not be merged](https://metr.org/notes/2026-03-10-many-swe-bench-passing-prs-would-not-be-merged-into-main/)
- [HiL-Bench: Do agents know when to ask for help?](https://arxiv.org/abs/2604.09408)
- [NIST AI Risk Management Framework Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/)
- [DORA software delivery performance metrics](https://dora.dev/guides/dora-metrics/)
- [The SPACE of Developer Productivity](https://www.microsoft.com/en-us/research/publication/the-space-of-developer-productivity-theres-more-to-it-than-you-think/)
- [DORA Accelerate State of DevOps 2024](https://research.google/pubs/dora-accelerate-state-of-devops-2024-report/)
- [GitHub Copilot controlled productivity study](https://github.blog/news-insights/research/research-quantifying-github-copilots-impact-on-developer-productivity-and-happiness-/)
- [METR randomized study of experienced open-source developers](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- [Anthropic: Measuring AI agent autonomy in practice](https://www.anthropic.com/research/measuring-agent-autonomy)
- [OpenAI: Measuring Goodhart’s law](https://openai.com/index/measuring-goodharts-law/)
