# Requirements Document

## Introduction

This feature adds a `GET /health/detailed` endpoint to the Hearloop API that returns real-time system status for all critical infrastructure components. The endpoint is public (no auth required) and is intended for load balancer health checks, on-call monitoring, and portfolio observability demonstrations.

The endpoint checks four subsystems: PostgreSQL via a `SELECT 1` ping, Redis via an `PING` command, BullMQ queue depths for all four active queues, and a 24-hour pipeline completion summary derived from the `sessions` table. All checks run concurrently. If any individual check fails, that check reports an error and the top-level status becomes `"degraded"` — the endpoint always returns HTTP 200 so load balancers never pull the instance due to a single subsystem hiccup.

No new infrastructure is introduced. The endpoint reuses the existing `lib/db.ts` Kysely client and the existing `lib/queue.ts` IORedis/BullMQ connections. The implementation lives in a single new file: `apps/api/src/routes/health.ts`.

## Glossary

- **Health_Endpoint**: The `GET /health/detailed` Fastify route handler defined in `apps/api/src/routes/health.ts`
- **DB_Check**: The subsystem check that issues a `SELECT 1` query against the Neon PostgreSQL database and measures round-trip latency
- **Redis_Check**: The subsystem check that issues a `PING` command via ioredis and measures round-trip latency
- **Queue_Check**: The subsystem check that calls `getJobCounts()` on each of the four BullMQ queues (validate, transcribe, analyze, webhooks) to retrieve current waiting job counts
- **Pipeline_Check**: The subsystem check that queries the `sessions` table for the last 24 hours to compute completion rate, average processing latency, and failed session count
- **Check_Result**: A JSON object representing the outcome of a single subsystem check — either `{ "status": "ok", ... }` with check-specific fields, or `{ "status": "error", "error": "<message>" }` if the check threw
- **Overall_Status**: The top-level `status` field in the response — `"healthy"` when all checks pass, `"degraded"` when one or more checks return `"error"`
- **Latency_Ms**: Round-trip time in milliseconds measured using `Date.now()` before and after the check operation

---

## Requirements

### Requirement 1: Endpoint Registration and Response Contract

**User Story:** As a platform operator, I want a public `GET /health/detailed` endpoint, so that I can monitor real system status from load balancers and dashboards without requiring authentication.

#### Acceptance Criteria

1. THE Health_Endpoint SHALL be registered at the path `GET /health/detailed` with no authentication pre-handler.
2. THE Health_Endpoint SHALL always return HTTP status 200, regardless of the outcome of any individual subsystem check.
3. WHEN all subsystem checks succeed, THE Health_Endpoint SHALL return a response body with `"status": "healthy"`.
4. WHEN one or more subsystem checks return a Check_Result with `"status": "error"`, THE Health_Endpoint SHALL return a response body with `"status": "degraded"`, regardless of whether the failing check is considered critical or non-critical.
5. THE Health_Endpoint SHALL return a response body conforming to the following shape:
   ```json
   {
     "status": "healthy" | "degraded",
     "checks": {
       "database": <Check_Result>,
       "redis": <Check_Result>,
       "queueDepths": { "validate": number, "transcribe": number, "analyze": number, "webhooks": number },
       "pipeline": <Check_Result>
     }
   }
   ```
6. THE Health_Endpoint SHALL run all four subsystem checks concurrently using `Promise.allSettled`.

---

### Requirement 2: Database Check

**User Story:** As a platform operator, I want the health endpoint to verify database connectivity, so that I can detect Neon cold-start delays or connection failures before they affect user-facing requests.

#### Acceptance Criteria

1. WHEN the DB_Check runs, THE Health_Endpoint SHALL execute a `SELECT 1` query using the existing Kysely `db` client from `lib/db.ts`.
2. WHEN the `SELECT 1` query succeeds, THE Health_Endpoint SHALL include `{ "status": "ok", "latencyMs": <number> }` as the `checks.database` field.
3. THE Health_Endpoint SHALL measure Latency_Ms for the DB_Check as the elapsed time from immediately before the query is issued to immediately after the result is received, including when the query throws an exception.
4. IF the `SELECT 1` query throws, THEN THE Health_Endpoint SHALL include `{ "status": "error", "error": "<error message>", "latencyMs": <number> }` as the `checks.database` field, where `latencyMs` is the elapsed time from query start to the moment the exception was thrown.

---

### Requirement 3: Redis Check

**User Story:** As a platform operator, I want the health endpoint to verify Redis connectivity, so that I can detect Upstash connection failures that would stall the BullMQ job pipeline.

#### Acceptance Criteria

1. WHEN the Redis_Check runs, THE Health_Endpoint SHALL issue a `PING` command using a short-lived IORedis connection created from `process.env.REDIS_URL`.
2. WHEN the `PING` command returns `"PONG"` and the connection disconnects successfully, THE Health_Endpoint SHALL include `{ "status": "ok", "latencyMs": <number> }` as the `checks.redis` field. WHEN `latencyMs` is zero, THE Health_Endpoint SHALL re-issue the `PING` once and use the second measurement.
3. THE Health_Endpoint SHALL measure Latency_Ms for the Redis_Check as the elapsed time from immediately before the `PING` is issued to immediately after the response is received.
4. THE Health_Endpoint SHALL disconnect the short-lived IORedis connection immediately after the check completes, whether the check succeeded or failed. IF the disconnection itself throws, THEN THE Health_Endpoint SHALL include `{ "status": "error", "error": "<disconnect error message>" }` as the `checks.redis` field.
5. IF the `PING` command throws, does not return `"PONG"`, or the connection fails to disconnect, THEN THE Health_Endpoint SHALL include `{ "status": "error", "error": "<error message>" }` as the `checks.redis` field.

