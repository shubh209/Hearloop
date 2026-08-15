# Cross-Agent Engineering Harness Design

## Purpose

Hearloop needs a portable engineering harness that keeps Codex, Cursor, Kiro, and other coding agents aligned with professional software-development practice. The harness must prevent agents from collapsing the lifecycle into one large implementation pass, silently resolving consequential assumptions, bypassing applicable skills, or treating code completion as production completion.

The harness also serves as an apprenticeship layer. It teaches the repository owner how professional teams move from feature intake through design, implementation, testing, release, observability, and maintenance. Teaching appears at stage transitions, not continuously during implementation.

## Goals

- Keep exactly one workflow stage active at a time.
- Make consequential assumptions visible and route them to human authority.
- Reuse locked decisions automatically only when task scope matches exactly.
- Route work deterministically to installed skills.
- Page the user before acquiring, installing, substituting, or bypassing a missing skill.
- Support guided and fast task modes without weakening safety gates.
- Separate implementation completion from release and operational completion.
- Work across agent products through repository-owned instructions and artifacts.

## Non-Goals

- Build a custom orchestration platform or workflow engine now.
- Automate internet access, skill installation, deployment, migration, or destructive actions.
- Encode volatile project state directly in the always-loaded operating kernel.
- Remove human judgement from product, architecture, security, data, cost, compatibility, or operational decisions.
- Require lengthy artifacts for mechanically small changes.

## Architecture

The harness is a layered control plane:

```text
AGENTS.md
  └─ locked operating kernel
      ├─ docs/agents/workflow.md
      ├─ docs/agents/decisions.yaml
      ├─ docs/agents/skills.md
      ├─ docs/agents/issue-tracker.md
      ├─ docs/agents/triage-labels.md
      ├─ docs/agents/domain.md
      ├─ docs/adr/
      └─ GitHub Issue task contract
```

`AGENTS.md` contains only rules every agent needs on every engineering task. Detailed branches live behind strongly worded context pointers. Durable architectural rationale remains in ADRs. GitHub Issues hold per-task state and evidence. Code, tests, and CI remain executable truth.

The existing project catch-up material may remain below the locked kernel initially. Moving volatile status into more focused context documents is a separate cleanup, not part of the first harness rollout.

## Operating Modes

Every task starts in `guided` mode unless the user explicitly selects `fast for this task`.

### Guided mode

- Uses all workflow stages and gates.
- Presents choices and their consequences at human decision points.
- Emits a short professional checkpoint at every stage transition.
- Explains what experienced engineers validate at that boundary and what artifact was produced.

### Fast mode

- Requires an explicit task-level user instruction.
- Expires when the task ends; the next task returns to guided mode.
- Compresses commentary and grants autonomy over reversible implementation details.
- Preserves every workflow stage, verification requirement, and high-impact authority boundary.
- May auto-pass a human gate only when a locked decision matches the task's scope exactly.

Fast mode never converts ambiguity into permission.

## Workflow Stages

Exactly one stage is active. Agents may inspect later stages for planning but may not perform their work early.

| Stage | Purpose | Required artifact | Exit gate |
| --- | --- | --- | --- |
| Intake | Define the requested outcome | Task contract | Scope and mode accepted |
| Discovery | Examine domain, code, risks, and decisions | Findings and open questions | Consequential assumptions resolved |
| Design | Choose behavior and boundaries | Approved design or spec | Human approval or exact decision match |
| Planning | Divide work into vertical slices | Executable implementation plan | Dependencies and verification identified |
| Implementation | Build one slice at a time | Red-green commits | Each slice passes scoped tests |
| Review | Evaluate Standards and Spec separately | Two-axis review | Important findings resolved |
| Release | Integrate or deploy deliberately | Release decision and verification | Explicit authorization |
| Operate | Observe and maintain production behavior | Signals, thresholds, runbook, follow-ups | Ownership and success criteria recorded |

A stage may be `not_applicable` only with a recorded reason. New evidence may move a task backward. Small changes keep stages distinct but may use concise artifacts.

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

No tutorial narration is required inside an implementation stage unless the user asks.

## Decision Registry

`docs/agents/decisions.yaml` stores consequential cross-task decisions. Each record has one of four statuses:

