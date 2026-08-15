# Repository Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the retired website-import feature, proven technical debris, and obsolete documentation while preserving manual business-context editing and every protected surface.

**Architecture:** Retire the feature at its public composition boundary, then delete its private implementation. Replace import-oriented UI with one controlled manual field, prune dependencies only from import/config evidence, and consolidate documentation into current authorities plus strong pointers.

**Tech Stack:** Node.js 20, TypeScript, Fastify 5, Next.js 15, React 19, Jest/Babel, npm workspaces, BullMQ, Kysely.

## Global Constraints

- Work only in `/private/tmp/hearloop-task2-schema` on `codex/media-pinning-schema` for tracked changes.
- Preserve `career/` and `apps/quicklube-demo` behavior and files.
- Preserve all applied migrations and the `website_url` / `business_context_source` Kysely schema columns.
- Preserve media-pinning behavior and the locked legacy-v0 rollout boundary.
- Do not merge, push, deploy, migrate, mutate infrastructure, or clean production resources.
- Use one RED-to-GREEN behavior slice at a time for application behavior.
- Treat unexpected baseline failures as evidence; do not expand scope silently.
- Finish as `implemented`, not `released` or `complete`.
- GitHub Issue #1 is the task contract.

---

### Task 1: Establish Baseline and Retire Backend Import Surface

**Files:**
- Create: `apps/api/src/routes/register.ts`
- Create: `apps/api/src/routes/__tests__/register.test.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/src/lib/queue.ts`
- Modify: `apps/api/src/lib/partner-settings.ts`
- Modify: `apps/api/src/lib/load-partner.ts`
- Modify: `apps/api/src/routes/partner-me.ts`
- Modify: `apps/api/src/lib/__tests__/partner-settings.test.ts`
- Modify: `apps/api/src/lib/__tests__/queue.test.ts`
- Modify: `apps/api/src/routes/__tests__/partner-me.allowed-origins.test.ts`
- Delete: `apps/api/src/routes/business-context-import.ts`
- Delete: `apps/api/src/jobs/import-business-context.ts`
- Delete: `apps/api/src/lib/scrape-via-crawl4ai.ts`
- Delete: `apps/api/src/lib/summarize-business-context.ts`
- Delete: `apps/api/src/lib/import-rate-limit.ts`
- Delete: `apps/api/src/lib/import-job-status.ts`
- Delete: `apps/api/src/lib/__tests__/summarize-business-context.test.ts`
- Delete: `apps/api/src/lib/__tests__/import-job-status.test.ts`

**Interfaces:**
- Consumes: existing Fastify route plugins and `validatePartnerSettingsInput()`.
- Produces: `registerRoutes(app: FastifyInstance): Promise<void>`; Partner settings input containing `businessContextSource?: "manual" | "template" | null`; no website-import route, worker, queue, or Partner profile metadata.

- [ ] **Step 1: Record baseline evidence**

Run:

```bash
git status --short --branch
npm run build --workspace=apps/api
npm test --workspace=apps/api
npm run build --workspace=apps/web
npm run build --workspace=apps/quicklube-demo
npm run build --workspace=packages/react
npm test --workspace=packages/react
```

Expected: record every exit code and test count in the task notes before editing. A pre-existing failure is not permission to repair unrelated behavior.

- [ ] **Step 2: Write the failing route-composition test**

Create `apps/api/src/routes/__tests__/register.test.ts`:

```ts
import Fastify from "fastify";
import { registerRoutes } from "../register";

describe("registerRoutes", () => {
  it.each([
    ["POST", "/v1/partners/me/business-context/import"],
    ["GET", "/v1/partners/me/business-context/import/00000000-0000-4000-8000-000000000000"],
  ])("does not register retired import route %s %s", async (method, url) => {
    const app = Fastify();
    app.decorate("authenticate", async () => undefined);
    app.decorate("authenticatePartner", async () => undefined);
    await registerRoutes(app);

    const response = await app.inject({
      method: method as "GET" | "POST",
      url,
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});
```

- [ ] **Step 3: Run the new test to verify RED**

Run:

```bash
npm test --workspace=apps/api -- --runTestsByPath src/routes/__tests__/register.test.ts
```

Expected: FAIL because `../register` does not exist.

- [ ] **Step 4: Add the real route-composition seam without the retired plugin**

Create `apps/api/src/routes/register.ts` exporting:

