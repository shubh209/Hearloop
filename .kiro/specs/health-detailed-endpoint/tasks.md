# Implementation Plan: health-detailed-endpoint

## Overview

Implement `GET /health/detailed` as a single new file `apps/api/src/routes/health.ts` with four exported check functions (`checkDatabase`, `checkRedis`, `checkQueues`, `checkPipeline`), a `withTimeout` helper, and a `healthRoutes` Fastify plugin. One line is added to `apps/api/src/index.ts` to register the plugin. All checks run concurrently via `Promise.allSettled` with a 10-second timeout. No new npm dependencies are introduced.

## Tasks

- [x] 1. Define TypeScript types and `withTimeout` helper
  - Create `apps/api/src/routes/health.ts` with the four TypeScript interfaces: `CheckResult`, `QueueDepths`, `PipelineStats`, and `HealthResponse`
  - Add the `CheckStatus` type alias (`'ok' | 'error'`)
  - Implement the `withTimeout<T>(promise, ms, fallback)` helper using `Promise.race` against a `setTimeout` resolver
  - Export `withTimeout` for use in tests
  - Define the `HEALTH_TIMEOUT_MS = 10_000` constant
  - _Requirements: 1.5, 1.6, 6.3_

- [x] 2. Implement `checkDatabase()`
  - [x] 2.1 Implement `checkDatabase()` function
    - Import `db` from `../lib/db` and `sql` from `kysely`
    - Capture `Date.now()` before the query and compute `latencyMs` in both success and catch branches
    - Execute `sql\`SELECT 1\`.compile(db)` via `db.executeQuery()`
    - Return `{ status: 'ok', latencyMs }` on success; `{ status: 'error', latencyMs, error: message }` on throw
    - Export the function for unit testing
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 2.2 Write property test for `checkDatabase()` latency non-negativity
    - **Property 3: Latency measurement non-negativity**
    - **Validates: Requirements 2.3, 3.3**
    - Use `fast-check` to generate arbitrary simulated durations (0–5000ms) by mocking `Date.now()`
    - Assert `latencyMs >= 0` and is present in both success and error result shapes from `checkDatabase()`

- [x] 3. Implement `checkRedis()`
  - [x] 3.1 Implement `checkRedis()` function
    - Create a short-lived `IORedis` connection from `process.env.REDIS_URL!` with `maxRetriesPerRequest: null, enableReadyCheck: false`
    - Issue `conn.ping()`, measure latency; if `latencyMs === 0`, re-issue once and use the second measurement
    - Return `{ status: 'error', error: ... }` if response is not `'PONG'`
    - Wrap `conn.disconnect()` in a `finally` block; swallow disconnect errors (best-effort cleanup)
    - Export the function for unit testing
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 3.2 Write property test for `checkRedis()` connection cleanup invariant
    - **Property 4: Connection cleanup invariant**
    - **Validates: Requirements 3.4, 4.2, 7.3**
    - Use `fast-check` to generate arbitrary outcomes (success, PING failure, throw, disconnect error)
    - Assert `conn.disconnect()` is always called regardless of outcome

- [x] 4. Implement `checkQueues()`
  - [x] 4.1 Implement `checkQueues()` function
    - Create one short-lived `IORedis` connection; instantiate four `Queue` instances for `hearloop-validate`, `hearloop-transcribe`, `hearloop-analyze`, `hearloop-webhooks`
    - Call `getJobCounts()` on all four queues concurrently via `Promise.all`; map `waiting` count to each key
    - Return `QueueDepths` object on success; `{ status: 'error', error: message }` if any call throws
    - In `finally`: close all queues via `Promise.allSettled(queues.map(q => q.close()))`, then `conn.disconnect()`
    - Export the function for unit testing
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [ ]* 4.2 Write property test for `checkQueues()` connection cleanup invariant
    - **Property 4: Connection cleanup invariant (queue variant)**
    - **Validates: Requirements 4.2, 7.3**
    - Use `fast-check` to generate arbitrary outcomes (all succeed, one throws, all throw)
    - Assert all four `queue.close()` calls and `conn.disconnect()` are always invoked

- [x] 5. Implement `checkPipeline()`
  - [x] 5.1 Implement `checkPipeline()` function
    - Import `db` from `../lib/db` and `sql` from `kysely`
    - Query `sessions` table with `created_at >= NOW() - INTERVAL '24 hours'` using Kysely aggregates: `COUNT(id)`, `COUNT(id) FILTER WHERE status='completed'`, `COUNT(id) FILTER WHERE status='failed'`, and `AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000) FILTER (WHERE status='completed' AND both timestamps non-null)`
    - Compute `completionRate24h = total === 0 ? 1.0 : round(completed / total, 2)`
    - Compute `avgLatencyMs = row.avg_latency_ms != null ? Math.round(Number(row.avg_latency_ms)) : null`
    - Return `{ status: 'ok', completionRate24h, avgLatencyMs, failedLast24h }` on success; `{ status: 'error', error: message }` on throw
    - Export the function for unit testing
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ]* 5.2 Write property test for `checkPipeline()` stats computation
    - **Property 5: Pipeline stats computation**
    - **Validates: Requirements 5.2, 5.3, 5.4**
    - Use `fast-check` to generate arbitrary arrays of session rows (random statuses, timestamps, counts including zero-total edge case)
    - Assert `completionRate24h = round(completed / total, 2)` or `1.0` when total is 0
    - Assert `avgLatencyMs` equals arithmetic mean of completed-session durations in ms, or `null` when none exist
    - Assert `failedLast24h` equals count of rows with `status === 'failed'`

