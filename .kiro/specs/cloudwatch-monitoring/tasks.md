# Implementation Plan: CloudWatch Monitoring

## Overview

Add CloudWatch observability to the Hearloop API in two layers: a new `lib/cloudwatch.ts` module that owns the `CloudWatchClient` singleton and `emitBedrockInvocation()` helper, and an `infra/alarms.sh` script for EC2 CPU/memory alarms. The runtime module is wired into `jobs/analyze.ts` as a fire-and-forget side branch that never touches the critical pipeline path. Environment validation in `lib/env.ts` is extended to require `CLOUDWATCH_REGION` and `CLOUDWATCH_NAMESPACE` at startup.

## Tasks

- [x] 1. Add `@aws-sdk/client-cloudwatch` dependency to `apps/api/package.json`
  - Pin `"@aws-sdk/client-cloudwatch": "3.1037.0"` in `dependencies` to match the existing `@aws-sdk/client-bedrock-runtime` major version
  - Run `npm install` in `apps/api` to update `package-lock.json`
  - _Requirements: 1.1 (module must import CloudWatchClient from this package)_

- [x] 2. Create `apps/api/src/lib/cloudwatch.ts`
  - [x] 2.1 Implement credential resolution and singleton `CloudWatchClient`
    - Write `resolveCredential(aliases, label)` helper that iterates the alias list and returns the first non-empty value, throwing at module load time if none resolves
    - Validate `CLOUDWATCH_REGION` at module load time; throw immediately if absent or empty
    - Resolve `accessKeyId` using priority order: `BEDROCK_ACCESS_KEY_ID` → `AWS_ACCESS_KEY_ID` → `STORAGE_ACCESS_KEY_ID`
    - Resolve `secretAccessKey` using priority order: `BEDROCK_SECRET_ACCESS_KEY` → `AWS_SECRET_ACCESS_KEY` → `STORAGE_SECRET_ACCESS_KEY`
    - Export `cloudWatchClient` as the singleton `CloudWatchClient` instance
    - Do NOT import from any file under `lib/`, `jobs/`, or `routes/`; read all config from `process.env` only
    - Do NOT call any CloudWatch API during module initialisation
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 7.1_

  - [x] 2.2 Implement `BedrockInvocationMetric` interface and `emitBedrockInvocation()` helper
    - Export `BedrockInvocationMetric` interface with fields: `modelUsed: "nova-lite" | "haiku-fallback"`, `startTimestamp: number`, `inputTokens: number`, `outputTokens: number`
    - Define `MODEL_ID_MAP` mapping `"nova-lite"` → `"us.amazon.nova-lite-v1:0"` and `"haiku-fallback"` → `"us.anthropic.claude-haiku-4-5-20251001-v1:0"`
    - Compute `latencyMs = Date.now() - metric.startTimestamp` inside the helper
    - Derive `outcome` as `"success"` for `nova-lite`, `"fallback"` for `haiku-fallback`
    - Build `dimensions` array with exactly `ModelId` and `Outcome` — no `SessionId` dimension
    - Emit exactly 4 `MetricDatum` items in a single `PutMetricDataCommand`: `BedrockLatencyMs` (Milliseconds), `BedrockInputTokens` (Count), `BedrockOutputTokens` (Count), `BedrockInvocationCount` (Count, value 1)
    - Read `CLOUDWATCH_NAMESPACE` from `process.env` with fallback `"Hearloop/Pipeline"`
    - Propagate errors to the caller without retrying and without calling any other CloudWatch API
    - Do NOT import `lib/logger.ts`
    - _Requirements: 2.2, 2.3, 2.6, 2.7, 4.2, 4.3, 7.1, 7.2, 7.5, 8.4_

  - [x]* 2.3 Write property tests for `lib/cloudwatch.ts`
    - **Property 1: Missing CLOUDWATCH_REGION causes module load failure** — for any absent or empty-string `CLOUDWATCH_REGION`, importing the module SHALL throw before constructing `CloudWatchClient`
    - **Validates: Requirements 1.2**
    - **Property 2: Credential alias priority resolution** — for any combination of the three access key aliases where at least one is non-empty, the client SHALL be initialised with the value from the highest-priority alias
    - **Validates: Requirements 1.3**
    - **Property 4: Emit payload shape** — for any valid `BedrockInvocationMetric`, `emitBedrockInvocation()` SHALL issue exactly one `PutMetricData` call with exactly 4 `MetricDatum` items, each carrying exactly `ModelId` and `Outcome` dimensions, and no `SessionId` dimension
    - **Validates: Requirements 2.2, 2.3, 2.7**
    - **Property 5: Latency computation** — for any `startTimestamp` ≤ `Date.now()`, `BedrockLatencyMs` SHALL equal `Date.now() - startTimestamp` at emission time, including `0`
    - **Validates: Requirements 2.6**
    - **Property 6: ModelId dimension mapping** — `nova-lite` maps to `"us.amazon.nova-lite-v1:0"`, `haiku-fallback` maps to `"us.anthropic.claude-haiku-4-5-20251001-v1:0"`
    - **Validates: Requirements 2.3**
    - Use `fast-check` for all property tests; mock `CloudWatchClient.send` to capture emitted payloads
    - Located at `apps/api/src/lib/__tests__/cloudwatch.test.ts`

  - [x]* 2.4 Write unit tests for `lib/cloudwatch.ts`
    - Module throws on missing `CLOUDWATCH_REGION` (concrete example)
    - Module does NOT call `PutMetricData` on import
    - `emitBedrockInvocation` with `nova-lite` produces `ModelId = "us.amazon.nova-lite-v1:0"` and `Outcome = "success"`
    - `emitBedrockInvocation` with `haiku-fallback` produces correct `ModelId` and `Outcome = "fallback"`
    - _Requirements: 1.2, 1.4, 2.3_

