# Requirements Document

## Introduction

The Baseline Metrics Capture feature establishes portfolio-ready before/after numbers for the Hearloop pipeline. The pipeline is fully operational (validate → transcribe → analyze → webhook) and real completed sessions exist in Neon with populated `sentiment_label`, `topics`, `model_used`, `input_tokens`, `output_tokens`, `processing_started_at`, and `processing_completed_at`. This feature defines the SQL queries to extract latency, cost, and reliability metrics from live data, specifies what to record, and produces a repeatable script so the same queries can be re-run after future optimisations to show delta improvements.

The output is two artefacts: a reusable `scripts/capture-metrics.sh` script and a populated entry in `context/METRICS.md` that fulfils the "Baselines To Capture Next Session" table already present in that file. No new API endpoints or DB migrations are required.

## Glossary

- **Metrics_Script**: The shell script `scripts/capture-metrics.sh` that runs all SQL queries and curl commands to collect baseline numbers.
- **METRICS_File**: `context/METRICS.md` — the project's canonical before/after measurement log.
- **Baselines_Table**: The existing `## Baselines To Capture Next Session` table in `context/METRICS.md` that lists six placeholder rows: Pipeline Latency, Bedrock Cost Per Session, Webhook Delivery Success Rate, Session Completion Rate, Dashboard Load Time, and Vercel First Load JS.
- **Pipeline_Latency**: The wall-clock time between `sessions.processing_started_at` and `sessions.processing_completed_at` for sessions with `status = 'completed'`, expressed in milliseconds.
- **Cost_Per_Session**: The estimated Bedrock Nova Lite cost computed as `(input_tokens × 0.00000006) + (output_tokens × 0.00000024)` per `analyses` row, expressed in USD.
- **Webhook_Success_Rate**: The percentage of `webhook_deliveries` rows where `status = 'delivered'` out of all rows where `status != 'pending'`.
- **Session_Completion_Rate**: The percentage of `sessions` rows with `status = 'completed'` out of all rows.
- **Dashboard_API**: `GET /v1/partners/:id/dashboard` — the existing endpoint that returns `stats.metrics`, `stats.completionRate`, and `stats.total`.
- **Neon**: The serverless PostgreSQL 16 instance hosting the live Hearloop database, accessed via `DATABASE_URL`.
- **Nova_Lite**: AWS Bedrock Nova Lite — the primary AI classifier used by the pipeline, identified in `analyses.model_used`.
- **Dry_Run_Mode**: Script execution mode activated by the `--dry-run` flag that prints all SQL queries and curl commands to stdout without executing them against any external system.
- **First_Load_JS**: The total JavaScript bundle size for a given Next.js route as reported by `next build` output, measured in kilobytes.
- **Dashboard_Route**: `apps/web/app/dashboard/page.tsx` — the Next.js App Router page served at `/dashboard`.

---

## Requirements

### Requirement 1: Pipeline Latency Baseline

**User Story:** As a developer, I want to query average pipeline latency from real completed sessions, so that I have a concrete before number to quote in portfolio write-ups and to measure against after future optimisations.

#### Acceptance Criteria

1. THE Metrics_Script SHALL run a SQL query via `psql` that computes `AVG`, `MIN`, `MAX`, and `PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY ...)` of `EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000` in milliseconds from the `sessions` table, filtered to `status = 'completed'` and both timestamp columns non-null, and print the results under the header `=== Pipeline Latency ===`.
2. THE Metrics_Script SHALL print the row count used in the latency calculation on the line immediately following the stats line, labelled `Sample size: <N> sessions`.
3. IF the latency query returns zero rows, THEN THE Metrics_Script SHALL print the message `[SKIP] Pipeline Latency: no completed sessions with timing data found` to stdout and continue to the next section without exiting.
4. THE METRICS_File SHALL record the captured `AVG`, `MIN`, `MAX`, and P95 latency values in milliseconds rounded to one decimal place, the sample size, and the exact SQL query under a "How measured" field, following the format of existing entries in `context/METRICS.md`.

---

### Requirement 2: Cost Per Session Baseline

**User Story:** As a developer, I want to compute the average Bedrock Nova Lite cost per session from real token counts, so that I can quote a concrete per-session cost figure and demonstrate cost efficiency.

#### Acceptance Criteria

1. THE Metrics_Script SHALL include a SQL query that computes `AVG`, `MIN`, and `MAX` of `(input_tokens * 0.00000006) + (output_tokens * 0.00000024)` from the `analyses` table, filtered to rows where `model_used IS NOT NULL`.
2. THE Metrics_Script SHALL include a SQL query that returns `AVG(input_tokens)` and `AVG(output_tokens)` separately so the token breakdown is visible alongside the cost figure.
3. THE Metrics_Script SHALL include a SQL query that returns each distinct `model_used` value and its row count so the baseline is tied to a specific model version.
4. IF the cost query returns zero rows, THEN THE Metrics_Script SHALL print the message `[SKIP] Cost Per Session: no analyses rows with model_used found` to stdout and continue to the next section without exiting.
5. THE METRICS_File SHALL record the average cost per session in USD to 7 decimal places, the average input and output token counts as integers (rounded), and the model name under a "How measured" field.