- `locked`: authoritative and mandatory within scope.
- `default`: autonomous choice when no evidence or scope requires escalation.
- `open`: human resolution required before dependent work.
- `superseded`: retained for history and no longer active.

Record shape:

```yaml
- id: media-upload-protocol-rollout
  statement: New Sessions remain legacy-v0 until capture clients support versioned grants.
  status: locked
  authority: user
  decided_at: 2026-08-15
  scope:
    applies_to:
      - upload-grant issuance
      - Session creation defaults
    excludes:
      - finalize pinning
      - worker migration
  rationale:
    - Existing capture clients use the legacy contract.
    - Premature versioned-v1 rollout would break uploads.
  evidence:
    - apps/web/components/Recorder.tsx
    - apps/web/public/widget.js
    - packages/react/src/api-client.ts
  reopen_when:
    any:
      - All capture clients support the versioned contract.
      - An approved rollout plan replaces this decision.
  requires_human_if:
    - A task changes Session creation defaults.
    - A task expands versioned-v1 beyond the approved routes.
```

### Exact-match gate

A locked decision auto-authorizes an action only when all conditions hold:

1. The task contract cites the decision ID.
2. The requested change fits entirely inside `scope.applies_to`.
3. The change touches nothing in `scope.excludes`.
4. No `reopen_when` condition has occurred.
5. No `requires_human_if` condition matches.
6. The interpretation is unambiguous.

Any failed or ambiguous condition pages the user. Agents may propose decision records, but only the named authority may set a consequential decision to `locked`.

## Task Contract

Every substantial task begins with a task contract in its GitHub Issue. The contract is the runtime boundary between repository policy and the current request.

```yaml
task:
  id: task-4-versioned-upload-grants
  goal: Add idempotent upload-grant issuance to both upload-URL routes.
  mode: guided
  active_stage: implementation
  scope:
    include:
      - public upload-URL route
      - authenticated upload-URL route
      - shared grant issuance
      - automated tests
    exclude:
      - finalize pinning
      - client rollout
      - migration application
      - deployment
  decisions:
    applied:
      - media-upload-protocol-rollout
    proposed: []
  assumptions:
    verified:
      - Migration 011 defines both required uniqueness constraints.
    defaults:
      - Presigned grants expire after 900 seconds.
    unresolved: []
  skills:
    required:
      - mattpocock-skills:tdd
    completed: []
  test_seams:
    approved:
      - upload-grant service public interface
      - public HTTP route
      - authenticated HTTP route
  authority_gates:
    auto_pass:
      - Exact-scope locked decisions
    require_human:
      - scope expansion
      - new architecture
      - migration or deployment
      - unresolved consequential assumptions
  verification:
    required:
      - scoped tests
      - API TypeScript build
      - Standards review
      - Spec review
    not_required:
      - live S3 test
      - production migration
  completion:
    definition:
      - Both routes preserve legacy behavior.
      - Versioned requests converge under retry and races.
      - Required verification passes.
    status: in_progress
```

Every consequential assumption is classified as `verified`, `default`, or `unresolved`. Unresolved consequential assumptions block dependent work. Scope changes update the contract and may reopen approval. Fast mode still requires a contract. The final handoff compares delivery against the contract line by line.

Mechanically small requests may use a concise contract in the conversation rather than creating a GitHub Issue. The agent must state why persistent tracking is unnecessary. Work that spans stages, creates follow-up obligations, or affects production requires a GitHub Issue.

## Skill Router

`docs/agents/skills.md` maps stage and task type to a required primary skill:

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

### Missing-skill page

When a required skill is not advertised, search installed local skill directories. If it remains missing, page the user immediately and stop at the current gate:

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

Agents must not request or use internet access, download or install a skill, choose a substitute, or begin the next stage without explicit user authorization. A fallback applies only to the current task unless the user makes it persistent.

If an IDE cannot invoke a named skill but can read the repository, it follows the portable workflow in `docs/agents/workflow.md` and reports that native skill invocation was unavailable.

## Production Lifecycle

Every substantial feature plan explicitly addresses rollout, rollback, observability, operations, and maintenance. `not_applicable` requires a reason.