```ts
import type { FastifyInstance } from "fastify";
import { sessionRoutes } from "./sessions";
import { publicRoutes } from "./public";
import { partnerRoutes } from "./partners";
import { partnerMeRoutes } from "./partner-me";
import { captureLinkRoutes } from "./capture-links";
import { healthRoutes } from "./health";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(sessionRoutes, { prefix: "/v1" });
  await app.register(publicRoutes, { prefix: "/v1" });
  await app.register(partnerRoutes, { prefix: "/v1" });
  await app.register(partnerMeRoutes, { prefix: "/v1" });
  await app.register(captureLinkRoutes, { prefix: "/v1" });
  await app.register(healthRoutes);
}
```

Replace the six route registrations in `index.ts` with `await registerRoutes(app)`. Remove the retired route import, worker import, worker construction, shutdown entry, and import-worker log path.

- [ ] **Step 5: Run the route test to verify GREEN**

Run the Step 3 command.

Expected: PASS for both retired endpoints with status 404.

- [ ] **Step 6: Write RED settings/profile tests**

Update `partner-settings.test.ts` so the accepted composite input excludes `websiteUrl`, add this test, and keep the existing webhook/origin/business-context assertions:

```ts
it.each(["import", "import_edited"])(
  "rejects retired business context source %s",
  (businessContextSource) => {
    expect(() =>
      validatePartnerSettingsInput({ businessContextSource })
    ).toThrow(PartnerSettingsValidationError);
  }
);

it("ignores retired websiteUrl input", () => {
  expect(
    validatePartnerSettingsInput({ websiteUrl: "https://example.com" } as never)
  ).toEqual({});
});
```

Extend `partner-me.allowed-origins.test.ts` with a GET handler test whose request Partner includes legacy `websiteUrl` and `businessContextSource` properties, then assert the reply object has neither key while still containing `businessContext`.

- [ ] **Step 7: Run scoped tests to verify RED**

Run:

```bash
npm test --workspace=apps/api -- --runTestsByPath src/lib/__tests__/partner-settings.test.ts src/routes/__tests__/partner-me.allowed-origins.test.ts
```

Expected: FAIL because import sources remain accepted and the profile still returns retired metadata.

- [ ] **Step 8: Implement minimal Partner settings/profile behavior**

In `partner-settings.ts`, retain only:

```ts
export const BUSINESS_CONTEXT_SOURCES = ["manual", "template"] as const;

export interface PartnerSettingsInput {
  webhookUrl?: string | null;
  allowedOrigins?: string | null;
  businessContext?: string | null;
  businessContextSource?: string | null;
}
```

Remove website validation and update fields. In `load-partner.ts`, stop selecting and mapping `website_url` and `business_context_source`. In `partner-me.ts`, omit both fields from GET and remove `website_url` update wiring while retaining `business_context_source` writes for `manual` and `template`.

- [ ] **Step 9: Remove the private import implementation**

Delete the files listed above. Remove `import-business-context`, `IMPORT_QUEUE_NAME`, and `enqueueImportBusinessContext()` from `queue.ts`; update the worker-count comment from six workers to five. Remove import-specific queue tests while preserving active queue-name, close, and health-count assertions.

- [ ] **Step 10: Verify Task 1**

Run:

```bash
npm test --workspace=apps/api -- --runTestsByPath src/routes/__tests__/register.test.ts src/lib/__tests__/partner-settings.test.ts src/routes/__tests__/partner-me.allowed-origins.test.ts src/lib/__tests__/queue.test.ts
npm run build --workspace=apps/api
rg -n "business-context/import|import-business-context|enqueueImportBusinessContext|IMPORT_QUEUE_NAME|scrape-via-crawl4ai|summarize-business-context" apps/api/src
```

Expected: tests and build PASS; `rg` returns no matches.

- [ ] **Step 11: Commit Task 1**

```bash
git add apps/api/src
git commit -m "refactor(api): retire business context import"
```

---

### Task 2: Preserve Manual Business-Context UI

**Files:**
- Create: `apps/web/components/BusinessContextField.tsx`
- Modify: `apps/web/app/onboarding/page.tsx`
- Modify: `apps/web/components/EmbedSettingsPanel.tsx`
- Delete: `apps/web/components/BusinessContextImport.tsx`

**Interfaces:**
- Consumes: `PATCH /api/partners/me/settings` with `businessContext` and `businessContextSource`.
- Produces: `BusinessContextField({ value, onChange }: { value: string; onChange: (value: string) => void })`.

- [ ] **Step 1: Establish frontend RED after deleting the old component**

Delete `BusinessContextImport.tsx` only, then run:

```bash
npm run build --workspace=apps/web
```