- [ ] 3. Checkpoint — Ensure `cloudwatch.ts` compiles and all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Extend `apps/api/src/lib/env.ts` with CloudWatch variable validation
  - [x] 4.1 Add `CLOUDWATCH_REGION` and `CLOUDWATCH_NAMESPACE` to the `REQUIRED` map in `lib/env.ts`
    - Add `CLOUDWATCH_REGION: "CloudWatch region for Bedrock invocation metrics"` to the `REQUIRED` record
    - Add `CLOUDWATCH_NAMESPACE: "CloudWatch namespace (e.g. Hearloop/Pipeline)"` to the `REQUIRED` record
    - Do NOT add a new credential entry — CloudWatch reuses the existing `ALIASED` credential aliases already validated
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x]* 4.2 Write unit tests for the updated `lib/env.ts`
    - `validateEnv()` calls `process.exit(1)` when `CLOUDWATCH_REGION` is absent
    - `validateEnv()` calls `process.exit(1)` when `CLOUDWATCH_NAMESPACE` is absent
    - `validateEnv()` completes without error when both are present
    - `CLOUDWATCH_ACCESS_KEY_ID` is NOT in the `REQUIRED` map
    - Extend existing `apps/api/src/lib/__tests__/env.test.ts`
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 5. Wire `emitBedrockInvocation` into `apps/api/src/jobs/analyze.ts`
  - [x] 5.1 Add `startTimestamp` capture and fire-and-forget emit block to `runAnalyzeJob()`
    - Import `emitBedrockInvocation` from `"../lib/cloudwatch"` at the top of `analyze.ts`
    - Capture `const startTimestamp = Date.now()` immediately before the `analyzeTranscript()` call
    - After the existing `log.info("analysis complete")` call and before the DB update block, insert the fire-and-forget emit block guarded by `analysis.modelUsed === "nova-lite" || analysis.modelUsed === "haiku-fallback"`
    - The `.catch()` handler must log at `warn` level via `jobLogger` with `{ sessionId, err: err.message, metric: { modelUsed, inputTokens, outputTokens } }`
    - Do NOT `await` the `emitBedrockInvocation()` call — it must be fire-and-forget
    - When `modelUsed === "none"`, do NOT call `emitBedrockInvocation`
    - _Requirements: 2.1, 2.4, 2.5, 4.1, 8.1, 8.2, 8.3_

  - [x]* 5.2 Write property tests for the emit guard in `jobs/analyze.ts`
    - **Property 3 (part a): Emit skipped when modelUsed is "none"** — for any job payload where `analyzeTranscript` returns `{ modelUsed: "none" }`, `emitBedrockInvocation` SHALL NOT be called
    - **Validates: Requirements 2.1, 4.2**
    - **Property 3 (part b): Emit called exactly once for success/fallback** — for any `modelUsed` of `"nova-lite"` or `"haiku-fallback"`, `emitBedrockInvocation` SHALL be called exactly once
    - **Validates: Requirements 2.1, 4.2**
    - Use `fast-check` with mocked `analyzeTranscript` and `emitBedrockInvocation`
    - Located at `apps/api/src/jobs/__tests__/analyze.test.ts`

  - [x]* 5.3 Write unit tests for the emit wiring in `jobs/analyze.ts`
    - Emit failure does NOT throw from `runAnalyzeJob` — session reaches `completed` and webhook is enqueued
    - `warn` log is emitted with `sessionId`, `err.message`, and metric payload when emit fails
    - `log.info("analysis complete")` is called before `emitBedrockInvocation`
    - _Requirements: 2.4, 8.1, 8.3_