---

### Requirement 4: Queue Depth Check

**User Story:** As a platform operator, I want the health endpoint to report current BullMQ queue depths, so that I can detect job backlogs that indicate pipeline slowdowns.

#### Acceptance Criteria

1. WHEN the Queue_Check runs, THE Health_Endpoint SHALL call `getJobCounts()` on each of the four BullMQ queues: `hearloop-validate`, `hearloop-transcribe`, `hearloop-analyze`, and `hearloop-webhooks`.
2. THE Health_Endpoint SHALL use short-lived `Queue` instances for the Queue_Check, following the same pattern as the `enqueue` helper in `lib/queue.ts` (create, use, close).
3. WHEN all four `getJobCounts()` calls succeed, THE Health_Endpoint SHALL include `{ "validate": number, "transcribe": number, "analyze": number, "webhooks": number }` as the `checks.queueDepths` field, where each value is the `waiting` count from `getJobCounts()`.
4. IF any `getJobCounts()` call throws, THEN THE Health_Endpoint SHALL include `{ "status": "error", "error": "<error message>" }` as the `checks.queueDepths` field.

---

### Requirement 5: Pipeline Statistics Check

**User Story:** As a platform operator, I want the health endpoint to report 24-hour pipeline statistics, so that I can assess processing health and catch elevated failure rates at a glance.

#### Acceptance Criteria

1. WHEN the Pipeline_Check runs, THE Health_Endpoint SHALL query the `sessions` table for all sessions where `created_at >= NOW() - INTERVAL '24 hours'`.
2. WHEN the Pipeline_Check query succeeds, THE Health_Endpoint SHALL compute `completionRate24h` as the count of sessions with `status = 'completed'` divided by the total count of sessions in the 24-hour window, rounded to two decimal places. WHEN the total count is zero, THE Health_Endpoint SHALL return `completionRate24h` as `1.0`.
3. WHEN the Pipeline_Check query succeeds, THE Health_Endpoint SHALL compute `avgLatencyMs` as the average of `(processing_completed_at - processing_started_at)` in milliseconds for sessions with `status = 'completed'` and both timestamps non-null. WHEN no completed sessions with both timestamps exist, THE Health_Endpoint SHALL return `avgLatencyMs` as `null`.
4. WHEN the Pipeline_Check query succeeds, THE Health_Endpoint SHALL compute `failedLast24h` as the count of sessions with `status = 'failed'` in the 24-hour window.
5. WHEN the Pipeline_Check query succeeds, THE Health_Endpoint SHALL include `{ "status": "ok", "completionRate24h": number, "avgLatencyMs": number | null, "failedLast24h": number }` as the `checks.pipeline` field.
6. IF the Pipeline_Check query throws, THEN THE Health_Endpoint SHALL include `{ "status": "error", "error": "<error message>" }` as the `checks.pipeline` field.

---

### Requirement 6: Error Isolation and Resilience

**User Story:** As a platform operator, I want individual check failures to be isolated, so that a single subsystem outage does not prevent the endpoint from reporting the status of the remaining healthy subsystems.

#### Acceptance Criteria

1. WHEN any individual subsystem check throws an unhandled exception, THE Health_Endpoint SHALL catch that exception, record its message in the corresponding Check_Result `error` field, and continue returning results for all other checks.
2. WHEN one or more checks produce a Check_Result with `"status": "error"`, THE Health_Endpoint SHALL set Overall_Status to `"degraded"` and return HTTP 200.
3. THE Health_Endpoint SHALL complete and respond within 10 seconds under normal operating conditions; IF any individual check has not resolved within 10 seconds, THEN THE Health_Endpoint SHALL treat that check as failed with `{ "status": "error", "error": "timeout" }`.

---

### Requirement 7: Implementation Constraints

**User Story:** As a developer, I want the health endpoint to follow the project's single-responsibility and free-tier-protection rules, so that the implementation stays maintainable and does not introduce new infrastructure costs.

#### Acceptance Criteria

1. THE Health_Endpoint SHALL be implemented entirely within a single new file `apps/api/src/routes/health.ts` and SHALL NOT add logic to any existing file other than registering the route plugin in `apps/api/src/index.ts`.
2. THE Health_Endpoint SHALL reuse the existing `db` export from `lib/db.ts` and SHALL NOT create a new database connection pool, even if the existing pool is unavailable.
3. THE Health_Endpoint SHALL create short-lived IORedis connections for the Redis_Check and Queue_Check and SHALL disconnect them immediately after each check, consistent with the pattern in `lib/queue.ts`.
4. THE Health_Endpoint SHALL NOT introduce any new npm dependencies beyond those already present in `apps/api/package.json`.
5. THE Health_Endpoint SHALL NOT start any background polling loop or scheduled job; all checks SHALL be performed on-demand per request.