Expected: FAIL because onboarding and settings still import the deleted component.

- [ ] **Step 2: Add the minimal shared manual field**

Create `BusinessContextField.tsx`:

```tsx
"use client";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export function BusinessContextField({ value, onChange }: Props) {
  return (
    <>
      <label style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)" }}>
        Business description
      </label>
      <textarea
        style={{
          width: "100%",
          marginTop: 6,
          minHeight: 120,
          padding: "10px 12px",
          borderRadius: 8,
          border: "0.5px solid var(--paper-3)",
          fontSize: 13,
          resize: "vertical",
        }}
        placeholder="What does your business do? What do customers usually visit for?"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </>
  );
}
```

- [ ] **Step 3: Simplify onboarding**

Remove website/import state, refs, and source resolution. Render `BusinessContextField`. Save this payload:

```ts
body: JSON.stringify({
  businessContext: context,
  businessContextSource: sourceOverride ?? "manual",
})
```

The template path passes `"template"`; manual Save passes `"manual"`. Change the explanatory copy to: `Optional. Describe your business or use the starter template. This helps Hearloop label topics and sentiment correctly.`

- [ ] **Step 4: Simplify settings**

Remove `websiteUrl`, import source state, and legacy source fields from `PartnerProfile`. Render `BusinessContextField`. Save:

```ts
body: JSON.stringify({
  allowedOrigins: allowedOrigins.trim() || null,
  businessContext: businessContext.trim() || null,
  businessContextSource: businessContext.trim() ? "manual" : null,
})
```

Keep embed-key, allowed-origin, loading, and error behavior unchanged.

- [ ] **Step 5: Verify Task 2**

Run:

```bash
npm run build --workspace=apps/web
npm run build --workspace=apps/quicklube-demo
rg -n "BusinessContextImport|websiteUrl|importDraftRef|business-context/import" apps/web
```

Expected: both builds PASS; `rg` returns no matches.

- [ ] **Step 6: Commit Task 2**

```bash
git add apps/web
git commit -m "refactor(web): keep business context manual"
```

---

### Task 3: Remove Sidecar, Spike, Dependencies, and Dead Imports

**Files:**
- Modify: `package.json`
- Modify: `apps/api/package.json`
- Modify: `package-lock.json`
- Modify: `apps/api/src/lib/groq.ts`
- Modify: `apps/api/src/lib/storage.ts`
- Delete: `services/scraper/main.py`
- Delete: `services/scraper/Dockerfile`
- Delete: `services/scraper/requirements.txt`
- Delete: `infra/docker-compose.scraper.yml`
- Delete: `testing/spike/crawl4ai-http-spike.py`
- Delete: `testing/spike/crawl4ai-http-spike-results.json`
- Delete: `testing/spike/SPIKE_REPORT.md`

**Interfaces:**
- Consumes: existing npm workspace lockfile and Babel Jest configuration.
- Produces: the same build/runtime interfaces without direct declarations for unused packages or any Python sidecar.

- [ ] **Step 1: Capture dependency evidence**

Run:

```bash
rg -n "@anthropic-ai/sdk|ts-jest|@types/pino|@jridgewell/trace-mapping" --glob '!package-lock.json' --glob '!career/**' .
```

Expected: matches occur only in package manifests, cleanup documents, or comments; no live import/config requires the declarations.

- [ ] **Step 2: Remove direct declarations and retired sidecar files**

Use patch edits to remove root `@jridgewell/trace-mapping`, API `@anthropic-ai/sdk`, API `ts-jest`, and API `@types/pino`. Delete the sidecar, compose, and spike files listed above.

- [ ] **Step 3: Regenerate the lockfile mechanically**

Run:

```bash
npm install --package-lock-only --ignore-scripts --offline
```

Expected: exit 0 without network access; removed packages may remain transitively only when another installed package requires them.

- [ ] **Step 4: Remove compiler-confirmed unused imports**

Remove `Readable` from `groq.ts` and `GetObjectCommandInput` from `storage.ts`. Leave `maxDurationSec` unchanged and record it on Issue #1 as a separate correctness follow-up.

- [ ] **Step 5: Verify Task 3**

Run:

```bash
npm run build --workspace=apps/api
npm test --workspace=apps/api
npm run build --workspace=packages/react
npm test --workspace=packages/react
npm run build --workspace=apps/web
npm run build --workspace=apps/quicklube-demo
rg -n "crawl4ai|SCRAPER_URL|docker-compose.scraper|@anthropic-ai/sdk|ts-jest|@types/pino" --glob '!career/**' --glob '!docs/superpowers/**' --glob '!package-lock.json' .
```