---

### Requirement 3: Webhook Delivery Success Rate Baseline

**User Story:** As a developer, I want to measure webhook delivery reliability from the live `webhook_deliveries` table, so that I have a concrete success rate to demonstrate the HMAC + retry system's effectiveness.

#### Acceptance Criteria

1. THE Metrics_Script SHALL include a SQL query that computes the delivery success rate as `COUNT(*) FILTER (WHERE status = 'delivered') * 100.0 / NULLIF(COUNT(*) FILTER (WHERE status != 'pending'), 0)` from the `webhook_deliveries` table, returning the rate as a numeric percentage printed to stdout.
2. THE Metrics_Script SHALL include a SQL query that returns a row count for each of the four statuses — `delivered`, `failed`, `dead`, and `pending` — printed as four separate labelled values.
3. IF the `webhook_deliveries` table contains zero rows where `status != 'pending'`, THEN THE Metrics_Script SHALL print the message `[SKIP] Webhook Success Rate: no completed delivery attempts found` to stdout and continue to the next section without exiting.
4. WHEN the Metrics_Script produces a webhook result, THE METRICS_File SHALL record the success rate as a percentage rounded to one decimal place, the total non-pending attempt count, and the four-status breakdown.
5. IF the database is unreachable when the webhook query runs, THEN THE Metrics_Script SHALL print the message `ERROR: database connection failed` to stderr and exit with code 1.

---

### Requirement 4: Session Completion Rate Baseline

**User Story:** As a developer, I want to measure the end-to-end session completion rate across all sessions, so that I can demonstrate pipeline reliability as a portfolio metric.

#### Acceptance Criteria

1. THE Metrics_Script SHALL include a SQL query that returns the session completion rate, total session count, and completed session count from the `sessions` table, printed as three separate labelled values.
2. THE Metrics_Script SHALL include a SQL query that returns a row count grouped by all defined session statuses (`created`, `opened`, `recording`, `uploaded`, `submitted`, `processing`, `completed`, `failed`, `expired`) so the full state distribution is visible.
3. IF the `sessions` table contains zero rows, THEN THE Metrics_Script SHALL print the message `[SKIP] Session Completion Rate: no sessions found` to stdout and continue to the next section without exiting.
4. IF the database is unreachable when the session query runs, THEN THE Metrics_Script SHALL print the message `ERROR: database connection failed` to stderr and exit with code 1.
5. THE METRICS_File SHALL append a new entry recording the completion rate as a percentage rounded to one decimal place, the total session count, and the status breakdown.

---

### Requirement 5: Dashboard API Metrics Verification

**User Story:** As a developer, I want to verify that the Dashboard API's `stats.metrics` response matches the raw SQL numbers, so that I can confirm the API layer is computing metrics correctly and use the curl command as a repeatable check.

#### Acceptance Criteria

1. WHERE `PARTNER_ID` and `API_KEY` environment variables are set, THE Metrics_Script SHALL execute a `curl` command that calls `GET /v1/partners/:id/dashboard` with an `Authorization: Bearer $API_KEY` header and pipes the response through `jq` to extract `stats.metrics`, `stats.completionRate`, and `stats.total`.
2. WHEN the Dashboard_API returns `avgLatencyMs`, `totalInputTokens`, `totalOutputTokens`, and `estimatedCostUsd`, THE Metrics_Script SHALL print each API value on the line directly following its SQL-derived counterpart, labelled in the format `API <field>: <value>`, so discrepancies are visible without post-processing.
3. IF the Dashboard_API returns a non-200 HTTP status, THEN THE Metrics_Script SHALL print the message `[WARN] Dashboard API returned HTTP <status> — skipping API comparison` to stderr and continue to the next section without exiting.
4. WHERE `PARTNER_ID` or `API_KEY` are not set, THE Metrics_Script SHALL skip the Dashboard_API section and print the message `[SKIP] Dashboard API check: set PARTNER_ID and API_KEY to enable`.
5. THE METRICS_File SHALL record the Dashboard_API curl command under "How measured" for the Pipeline Latency and Cost Per Session entries so the check is repeatable without re-running SQL.

---

### Requirement 6: Repeatable Metrics Script

**User Story:** As a developer, I want a single script I can re-run after any future optimisation, so that capturing before/after deltas requires no manual query reconstruction.

#### Acceptance Criteria

