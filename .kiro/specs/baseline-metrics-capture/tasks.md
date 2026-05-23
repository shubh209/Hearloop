# Implementation Plan: Baseline Metrics Capture

## Overview

Implement `scripts/capture-metrics.sh` — a portable, idempotent Bash script that queries Neon via `psql`, optionally calls the Dashboard API via `curl`, and emits a pre-formatted Markdown block ready to paste into `context/METRICS.md`. Then populate `context/METRICS.md` with the captured (or Session 7 fallback) values.

No TypeScript, no npm packages, no DB migrations. Two files only.

## Tasks

- [ ] 1. Create script scaffold
  - Create `scripts/capture-metrics.sh` with shebang `#!/usr/bin/env bash` and `set -euo pipefail`
  - Add `--dry-run` argument parsing: if `$1 == "--dry-run"` set `DRY_RUN=true`; if `--dry-run` appears elsewhere print `ERROR: unrecognised argument. Usage: capture-metrics.sh [--dry-run]` to stderr and exit 1
  - Source `.env` from project root using `SCRIPT_DIR`-relative path with `set -a` / `set +a` pattern
  - Add dependency validation block (skipped in `--dry-run` mode): fatal checks for `DATABASE_URL`, `psql`, `curl`; non-fatal warning for `jq` that sets `JQ_AVAILABLE=false`
  - Define a `run_psql` helper function that wraps `psql "$DATABASE_URL" --no-psqlrc --tuples-only -c "<SQL>"`, captures exit code, and prints `ERROR: database connection failed` to stderr + exits 1 on non-zero
  - Make the file executable: `chmod +x scripts/capture-metrics.sh`
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8_

- [ ] 2. Implement Pipeline Latency section
  - Depends on: 1
  - [ ] 2.1 Write the Pipeline Latency section
    - Print `=== Pipeline Latency ===` header
    - In `--dry-run` mode: print `[DRY RUN]`-prefixed SQL for the Pipeline Latency query and skip execution
    - In live mode: run the Pipeline Latency stats query (AVG / MIN / MAX / P95 / sample_size) via `run_psql`
    - Check `sample_size`; if 0 print `[SKIP] Pipeline Latency: no completed sessions with timing data found` and continue
    - Otherwise print AVG, MIN, MAX, P95 in ms and `Sample size: <N> sessions` on the following line
    - SQL: `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000)::numeric, 0) AS avg_ms, ROUND(MIN(...)*1000::numeric,0) AS min_ms, ROUND(MAX(...)*1000::numeric,0) AS max_ms, ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000)::numeric, 0) AS p95_ms, COUNT(*) AS sample_size FROM sessions WHERE status = 'completed' AND processing_started_at IS NOT NULL AND processing_completed_at IS NOT NULL AND processing_completed_at >= processing_started_at`
    - _Requirements: 1.1, 1.2, 1.3, 6.7_

- [ ] 3. Implement Cost Per Session section
  - Depends on: 1
  - [ ] 3.1 Write the Cost Per Session section
    - Print `=== Cost Per Session ===` header
    - In `--dry-run` mode: print `[DRY RUN]` prefix for each of the three cost queries (cost stats, token breakdown, model breakdown)
    - In live mode: run all three queries via `run_psql`
    - Check `sample_size` from the cost stats query; if 0 print `[SKIP] Cost Per Session: no analyses rows with model_used found` and continue
    - Otherwise print AVG/MIN/MAX cost in USD (7 decimal places via `TO_CHAR(..., 'FM0.0000000')`), AVG input/output tokens, and per-model row counts
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 6.7_

- [ ] 4. Implement Webhook Success Rate section
  - Depends on: 1
  - [ ] 4.1 Write the Webhook Success Rate section
    - Print `=== Webhook Success Rate ===` header
    - In `--dry-run` mode: print `[DRY RUN]` prefix for both webhook queries (success rate, per-status breakdown)
    - In live mode: run both queries via `run_psql`
    - Check `total_attempted`; if 0 print `[SKIP] Webhook Success Rate: no completed delivery attempts found` and continue
    - Otherwise print success rate percentage and four-status breakdown (delivered, failed, dead, pending)
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 6.7_

- [ ] 5. Implement Session Completion Rate section
  - Depends on: 1
  - [ ] 5.1 Write the Session Completion Rate section
    - Print `=== Session Completion Rate ===` header
    - In `--dry-run` mode: print `[DRY RUN]` prefix for both session queries (completion rate, per-status breakdown)
    - In live mode: run both queries via `run_psql`
    - Check `total_count`; if 0 print `[SKIP] Session Completion Rate: no sessions found` and continue
    - Otherwise print completion rate %, completed count, total count, and per-status breakdown across all 9 statuses
    - _Requirements: 4.1, 4.2, 4.3, 6.7_