Expected: all checks match the recorded baseline or improve; the final `rg` has no live-code/config matches.

- [ ] **Step 6: Commit Task 3**

```bash
git add package.json apps/api/package.json package-lock.json apps/api/src/lib services infra testing/spike
git commit -m "chore: remove retired import dependencies"
```

---

### Task 4: Consolidate Tracked Documentation

**Files:**
- Modify: `AGENTS.md`
- Modify: `README.md`
- Modify: `CONTEXT.md`
- Modify: `context/BACKLOG.md`
- Modify: `context/INFRA.md`
- Modify: `context/DECISIONS.md`
- Modify: `context/METRICS.md`
- Delete: `context/BUSINESS_CONTEXT_SCRAPE_DESIGN.md`
- Delete: `context/PHASE1_PLATFORM.md`
- Delete: `voice_micro_feedback_sdk_api_spec.pdf`
- Delete: `.vscode/settings.json`

**Interfaces:**
- Consumes: `docs/agents/workflow.md`, `docs/agents/decisions.yaml`, `docs/agents/domain.md`, current code/config, and the main-workspace BACKLOG/INFRA additions.
- Produces: a small always-loaded `AGENTS.md` kernel and authoritative current docs with no retired import instructions.

- [ ] **Step 1: Rewrite the AGENTS kernel**

Keep only:

```md
# Hearloop agent contract

## Start gate
1. Read this file.
2. For engineering work, follow `docs/agents/workflow.md` before exploring or editing.
3. Read `CONTEXT.md` when domain language is in scope.
4. Page the user when a required skill remains missing after local discovery.

## Locked safety
- Preserve unrelated work and obey the active GitHub Issue task contract.
- Merge, push, deploy, migration, infrastructure mutation, destructive Git, and external writes require explicit authority.
- `career/` is a separate protected context.

## Context pointers
| Trigger | Read |
| --- | --- |
| Engineering lifecycle, skills, gates, completion | `docs/agents/workflow.md` |
| Locked/default/open decisions | `docs/agents/decisions.yaml` |
| Domain language | `CONTEXT.md`, then `docs/agents/domain.md` |
| GitHub task tracking | `docs/agents/issue-tracker.md` |
| Evaluation | `docs/agents/evaluation.md`, `docs/agents/evals/` |
| Operations/deployment | `context/INFRA.md` |
| Current work | `context/BACKLOG.md` |
| Architecture rationale | `context/DECISIONS.md` |
| Measurements | `context/METRICS.md` |
| Career/interview work only | `career/interview-prep/INTERVIEW_PREP.md` |
```

Retain the CI badge only if it remains useful in README; do not duplicate it in AGENTS.

- [ ] **Step 2: Rewrite current entry and authority docs**

Apply these exact content decisions:

- README lists four active workspaces, manual business context, standard build/test commands, and agent pointers; remove scraper/Phase-1 instructions.
- CONTEXT removes `Business context import` and `Import source URL`; `Business context` remains manual/template text used by analysis.
- BACKLOG contains unfinished work only, led by media-pinning finalize/worker/cleanup rollout, migration `011` status, live QR E2E, ZAP active scan, and production follow-ups. Remove completed tickets 001-014 and retired import validation.
- INFRA keeps the main workspace's August 14 S3 versioning/CORS capability notes and removes scraper-sidecar instructions.
- DECISIONS changes infrastructure to EC2 + Neon + Upstash, HTTPS to Caddy/nip.io plus the same-origin web proxy where used, AI to Bedrock only, and removes placeholder-package claims.
- METRICS removes Crawl4AI spike/import guidance and retains all unrelated measured evidence.

- [ ] **Step 3: Delete superseded tracked documents**

Delete the four tracked artifacts listed in this task. Before deletion, verify no retained doc points to them:

```bash
rg -n "BUSINESS_CONTEXT_SCRAPE_DESIGN|PHASE1_PLATFORM|voice_micro_feedback_sdk_api_spec|testing/spike" --glob '*.md' .
```

Update each live pointer found; historical references inside Git are not edited.

- [ ] **Step 4: Verify documentation**

Run:

```bash
rg -n "Crawl4AI|business-context/import|SCRAPER_URL|PHASE1_PLATFORM|BUSINESS_CONTEXT_SCRAPE_DESIGN|RDS over|ElastiCache" AGENTS.md README.md CONTEXT.md context/BACKLOG.md context/INFRA.md context/DECISIONS.md context/METRICS.md docs/agents
git diff --check
```

