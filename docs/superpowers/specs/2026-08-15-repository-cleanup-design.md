# Repository cleanup design

**Date:** 2026-08-15  
**Task contract:** [GitHub Issue #1](https://github.com/shubh209/Hearloop/issues/1)  
**Mode:** guided  
**Target completion state:** implemented

## Goal

Reduce repository maintenance load by removing proven obsolete code,
documentation, and direct dependencies while preserving current product
behavior, operational evidence, and protected project surfaces.

The cleanup uses evidence-gated consolidation: delete material whose purpose
has ended, transfer any live information into an authoritative source first,
and leave uncertain correctness or product changes as separately tracked work.

## Protected surfaces

- `career/` is outside cleanup scope.
- `apps/quicklube-demo` remains an intentional sales/demo application.
- Applied database migrations remain immutable history.
- The deployed `website_url` and `business_context_source` columns remain in
  Kysely's database schema even when application code stops using them.
- Media-pinning code and its locked legacy-v0 rollout boundary are unchanged.
- Recent strategic research, agent-harness evidence, current verification
  assets, and Cursor skill rules remain.
- Merge, push, deployment, infrastructure mutation, production resource
  cleanup, and database migration are separate authority gates.

## Cleanup slices

### 1. Retire website-based business-context import

Remove the complete inactive import path:

- authenticated import routes and route registration;
- import worker, queue name, enqueue helper, and shutdown wiring;
- scraper client, summarizer, rate limiter, and job-status helpers;
- import-specific unit tests;
- the React import/polling component;
- the Python Crawl4AI sidecar and Docker Compose configuration;
- the Crawl4AI feasibility spike and retired feature documentation.

The retired endpoints receive Fastify's normal 404 response. No `410 Gone`
compatibility handler remains.

Manual business-context entry stays supported. Replace the import component
with a small controlled business-description field shared by onboarding and
settings. Onboarding retains manual entry, the automotive template, Save, and
Skip. Settings retains manual editing. New manual saves use source `manual`;
the onboarding template uses source `template`.

Partner profile/settings APIs stop accepting and returning `websiteUrl`.
Settings may still write `businessContextSource`, but new input is limited to
`manual` or `template`; the profile response no longer needs to expose the
source. The database columns and migration `009` remain because they describe
the deployed schema and may contain historical import values.

### 2. Remove proven technical debris

Remove these direct package declarations:

- root `@jridgewell/trace-mapping`: no direct import; Jest/Babel retain their
  own transitive copy;
- API `@anthropic-ai/sdk`: no runtime or test import; Bedrock is the active AI
  transport;
- API `ts-jest`: Jest uses `babel-jest`;
- API `@types/pino`: Pino ships its own declarations and this package provides
  no types entry.

Regenerate `package-lock.json` through npm rather than editing it manually.
Remove compiler-confirmed unused imports in `groq.ts` and `storage.ts`.

`maxDurationSec` is excluded from cleanup because it remains live behavior: the
session routes persist it, finalize passes it through the validation queue, the
recording validator enforces it, and capture clients use it for their countdown.

### 3. Consolidate tracked documentation

Rewrite `AGENTS.md` as a small always-loaded kernel containing the locked
operating contract and strong context pointers. Detailed workflow, decisions,
evaluation, domain, issue-tracker, operational, and career information stays
behind its authoritative pointer.

Update current authorities so they describe the post-cleanup repository:

- `README.md` for repository entry and local commands;
- `CONTEXT.md` for current ubiquitous language;
- `context/BACKLOG.md` for unfinished work only;
- `context/INFRA.md` for current infrastructure, without altering production;
- `context/DECISIONS.md` for current architecture;
- `context/METRICS.md` to remove retired-feature guidance while retaining
  relevant historical evidence.

Delete tracked artifacts whose operational purpose has ended:

- `context/BUSINESS_CONTEXT_SCRAPE_DESIGN.md`;
- `context/PHASE1_PLATFORM.md`;
- `testing/spike/` Crawl4AI artifacts;
- `voice_micro_feedback_sdk_api_spec.pdf`;
- empty `.vscode/settings.json`.

**Review reconciliation:** keep `context/PHASE1_PLATFORM.md` as a minimal
history pointer instead of deleting the path. The protected
`career/interview-prep/INTERVIEW_PREP.md` links to it, and changing protected
career material or knowingly leaving its link broken would violate the
stronger scope boundary. The original phase checklist remains deleted; the
six-line pointer contains no duplicate operating guidance.

Keep recent `context/research/` reports, `docs/agents/`, current media-pinning
designs/plans, security/load-test assets, and `.cursor/rules/`.

### 4. Remove approved untracked artifacts last

The main workspace contains user-owned untracked material that does not appear
in the clean feature worktree. After confirming each artifact's live outcomes
exist in commits, metrics, decisions, or the new harness, remove only:

- `context/PRD_PIPELINE_HARDENING_AND_ALERTING.md`;
- `context/tickets/`;
- `docs/superpowers/specs/2026-08-14-hearloop-platform-design-quality-loop-design.md`;
- `workflows/hearloop-platform-design-quality-loop.md`;
- `workflows/prompts/hearloop-platform-design-master.md`.

Do not remove the main workspace's modified `context/BACKLOG.md` or
`context/INFRA.md`; their useful changes must be reconciled into the cleanup
branch first. Do not remove any `context/research/` file.

These exact untracked deletions are not recoverable from Git. Verify the paths
immediately before deletion and report them separately at handoff.

## Verification design

### Baseline

Before implementation, run the repository's existing API, web, QuickLube, and
React SDK checks. Record any pre-existing failure without expanding cleanup
scope to repair it.

### Behavior-first retirement

Add or update tests through public seams to prove:

1. retired import endpoints are no longer registered and return 404;
2. Partner settings still accept and persist manual business context;
3. profile responses no longer expose retired website/import metadata;
4. active queue health and worker behavior remain unchanged after removing the
   import queue.

Each behavior follows one RED-to-GREEN vertical slice. Tests mock only true
external boundaries such as database, Redis, S3, and provider clients.

### Final checks

- API TypeScript build and full API test suite;
- web and QuickLube production builds;
- React SDK build and tests;
- dependency and reference scans for removed packages and import code;
- stale-term and Markdown-link scans;
- clean worktree and complete diff inspection;
- Matt Pocock code review along separate Standards and Spec axes.

## Commit structure

1. Retire import backend and its behavioral tests.
2. Simplify manual business-context UI.
3. Remove unused dependencies and declarations.
4. Consolidate tracked documentation.
5. Remove the exact approved untracked main-workspace artifacts.

Each commit contains one coherent slice and is verified before the next begins.
The fifth action affects local untracked files rather than the cleanup branch,
so it is reported explicitly and never represented as a Git deletion commit.

## Completion and operations

The task finishes as `implemented` when scoped verification and both review
axes pass. Integration, release, deployment, sidecar shutdown, removal of
deployed environment values, and production verification require explicit
later authorization. Removing repository support does not prove that deployed
runtime or infrastructure state has changed.