1. THE Metrics_Script SHALL be located at `scripts/capture-metrics.sh`.
2. THE Metrics_Script SHALL have executable permissions (`chmod +x`) so it can be invoked directly without `bash` prefix.
3. IF `DATABASE_URL` is not set in the environment and a `.env` file is not present in the project root, THEN THE Metrics_Script SHALL print `ERROR: DATABASE_URL is not set. Export it or add it to .env` to stderr and exit with code 1.
4. IF `psql` is not found on `PATH`, THEN THE Metrics_Script SHALL print `ERROR: psql is required but not found on PATH` to stderr and exit with code 1.
5. IF `curl` is not found on `PATH`, THEN THE Metrics_Script SHALL print `ERROR: curl is required but not found on PATH` to stderr and exit with code 1.
6. IF `jq` is not found on `PATH`, THEN THE Metrics_Script SHALL print `WARNING: jq not found — Dashboard API output will not be parsed` to stderr and SHALL skip the jq pipe for the Dashboard API section rather than exiting.
7. THE Metrics_Script SHALL print each of the following six metric sections with a labelled header in the format `=== <Section Name> ===`: Session Counts, Pipeline Latency, Token Usage, Estimated Cost, Webhook Delivery, Dashboard API.
8. THE Metrics_Script SHALL be idempotent — running it multiple times SHALL produce the same stdout output for the same underlying data, with no INSERT, UPDATE, or DELETE operations issued against the database and no writes to the filesystem.
9. WHEN the `--dry-run` flag is passed as the first argument, THE Metrics_Script SHALL print every SQL query and curl command that would be executed to stdout, each prefixed with `[DRY RUN]`, without connecting to the database or making any network requests, and SHALL exit with code 0.
10. WHEN `--dry-run` is not the first argument but appears elsewhere in the argument list, THE Metrics_Script SHALL treat it as an unrecognised argument, print `ERROR: unrecognised argument. Usage: capture-metrics.sh [--dry-run]` to stderr, and exit with code 1.

---

### Requirement 7: METRICS.md Baseline Entry

**User Story:** As a developer, I want a complete, correctly formatted entry added to `context/METRICS.md` that fulfils the existing placeholder table, so that the baseline numbers are recorded in the project's canonical metrics log and are immediately quotable.

#### Acceptance Criteria

1. THE METRICS_File SHALL contain a new `##` section titled `## Baseline Pipeline Metrics — May 2026` with `###` sub-sections for each metric, inserted after the existing `## Baselines To Capture Next Session` table.
2. THE METRICS_File entry SHALL include one `###` sub-section for each of the four SQL-measurable rows in the Baselines_Table: Pipeline Latency, Cost Per Session, Webhook Delivery Success Rate, and Session Completion Rate. Each sub-section SHALL contain `- **Baseline:**`, `- **Target:**`, and `- **How measured:**` bullet fields.
3. WHEN actual query results are available, THE METRICS_File SHALL record real numbers in the `Baseline:` field.
4. IF actual results are not yet available, THEN THE METRICS_File SHALL record the Session 7 observed values (`~1.2s latency`, `215 input tokens`, `72 output tokens`, derived cost `~$0.0000295`) in the `Baseline:` field with the note `(Session 7 manual observation — re-run script to confirm)`.
5. THE METRICS_File entry SHALL include the exact SQL query from the Baselines_Table (or the Dashboard_API curl command) under the `- **How measured:**` field for each sub-section, using the single-line `- **How measured:** <query>` bullet pattern.
6. THE METRICS_File SHALL NOT duplicate entries for infrastructure cost (already in `## Infrastructure Migration`), CI/CD timing (already in `## CI/CD Pipeline`), or Redis quota metrics (already in `## Worker Duplication Quota Leak`).
7. THE METRICS_File entry SHALL note that Dashboard Load Time and Vercel First Load JS are out of scope for the Metrics_Script and must be measured manually via Browser DevTools and `next build` output respectively.

---

### Requirement 8: Frontend Performance Baseline

**User Story:** As a developer, I want to record dashboard load time and First Load JS bundle size before any frontend optimisation, so that I have concrete before numbers to quote when demonstrating performance improvements.

#### Acceptance Criteria

1. THE METRICS_File SHALL record the Dashboard_Route load time as the DOMContentLoaded time measured via Browser DevTools Network tab with no throttling applied, with the baseline value noted alongside a target of < 1 second. IF data fetching is deferred (dashboard renders a loading state before data arrives), THEN time-to-first-data-paint SHALL be recorded as an additional labelled sub-field.
2. THE METRICS_File SHALL record the First_Load_JS bundle size for the Dashboard_Route as reported in the `next build` output, with the baseline value noted alongside a target of < 120 kB.
3. WHEN measuring dashboard load time, THE METRICS_File SHALL note that the measurement was taken with no network throttling and with the app running in production mode (`next build` + `next start`), so the measurement is reproducible.
4. WHEN measuring First_Load_JS, THE METRICS_File SHALL record the exact `next build` command run and the complete `/dashboard` row from the per-route size table (route path, size, and First Load JS columns) under a "How measured" field.
5. THE METRICS_File entry for frontend performance SHALL follow the existing `## [Feature] — [Date]` section format with `Baseline:`, `Target:`, and `How measured:` fields; the `After:` and `Delta:` fields SHALL be left as `TBD — fill after optimisation`.
6. THE Metrics_Script SHALL NOT automate frontend performance measurement — dashboard load time and First_Load_JS are manual measurements recorded directly into METRICS_File by the developer.
