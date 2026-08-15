# Apply Migration 011 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Production SQL apply waits on an explicit human PR check. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the leftover `registerRoutes` file rename, prove migration `011` on a disposable copy of production (after applying missing `010`), open a PR against `chore/repository-cleanup`, and stop until the user approves production apply.

**Architecture:** This is a release gate, not a product change. Production remains on `009` until the PR check. Preview-branch SQL applies `010` then `011` against a clone of `divine-cherry-94715192` / `production`. The API rename is a path-only move of `registerRoutes` with no route-table behavior change.

**Tech Stack:** Neon PostgreSQL, `psql`, Fastify route registration, npm workspaces (scoped Jest).

## Global Constraints

- Do not apply SQL to Neon default branch `production` (`br-green-poetry-aj1e0o9v`) until the user says the PR check passed.
- Do not merge, deploy, SSH, or change AWS beyond the already-run read-only versioning GET.
- Do not change finalize, workers, delete/expiry, capture clients, or the `legacy-v0` default.
- Do not "fix" the approved baseline test failures.
- Rollback SQL is only the commented block at the bottom of `011_media_evidence_pinning.sql`, and only with evidence of no `versioned-v1` traffic; page before production rollback.

---

### Task 1: Preview-branch migration proof

**Files:**
- Read: `packages/db/migrations/010_webhook_delivery_event_id.sql`
- Read: `packages/db/migrations/011_media_evidence_pinning.sql`
- Test: `packages/db/tests/011_media_evidence_pinning.test.sh`

**Interfaces:**
- Consumes: Neon preview branch `mig-011-preview` (`br-orange-wave-ajyxqpum`)
- Produces: SQL evidence that existing sessions are `legacy-v0` with nullable recording version fields; constraint contract PASS if the shell test is run against a disposable URL

- [x] **Step 1:** Apply `010` then `011` with `psql` to the preview branch (not production).
- [x] **Step 2:** Assert: no `versioned-v1` rows; all sessions `legacy-v0`; recording version columns null for pre-existing rows; `upload_grants` and `finalize_receipts` exist.
- [x] **Step 3:** Run `011_media_evidence_pinning.test.sh` against a disposable Postgres URL (Docker or a throwaway Neon branch). Expected: `011_media_evidence_pinning migration contract: PASS`

### Task 2: Rename registerRoutes (TDD)

**Files:**
- Modify: `apps/api/src/routes/__tests__/register.test.ts`
- Create: `apps/api/src/lib/register-routes.ts` (move from `apps/api/src/routes/register.ts`)
- Modify: `apps/api/src/index.ts`
- Delete: `apps/api/src/routes/register.ts`

**Interfaces:**
- Consumes: `export async function registerRoutes(app: FastifyInstance): Promise<void>`
- Produces: same function from `apps/api/src/lib/register-routes.ts`; 404 tests still green

- [x] **Step 1:** Point the test import at `../../lib/register-routes` and run it (expect fail: cannot find module).
- [x] **Step 2:** Move the file and update `index.ts` import only.
- [x] **Step 3:** Re-run `npm test --workspace=apps/api -- --runTestsByPath src/routes/__tests__/register.test.ts` (expect pass).

### Task 3: Docs for not-yet-applied production state

**Files:**
- Modify: `context/INFRA.md`
- Modify: `context/BACKLOG.md`
- Modify: `context/METRICS.md`

- [x] **Step 1:** Record S3 versioning Enabled (live GET 2026-08-15). Record 010 missing on production, 011 unapplied, preview-branch proof done. Do not claim production 011 applied.
- [x] **Step 2:** METRICS entry with before (011 objects absent, 1882 sessions) and after pending production apply.

### Task 4: Review, push, PR, stop

- [ ] **Step 1:** Standards + Spec review of the diff vs `3981fa7`.
- [ ] **Step 2:** `git push -u origin HEAD` and `gh pr create` with base `chore/repository-cleanup`.
- [ ] **Step 3:** Stop and ask the user to do the PR check. Production apply is not in this task's commits.