- [ ] 6. Checkpoint — Ensure all tests pass and pipeline integration is correct
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Create `infra/alarms.sh` for EC2 CPU and memory alarms
  - [x] 7.1 Write the infrastructure alarm script
    - Create `infra/alarms.sh` at the repository root (not under `apps/api/src/`)
    - Add `set -euo pipefail` and a usage comment block documenting `INSTANCE_ID` and `SNS_TOPIC_ARN` prerequisites
    - Implement the CPU alarm: `aws cloudwatch put-metric-alarm` targeting `AWS/EC2` namespace, `CPUUtilization` metric, `InstanceId` dimension, threshold `80`, `evaluation-periods 2`, `period 300`, statistic `Average`, `GreaterThanOrEqualToThreshold`, `treat-missing-data missing`, `--alarm-actions` and `--ok-actions` wired to `SNS_TOPIC_ARN`
    - Implement the memory alarm: `aws cloudwatch put-metric-alarm` targeting `CWAgent` namespace, `mem_used_percent` metric, `InstanceId` dimension, threshold `85`, `evaluation-periods 2`, `period 300`, statistic `Average`, `GreaterThanOrEqualToThreshold`, `treat-missing-data breaching`, `--alarm-actions` and `--ok-actions` wired to `SNS_TOPIC_ARN`
    - Add a comment block on the memory alarm documenting the fallback to `Hearloop/Pipeline` namespace if CloudWatch Agent is not installed
    - Make the script executable (`chmod +x infra/alarms.sh`)
    - This file must NOT be imported or called from any code under `apps/api/src/`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 7.3, 7.4_

- [x] 8. Capture baseline metrics in `context/METRICS.md`
  - [x] 8.1 Add the CloudWatch monitoring baseline entry to `context/METRICS.md`
    - Add the SQL query block for capturing pre-deployment baseline (avg latency, avg input/output tokens, Nova Lite vs Haiku ratio) as specified in the design document
    - Add the metrics table with `Before` column populated from DB query results (or marked `_TBD — run query before deploy_` if no completed sessions exist yet)
    - Add placeholder `After` rows for P50 and P95 `BedrockLatencyMs` to be filled post-deployment
    - Follow the project's standard `context/METRICS.md` format: Metric, Before, After, Delta, How measured
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 9. Final checkpoint — Ensure all tests pass and smoke checks are clean
  - Ensure all tests pass, ask the user if questions arise.
  - Verify `cloudwatch.ts` has no imports from `lib/`, `jobs/`, or `routes/`
  - Verify `cloudwatch.ts` has no `setInterval`, `setTimeout`, or `setImmediate` calls
  - Verify `infra/alarms.sh` thresholds match requirements (CPU 80%, memory 85%, 2×5-min periods)

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- The `cloudwatch.ts` module must never import from other `lib/` files — all config comes from `process.env` directly
- The fire-and-forget pattern in `analyze.ts` is critical: CloudWatch latency must never add to session processing time
- `infra/alarms.sh` is infrastructure-only and must never be called from application code
- Property tests use `fast-check` which is already a dev dependency pattern in this project; add it if not present

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "4.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4", "4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "7.1"] },
    { "id": 5, "tasks": ["8.1"] }
  ]
}
```