- [ ] 6. Implement Dashboard API Verification section
  - Depends on: 1
  - [ ] 6.1 Write the Dashboard API Verification section
    - Print `=== Dashboard API Verification ===` header
    - If `PARTNER_ID` or `API_KEY` are unset, print `[SKIP] Dashboard API check: set PARTNER_ID and API_KEY to enable` and continue
    - In `--dry-run` mode: print `[DRY RUN]` prefix for the curl command
    - In live mode: execute `curl -s -H "Authorization: Bearer $API_KEY" "http://18.223.189.193:3001/v1/partners/$PARTNER_ID/dashboard"` and pipe through `jq` if `JQ_AVAILABLE=true`, otherwise print raw JSON
    - Capture HTTP status; if non-200 print `[WARN] Dashboard API returned HTTP <status> — skipping API comparison` to stderr and continue
    - Print `NOTE: Dashboard API covers last 100 sessions only; SQL queries above cover all sessions.`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 6.7_

- [ ] 7. Implement METRICS.md Markdown block output
  - Depends on: 2, 3, 4, 5, 6
  - [ ] 7.1 Write the METRICS.md block emitter
    - Print `=== METRICS.md Block ===` header
    - In `--dry-run` mode: print the full Markdown template with placeholder values
    - In live mode: emit the pre-formatted Markdown block substituting captured values; use Session 7 fallback values (`~1,200 ms` latency, `~$0.0000295` cost) for any section that returned a `[SKIP]`, annotated with `(Session 7 manual observation — re-run script to confirm)`
    - Include the Frontend Performance sub-section noting manual measurement is out of scope for the script
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

- [ ] 8. Run smoke tests and validate
  - Depends on: 7
  - [ ] 8.1 Dry-run smoke test
    - Run `./scripts/capture-metrics.sh --dry-run`
    - Verify all five sections print `[DRY RUN]`-prefixed SQL and curl commands
    - Verify no psql or curl connections are made and exit code is 0
    - _Requirements: 6.8_
  - [ ]* 8.2 Dependency validation smoke tests
    - Temporarily unset `DATABASE_URL` and verify `ERROR: DATABASE_URL is not set. Export it or add it to .env` on stderr + exit 1
    - Temporarily shadow `psql` with a missing binary and verify `ERROR: psql is required but not found on PATH` on stderr + exit 1
    - Temporarily shadow `curl` and verify `ERROR: curl is required but not found on PATH` on stderr + exit 1
    - Temporarily shadow `jq` and verify `WARNING: jq not found — Dashboard API output will not be parsed` on stderr and script continues
    - _Requirements: 6.3, 6.4, 6.5, 6.6_
  - [ ]* 8.3 Skip-guard smoke tests
    - Unset `PARTNER_ID` and `API_KEY`, verify `[SKIP] Dashboard API check: set PARTNER_ID and API_KEY to enable`
    - _Requirements: 5.4_
  - [ ]* 8.4 Live run against Neon
    - Run `./scripts/capture-metrics.sh` with `DATABASE_URL` set from `.env`
    - Verify all four metric sections print results (or `[SKIP]` with correct message if table is empty)
    - Verify the `=== METRICS.md Block ===` section is emitted at the end
    - _Requirements: 1.1, 2.1, 3.1, 4.1, 6.7_
  - [ ]* 8.5 Idempotency check
    - Run the script twice in succession and diff stdout
    - Verify output is identical (no timestamps, no random values, no side effects)
    - _Requirements: 6.7_

- [ ] 9. Checkpoint — Ensure smoke tests pass, ask the user if questions arise.
  - Depends on: 8

- [ ] 10. Populate context/METRICS.md
  - Depends on: 9
  - [ ] 10.1 Insert the Baseline Pipeline Metrics entry into context/METRICS.md
    - Copy the Markdown block emitted by the script (or use Session 7 fallback values if live run was not possible)
    - Insert a new `## Baseline Pipeline Metrics — May 2026` section after the existing `## Baselines To Capture Next Session` table
    - Include `###` sub-sections for Pipeline Latency, Cost Per Session, Webhook Delivery Success Rate, and Session Completion Rate — each with `- **Before:**`, `- **After:**`, `- **Delta:**`, and `- **How measured:**` fields
    - Include the Frontend Performance sub-section noting Dashboard Load Time and Vercel First Load JS are manual-only (out of scope for the script)
    - Verify no existing entries are duplicated (infrastructure cost, CI/CD timing, Redis quota metrics already have their own sections)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [ ] 11. Final checkpoint — Ensure all tasks complete, ask the user if questions arise.
  - Depends on: 10
