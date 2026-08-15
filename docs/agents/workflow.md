# Engineering workflow

This is the harness interface: **start task → transition stage → finish task**.

Exactly one stage is active. Later stages may be inspected for planning; their work waits. Guided mode is default. `fast for this task` is explicit, expires when the task ends, and never converts ambiguity into permission.

Instruction priority: user instruction, repository `AGENTS.md`, active task contract, selected skill, model default.

---

## 1. Start task

### Steps

1. Choose **guided** unless the user selected `fast for this task`.
2. Create the task contract (GitHub Issue for substantial work; a concise conversation contract only when the change is mechanically small — say why persistent tracking is unnecessary).
3. Classify every consequential assumption as `verified`, `default`, or `unresolved`.
4. Select and fully read the primary skill from the router.
5. Set **Intake** active.

**Done when:** mode, contract, assumption classes, required skill, and active stage are recorded.

### Guided and fast

Guided uses every stage and gate, presents choices at human decision points, and emits a professional checkpoint at each transition.

Fast compresses commentary and grants autonomy over reversible implementation details. It preserves every stage, verification requirement, and high-impact authority boundary. It may auto-pass a human gate only through the exact-decision algorithm. Fast never skips Discovery when a consequential assumption is unresolved.

### Assumption classes

- `verified` — evidenced in the repository or by the user.
- `default` — autonomous only when no evidence or scope requires escalation.
- `unresolved` — page the user before dependent Design or Implementation.

A second storage backend, a new architecture, a scope expansion, or any product/security/data/cost/compatibility/operational choice without a matching locked decision is unresolved until the user decides.

### Task contract schema

```yaml
task:
  id:
  goal:
  mode: guided | fast
  active_stage:
  scope:
    include: []
    exclude: []
  decisions:
    applied: []
    proposed: []
  assumptions:
    verified: []
    defaults: []
    unresolved: []
  skills:
    required: []
    completed: []
  test_seams:
    approved: []
  authority_gates:
    auto_pass:
      - Exact-scope locked decisions
    require_human:
      - scope expansion
      - new architecture
      - migration or deployment
      - unresolved consequential assumptions
  verification:
    required: []
    not_required: []
  completion:
    definition: []
    status: in_progress | implemented | released | complete
```

Mechanically small requests may keep this contract in the conversation. Work that spans stages, creates follow-up obligations, or affects production requires a GitHub Issue. Do not create issues unless the user authorized that write.

When tracked work is in scope, read `issue-tracker.md`. When triage labels are in scope, read `triage-labels.md`.

### Skill router

Identify the active stage and task type. Resolve the primary skill. Read it completely. Record it on the contract. Follow its gates. Process skills run before implementation skills.

```yaml
routing:
  discovery:
    bug_or_failure: mattpocock-skills:diagnosing-bugs
    unfamiliar_codebase: understand-anything:understand
    domain_language: mattpocock-skills:domain-modeling
    external_primary_research: mattpocock-skills:research
  design:
    module_or_api: mattpocock-skills:codebase-design
    interface_alternatives: design-an-interface
    uncertain_feasibility: mattpocock-skills:prototype
  planning:
    requirements_unclear: mattpocock-skills:grilling
    refactor: request-refactor-plan
  implementation:
    feature_or_bugfix: mattpocock-skills:tdd
    merge_conflict: mattpocock-skills:resolving-merge-conflicts
    human_only_steps: mattpocock-skills:wizard
  review:
    changed_code: mattpocock-skills:code-review
```

Routing rules:

1. Identify the active stage and task type.
2. Resolve the primary skill from the router.
3. Read the selected skill completely before continuing.
4. Record it in the task contract.
5. Follow its gates and completion criteria.
6. Run process skills before implementation skills when more than one skill applies.
7. Apply instruction priority: user instruction, repository `AGENTS.md`, active task contract, selected skill, model default.
8. Never silently substitute an overlapping workflow.

If an IDE cannot invoke a named skill but can read the repository, follow this file and report that native skill invocation was unavailable.

### Missing-skill page

When a required skill is not advertised, search installed local skill directories (repository skills, `~/.agents/skills`, `~/.codex/skills`, and installed IDE/plugin skill directories). If it remains missing, page the user immediately and stop at the current gate:

```text
Missing skill: <name>
Required for: <stage and task>
Searched:
- advertised skill catalog
- <local directories>

Available choices:
1. Grant internet access to locate/download it
2. Provide a local skill path
3. Explicitly authorize a named fallback workflow
4. Stop the task
```