```yaml
production:
  rollout:
    strategy: protocol-gated
    rollback: keep legacy-v0 as default
  observability:
    signals:
      - upload-grant creation rate
      - replay rate
      - attempt conflicts
      - storage-signing failures
    alerts:
      - storage-signing failures exceed an approved threshold
    dashboards:
      not_applicable: No versioned-v1 production traffic exists yet.
  maintenance:
    owner: repository owner
    follow_up:
      - client rollout
      - finalize pinning
      - orphan cleanup
    debt:
      - known env.test.ts baseline failure
  operations:
    runbook: not_required_before_rollout
    migration: unapplied
    deployment: excluded
```

Planning records production implications. Release requires explicit authorization and fresh verification. Deployment success does not prove feature success; approved production signals do. New operational debt becomes a GitHub Issue. A feature may be `implemented` after code verification but is `complete` only after its agreed rollout and operational checks.

## GitHub Workflow

GitHub Issues is the only issue tracker. The default triage labels are `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. Pull requests are not a request surface.

For substantial work, the GitHub Issue records:

- Task contract and current mode/stage.
- Applied and proposed decision IDs.
- Links to design and implementation artifacts.
- Stage-transition checkpoints.
- Review findings and resolutions.
- Verification evidence.
- Release decision and operational follow-up.

Repository mutations, issue creation, comments, labels, pushes, pull requests, releases, deployments, and other external writes remain subject to the user's authorization and the active task contract.

## Locked `AGENTS.md` Kernel

The following compact kernel appears near the top of `AGENTS.md` and applies to Codex, Cursor, Kiro, and other coding agents:

```markdown
## Agent operating contract — locked

Applies to every coding agent and IDE, including Codex, Cursor, and Kiro.

### Start gate

1. Read this file before taking action.
2. Read `docs/agents/domain.md`, then every domain document or ADR it triggers.
3. Inspect available skills before exploring or editing.
4. For engineering work, use the skill selected by `docs/agents/skills.md` as the primary workflow. Never substitute an overlapping workflow silently.
5. If a required skill appears unavailable, search installed local skill directories, then follow the missing-skill page in `docs/agents/skills.md`.

### Stage gate

Follow `docs/agents/workflow.md`. Keep exactly one stage active. Satisfy its completion criterion before beginning later-stage work. Use guided mode unless the user explicitly selects fast mode for the current task.

### Decision gate

Read `docs/agents/decisions.yaml`. Auto-apply a locked decision only when the task matches its scope exactly. Page the user for consequential unresolved assumptions, ambiguous matches, reopening conditions, or scope expansion.

### Review gate

Before claiming engineering work complete, run the required Standards and Spec reviews, resolve important findings, run fresh verification, report unrelated baseline failures separately, and state what was not run.

### Change safety

Preserve unrelated work. Keep changes inside the authorized task contract. Treat merge, push, deployment, infrastructure changes, database migrations, destructive actions, and external writes as separately authorized actions.

### Repository pointers

- GitHub Issues only: `docs/agents/issue-tracker.md`
- Triage vocabulary: `docs/agents/triage-labels.md`
- Domain and ADR routing: `docs/agents/domain.md`
```

## Initial Rollout

The first implementation remains lightweight:

1. Add the locked kernel to `AGENTS.md` without rewriting unrelated project context.
2. Add `docs/agents/workflow.md`, `decisions.yaml`, `skills.md`, `issue-tracker.md`, `triage-labels.md`, and `domain.md`.
3. Add a GitHub Issue template containing the task contract.
4. Add a pull-request checklist covering decisions, verification, rollout, rollback, observability, and maintenance.
5. Pressure-test the harness with representative agent scenarios.

Custom orchestration code and CI policy checks are deferred until observed violations show where automation has leverage.

## Verification

The harness is verified by scenario pressure tests rather than prose inspection alone. At minimum, exercise:

1. A feature request with an unresolved architectural assumption stops in Discovery.
2. A fast-mode task exactly matching a locked decision advances without redundant approval.
3. A fast-mode task exceeding one exclusion reopens the human gate.
4. A missing required skill pages the user before network access or fallback.
5. A small mechanical task uses concise artifacts while preserving stages.
6. A code-complete feature remains `implemented`, not `complete`, before rollout evidence.
7. A Cursor or Kiro agent without native skill invocation follows the portable workflow and reports the limitation.
8. A dirty worktree preserves unrelated changes.

The implementation is successful when each scenario produces the expected gate, artifact, and next action consistently.