- [x] 6. Implement route handler and `healthRoutes` plugin
  - [x] 6.1 Implement `healthRoutes` Fastify plugin and route handler
    - Register `GET /health/detailed` with no `preHandler` (public, no auth)
    - Call `withTimeout(Promise.allSettled([checkDatabase(), checkRedis(), checkQueues(), checkPipeline()]), HEALTH_TIMEOUT_MS, allTimeoutFallback)` where `allTimeoutFallback` is four fulfilled results each with `{ status: 'error', error: 'timeout' }`
    - Unwrap each `PromiseSettledResult` — use `.value` for fulfilled, stringify `.reason` for rejected
    - Derive `isHealthy`: all four checks have `status: 'ok'` (queueDepths has no `status` field at all when healthy)
    - Build and send `HealthResponse` with `reply.code(200).send(body)`
    - Export `healthRoutes` as a named export
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 6.1, 6.2, 6.3_

  - [ ]* 6.2 Write property test for overall status derivation
    - **Property 1: Overall status derivation**
    - **Validates: Requirements 1.2, 1.4**
    - Use `fast-check` to generate arbitrary combinations of `CheckResult` values for all four checks
    - Assert `status === 'healthy'` iff all four checks are ok; `'degraded'` otherwise
    - Assert HTTP response code is always 200

  - [ ]* 6.3 Write property test for response shape invariant
    - **Property 2: Response shape invariant**
    - **Validates: Requirements 1.5**
    - Use `fast-check` to generate arbitrary check outcomes (any mix of ok/error for all four checks)
    - Assert response always contains exactly `status`, `checks.database`, `checks.redis`, `checks.queueDepths`, `checks.pipeline` with correct types

  - [ ]* 6.4 Write property test for error isolation
    - **Property 6: Error isolation**
    - **Validates: Requirements 6.1**
    - Use `fast-check` to generate a random index (0–3) indicating which check throws an unhandled exception
    - Assert response contains all four check fields; the throwing check has `status: 'error'`; the other three checks are unaffected

- [ ] 7. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Register route in `index.ts`
  - [ ] 8.1 Add `healthRoutes` import and registration to `apps/api/src/index.ts`
    - Add `import { healthRoutes } from './routes/health'` at the top of `index.ts`
    - Add `await app.register(healthRoutes)` after the existing route registrations (no prefix — matches the existing `/health` pattern)
    - _Requirements: 1.1, 7.1_

- [ ] 9. Write unit tests for all four check functions
  - [ ] 9.1 Write unit tests for `checkDatabase()`
    - Mock `db.executeQuery` to resolve; verify `{ status: 'ok', latencyMs: n }` where `latencyMs >= 0`
    - Mock `db.executeQuery` to throw; verify `{ status: 'error', error: '<message>', latencyMs: n }`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ] 9.2 Write unit tests for `checkRedis()`
    - Mock `IORedis` to return `'PONG'`; verify `{ status: 'ok', latencyMs: n }`
    - Mock to return `'PONG'` with zero elapsed time; verify `ping()` is called twice
    - Mock to return `'LOADING'`; verify `{ status: 'error', error: '...' }`
    - Mock `ping()` to throw; verify `{ status: 'error', error: '<message>' }`
    - Verify `conn.disconnect()` is called in all cases (success, error, throw)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ] 9.3 Write unit tests for `checkQueues()`
    - Mock all four queues to return known counts; verify depth object maps `waiting` correctly
    - Mock one queue to throw; verify `{ status: 'error', error: '<message>' }`
    - Verify `queue.close()` and `conn.disconnect()` are called in all cases
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 9.4 Write unit tests for `checkPipeline()`
    - Mock `db` to return a known row; verify all three computed fields
    - Mock `total = 0`; verify `completionRate24h = 1.0`
    - Mock no completed sessions with timestamps; verify `avgLatencyMs = null`
    - Mock `db` to throw; verify `{ status: 'error', error: '<message>' }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [ ] 9.5 Write unit tests for the route handler
    - All checks ok: verify `status: 'healthy'`, HTTP 200
    - One check errors: verify `status: 'degraded'`, HTTP 200
    - All checks error: verify `status: 'degraded'`, HTTP 200
    - Timeout: mock all checks to never resolve; verify timeout result after 10s
    - _Requirements: 1.2, 1.3, 1.4, 6.2, 6.3_

- [ ] 10. TypeScript build verification
  - [ ] 10.1 Run `tsc --noEmit` in `apps/api` and fix any type errors
    - Verify `health.ts` compiles cleanly with no implicit `any`, no missing imports, and no type mismatches
    - Verify `index.ts` compiles cleanly after the `healthRoutes` import and registration are added
    - _Requirements: 7.1, 7.4_

- [ ] 11. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties using `fast-check`
- Unit tests validate specific examples and edge cases with mocked `db`, `IORedis`, and `Queue`
- The integration smoke test (`curl http://localhost:3001/health/detailed | jq .`) is intentionally excluded from this task list — it requires live infrastructure and is run manually after deployment
- `checkQueues()` shares one IORedis connection across four Queue instances because `getJobCounts()` uses only non-blocking Redis commands — this is safe and consistent with the free-tier-protection rule (no persistent connections, no background polling)
- No new npm dependencies are introduced; `fast-check` must already be present or added to `devDependencies` only

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.2", "5.2", "6.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "6.4", "9.1", "9.2", "9.3", "9.4"] },
    { "id": 4, "tasks": ["9.5", "8.1"] },
    { "id": 5, "tasks": ["10.1"] }
  ]
}
```