Do not request or use internet access, download or install a skill, choose a substitute, or begin the next stage without explicit user authorization. A fallback applies only to the current task unless the user makes it persistent.

### Decision lookup

When a task cites a decision ID or a change may match a locked decision, read `decisions.yaml`. Apply the exact-decision algorithm before auto-passing any human gate.

### Domain lookup

When Discovery or domain language is in scope, read `domain.md`.

---

## 2. Transition stage

### Steps

1. Verify the active stage's exit evidence.
2. Resolve the human gate, or auto-pass only via the exact-decision algorithm.
3. Emit the professional checkpoint.
4. Activate exactly one next stage.

**Done when:** the checkpoint is emitted and exactly one next stage is active.

A stage may be `not_applicable` only with a recorded reason. New evidence may move a task backward. Small changes keep stages distinct and may use concise artifacts.

### Stages

| Stage | Entry evidence | Artifact | Exit evidence |
| --- | --- | --- | --- |
| Intake | Request received; mode chosen | Task contract | Scope and mode accepted |
| Discovery | Contract accepted | Findings and open questions | Consequential assumptions resolved or parked with user authority |
| Design | Assumptions classified | Approved design or spec | Human approval or exact-scope locked decision |
| Planning | Design approved | Executable implementation plan | Dependencies and verification identified |
| Implementation | Plan approved; required skill loaded | Red-green commits | Each slice passes scoped tests |
| Review | Implementation claimed | Standards report and Spec report | Important findings resolved |
| Release | Review closed | Release decision and verification | Explicit user authorization |
| Operate | Release authorized | Signals, thresholds, runbook, follow-ups | Ownership and success criteria recorded |

### Exact-decision algorithm

A locked decision auto-authorizes an action only when all of these hold:

1. The task contract cites the decision ID.
2. The requested change fits entirely inside `scope.applies_to`.
3. The change touches nothing in `scope.excludes`.
4. No `reopen_when` condition has occurred.
5. No `requires_human_if` condition matches. A clause matches only when the proposed action would violate the locked statement or leave `scope.applies_to`; applying the statement inside `applies_to` is not itself a match.
6. The interpretation is unambiguous.

Any failed or ambiguous condition pages the user. Fast mode does not waive this algorithm. An exclusion reopens the human gate even when the user said `fast for this task`. Agents may propose decision records; only the named authority may set a consequential decision to `locked`.

### Professional checkpoint

At each transition, emit only:

```text
Stage completed: <stage>
Professional purpose: <what experienced teams established here>
Artifact: <path or GitHub Issue reference>
Decisions applied: <decision IDs or none>
Open risks: <remaining risks or none>
Next stage: <stage>
```

Teaching appears at stage transitions only unless the user asks for inline explanation.

---

## 3. Finish task

### Steps

1. Compare delivery with the contract line by line.
2. Run Standards and Spec review (`mattpocock-skills:code-review`).
3. Resolve important findings.
4. Run fresh verification; record command and result. Do not claim a check that was not run.
5. Distinguish **implemented**, **released**, and **complete**.

**Done when:** contract comparison, both review axes, verification evidence, and an accurate completion state are recorded.

### Change safety

Preserve unrelated work, including dirty files in this worktree or a sibling worktree. Keep edits inside the authorized contract paths. Merge, push, deployment, infrastructure changes, database migrations, destructive git operations, issue creation, and other external writes remain separately authorized.

### Review gate

Standards: does the diff follow this repository's documented coding standards plus the Fowler smell baseline in the code-review skill? Spec: does the diff implement the originating design/plan? Report the axes separately. Critical and Important findings block finish until resolved or explicitly rejected with evidence.

### Completion states

- **implemented** — scoped verification passed; code may land in the branch. Passing tests are not rollout and not production success.
- **released** — user authorized integrate/deploy and fresh release verification passed.
- **complete** — agreed rollout and operational checks passed (signals, ownership, follow-ups). A feature is not complete before that evidence.

Do not mark a feature complete or production-ready from implementation evidence alone. Do not authorize deploy, migrate, or merge from passing tests alone.

### Production lifecycle

Every substantial feature plan addresses rollout, rollback, observability, operations, and maintenance. `not_applicable` requires a reason. Planning records production implications. Release requires explicit authorization. New operational debt becomes a GitHub Issue when issue creation is authorized.

### Evaluation

When grading harness behavior, read `evaluation.md` and `evals/`. Tests grade task-attempt traces, not document-string inspection.