Expected: no stale current-state claims. Historical research references may remain only when clearly labeled as historical and outside current operational instructions.

Run this local Markdown-link check over tracked Markdown files and record any
intentional exceptions in Issue #1:

```bash
node -e 'const fs=require("fs"),path=require("path"),cp=require("child_process");const files=cp.execFileSync("git",["ls-files","*.md"],{encoding:"utf8"}).trim().split("\n").filter(Boolean);const missing=[];for(const file of files){const text=fs.readFileSync(file,"utf8");for(const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const raw=match[1].split("#")[0].replace(/^<|>$/g,"");if(!raw||/^(https?:|mailto:)/.test(raw))continue;const target=path.resolve(path.dirname(file),decodeURIComponent(raw));if(!fs.existsSync(target))missing.push(file+" -> "+raw)}}if(missing.length){console.error(missing.join("\n"));process.exit(1)}console.log("Markdown links OK")'
```

- [ ] **Step 5: Commit Task 4**

```bash
git add AGENTS.md README.md CONTEXT.md context docs .vscode voice_micro_feedback_sdk_api_spec.pdf
git commit -m "docs: consolidate current repository guidance"
```

---

### Task 5: Remove Exact Untracked Artifacts and Complete Review

**Files outside the feature worktree, exact approved deletion targets:**
- Delete: `/Users/shubhkapadia/Desktop/Development/Web-Apps/Hearloop/context/PRD_PIPELINE_HARDENING_AND_ALERTING.md`
- Delete: `/Users/shubhkapadia/Desktop/Development/Web-Apps/Hearloop/context/tickets/`
- Delete: `/Users/shubhkapadia/Desktop/Development/Web-Apps/Hearloop/docs/superpowers/specs/2026-08-14-hearloop-platform-design-quality-loop-design.md`
- Delete: `/Users/shubhkapadia/Desktop/Development/Web-Apps/Hearloop/workflows/hearloop-platform-design-quality-loop.md`
- Delete: `/Users/shubhkapadia/Desktop/Development/Web-Apps/Hearloop/workflows/prompts/hearloop-platform-design-master.md`

**Interfaces:**
- Consumes: exact user-approved cleanup list and tracked replacement authorities.
- Produces: no local duplicate ticket/workflow artifacts; preserves modified BACKLOG/INFRA and every research file.

- [ ] **Step 1: Verify exact destructive targets**

Run in the main workspace:

```bash
git status --short --untracked-files=all
find context/tickets -maxdepth 1 -type f -print | sort
find workflows -maxdepth 2 -type f -print | sort
```

Expected: only the exact approved files/directories are selected. Confirm `context/BACKLOG.md`, `context/INFRA.md`, and all `context/research/*` are excluded.

- [ ] **Step 2: Confirm information transfer**

For tickets 001-014, match each acceptance outcome to commits `d3d6d07` through `23e796d`, current tests, or `context/METRICS.md`. Confirm the quality-loop output remains represented by the media-pinning plans, harness documents, decisions, and GitHub Issue #1.

- [ ] **Step 3: Delete only the approved untracked targets**

Use explicit paths with no glob expansion. Do not delete parent `context`, `docs`, or the entire main workspace. Report that these untracked files are not Git-recoverable.

- [ ] **Step 4: Run fresh full verification**

Run in the feature worktree:

```bash
npm run build --workspace=apps/api
npm test --workspace=apps/api
npm run build --workspace=apps/web
npm run build --workspace=apps/quicklube-demo
npm run build --workspace=packages/react
npm test --workspace=packages/react
git diff --check
git status --short --branch
git log --oneline 22dfd16..HEAD
```

Repeat the dependency, retired-feature, and stale-document scans from Tasks 3 and 4.

- [ ] **Step 5: Run Matt Pocock code review**

Use `mattpocock-skills:code-review` against fixed base `22dfd16` and report separately:

- Standards: repository rules plus Fowler smell baseline.
- Spec: every requirement in `docs/superpowers/specs/2026-08-15-repository-cleanup-design.md` and GitHub Issue #1.

Resolve every Critical or Important in-scope finding, rerun affected checks, and commit fixes separately.

- [ ] **Step 6: Update Issue #1 and hand off**

Comment with commits, deleted untracked paths, RED/GREEN evidence, exact verification results, both review axes, the `maxDurationSec` follow-up, and the accurate `implemented` completion state. Do not close the issue as operationally complete; release and production cleanup remain separate.
