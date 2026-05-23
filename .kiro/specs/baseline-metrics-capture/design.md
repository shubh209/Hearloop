# Design Document — Baseline Metrics Capture

## Overview

This feature produces two read-only artefacts:

1. **`scripts/capture-metrics.sh`** — a portable Bash script that runs SQL queries via `psql` and an optional `curl` call against the Dashboard API, printing labelled results to stdout. It is idempotent, supports a `--dry-run` flag, and emits a pre-formatted Markdown block ready to paste into `context/METRICS.md`.
2. **A populated entry in `context/METRICS.md`** — a new `## Baseline Pipeline Metrics — [Date]` section that fulfils the existing "Baselines To Capture Next Session" placeholder table, using Session 7 observed values as fallback where live data is unavailable.

No new API endpoints, database migrations, TypeScript files, or npm packages are introduced. The script is strictly read-only — it makes no writes to the database, filesystem, or any external system.

---

## Architecture

The feature is a single shell script. There is no application code, no build step, and no runtime dependency on the Node.js/TypeScript stack.

```
scripts/capture-metrics.sh
│
├── Startup
│   ├── --dry-run check (skip all I/O if set)
│   ├── Source .env if present
│   ├── Validate DATABASE_URL
│   ├── Validate psql on PATH
│   ├── Validate curl on PATH
│   └── Warn if jq not on PATH (non-fatal)
│
├── Section 1: === Pipeline Latency ===
│   └── psql query → AVG / MIN / MAX / P95 + row count
│
├── Section 2: === Cost Per Session ===
│   └── psql query → AVG/MIN/MAX cost + token breakdown + model breakdown
│
├── Section 3: === Webhook Success Rate ===
│   └── psql query → success rate % + per-status counts
│
├── Section 4: === Session Completion Rate ===
│   └── psql query → completion rate % + per-status counts
│
├── Section 5: === Dashboard API Verification ===
│   └── curl GET /v1/partners/:id/dashboard | jq (skipped if PARTNER_ID/API_KEY unset)
│
└── Markdown Block
    └── Pre-formatted METRICS.md entry printed to stdout
```

The script communicates with one external system: the Neon PostgreSQL instance via `psql` using `DATABASE_URL`. The Dashboard API curl call is optional and gated on `PARTNER_ID` and `API_KEY` being set.

---

## Components and Interfaces

### `scripts/capture-metrics.sh`

**Single responsibility:** Run all metrics queries and print results to stdout.

#### Environment Variables

| Variable | Required | Source | Purpose |
|---|---|---|---|
| `DATABASE_URL` | Yes | `.env` or shell | `psql` connection string to Neon |
| `PARTNER_ID` | No | `.env` or shell | Partner UUID for Dashboard API curl |
| `API_KEY` | No | `.env` or shell | Bearer token for Dashboard API curl |

#### CLI Interface

```
Usage: ./scripts/capture-metrics.sh [--dry-run]

  --dry-run   Print all SQL queries and curl commands without executing them.
              Prerequisite checks (DATABASE_URL, psql, curl) are skipped.
```

#### `.env` Sourcing

The script sources `.env` from the project root if the file exists, using a path relative to the script's own location (`SCRIPT_DIR`). This avoids requiring the caller to `cd` to the project root first.

```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  # shellcheck source=/dev/null
  set -a
  source "$ENV_FILE"
  set +a
fi
```

`set -a` / `set +a` exports all variables sourced from `.env` into the environment so `psql` picks up `DATABASE_URL` automatically.

#### Dependency Validation

Performed after `.env` sourcing, before any queries. In `--dry-run` mode these checks are skipped entirely.

```bash
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL is not set. Export it or add it to .env" >&2
  exit 1
fi

if ! command -v psql &>/dev/null; then
  echo "ERROR: psql is required but not found on PATH" >&2
  exit 1
fi

if ! command -v curl &>/dev/null; then
  echo "ERROR: curl is required but not found on PATH" >&2
  exit 1
fi

JQ_AVAILABLE=true
if ! command -v jq &>/dev/null; then
  echo "WARNING: jq not found — Dashboard API output will not be parsed" >&2
  JQ_AVAILABLE=false
fi
```

#### `psql` Invocation Pattern

All queries use `--no-psqlrc --tuples-only` to suppress banners, column headers, and row-count footers, producing clean machine-parseable output.

```bash
psql "$DATABASE_URL" --no-psqlrc --tuples-only -c "<SQL>"
```

#### Section Header Format

```
=== Pipeline Latency ===
=== Cost Per Session ===
=== Webhook Success Rate ===
=== Session Completion Rate ===
=== Dashboard API Verification ===
=== METRICS.md Block ===
```

#### `--dry-run` Mode

When `$1 == "--dry-run"`, the script sets `DRY_RUN=true` and replaces every `psql` and `curl` invocation with a `[DRY RUN]`-prefixed echo of the command that would have run. No connections are made.

---

## Data Models

No new data models are introduced. The script reads from three existing tables:

### `sessions` (read-only)

Relevant columns:
- `status` — filtered to `'completed'` for latency and completion rate queries
- `processing_started_at` — `TIMESTAMPTZ`, nullable
- `processing_completed_at` — `TIMESTAMPTZ`, nullable

### `analyses` (read-only)

Relevant columns:
- `input_tokens` — `INTEGER`, nullable
- `output_tokens` — `INTEGER`, nullable
- `model_used` — `TEXT`, nullable; filtered to `IS NOT NULL`

### `webhook_deliveries` (read-only)

Relevant columns:
- `status` — `'pending' | 'delivered' | 'failed' | 'dead'`

---

## SQL Queries

### Section 1 — Pipeline Latency

**Latency stats + sample size:**

```sql
SELECT
  ROUND(AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000)::numeric, 0) AS avg_ms,
  ROUND(MIN(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000)::numeric, 0) AS min_ms,
  ROUND(MAX(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000)::numeric, 0) AS max_ms,
  ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000
  )::numeric, 0) AS p95_ms,
  COUNT(*) AS sample_size
FROM sessions
WHERE status = 'completed'
  AND processing_started_at IS NOT NULL
  AND processing_completed_at IS NOT NULL
  AND processing_completed_at >= processing_started_at;
```

**Zero-row guard:** If `sample_size = 0`, print `[SKIP] Pipeline Latency: no completed sessions with timing data found` and continue.

### Section 2 — Cost Per Session

**Cost stats:**

```sql
SELECT
  TO_CHAR(AVG((input_tokens * 0.00000006) + (output_tokens * 0.00000024)), 'FM0.0000000') AS avg_cost_usd,
  TO_CHAR(MIN((input_tokens * 0.00000006) + (output_tokens * 0.00000024)), 'FM0.0000000') AS min_cost_usd,
  TO_CHAR(MAX((input_tokens * 0.00000006) + (output_tokens * 0.00000024)), 'FM0.0000000') AS max_cost_usd,
  COUNT(*) AS sample_size
FROM analyses
WHERE model_used IS NOT NULL;
```

**Token breakdown:**

```sql
SELECT
  ROUND(AVG(input_tokens)::numeric, 0)  AS avg_input_tokens,
  ROUND(AVG(output_tokens)::numeric, 0) AS avg_output_tokens
FROM analyses
WHERE model_used IS NOT NULL;
```

**Model breakdown:**

```sql
SELECT model_used, COUNT(*) AS session_count
FROM analyses
WHERE model_used IS NOT NULL
GROUP BY model_used
ORDER BY session_count DESC;
```

**Zero-row guard:** If `sample_size = 0`, print `[SKIP] Cost Per Session: no analyses rows with model_used found` and continue.

### Section 3 — Webhook Success Rate

**Success rate:**

```sql
SELECT
  ROUND(
    COUNT(*) FILTER (WHERE status = 'delivered') * 100.0
    / NULLIF(COUNT(*) FILTER (WHERE status != 'pending'), 0),
    1
  ) AS success_rate_pct,
  COUNT(*) FILTER (WHERE status != 'pending') AS total_attempted
FROM webhook_deliveries;
```

**Per-status breakdown:**

```sql
SELECT status, COUNT(*) AS count
FROM webhook_deliveries
GROUP BY status
ORDER BY status;
```

**Zero-row guard:** If `total_attempted = 0`, print `[SKIP] Webhook Success Rate: no completed delivery attempts found` and continue.

### Section 4 — Session Completion Rate

**Completion rate:**

```sql
SELECT
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed') * 100.0
    / NULLIF(COUNT(*), 0),
    1
  ) AS completion_rate_pct,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
  COUNT(*) AS total_count
FROM sessions;
```

**Per-status breakdown:**

```sql
SELECT status, COUNT(*) AS count
FROM sessions
GROUP BY status
ORDER BY status;
```

**Zero-row guard:** If `total_count = 0`, print `[SKIP] Session Completion Rate: no sessions found` and continue.

### Section 5 — Dashboard API Verification

Executed only when `PARTNER_ID` and `API_KEY` are both set. The Dashboard API computes metrics over the last 100 sessions only; SQL queries above run over all sessions — minor discrepancies are expected and normal.

```bash
# With jq available:
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  "http://18.223.189.193:3001/v1/partners/$PARTNER_ID/dashboard" \
  | jq '.stats.metrics, .stats.completionRate, .stats.total'

# Without jq (raw JSON):
curl -s \
  -H "Authorization: Bearer $API_KEY" \
  "http://18.223.189.193:3001/v1/partners/$PARTNER_ID/dashboard"
```

The script prints a note: `NOTE: Dashboard API covers last 100 sessions only; SQL queries above cover all sessions.`

---

## Script Flow (Pseudocode)

```
1. Parse args → set DRY_RUN flag
2. Source .env if present
3. If not DRY_RUN:
     Validate DATABASE_URL, psql, curl; warn on missing jq
4. For each section [Latency, Cost, Webhook, Completion, Dashboard]:
     Print "=== <Section Name> ==="
     If DRY_RUN:
       Print "[DRY RUN] psql $DATABASE_URL --no-psqlrc --tuples-only -c '<SQL>'"
     Else:
       Run psql query
       Check for zero-row condition → print [SKIP] or print results
5. Print "=== METRICS.md Block ==="
   If DRY_RUN:
     Print template with placeholder values
   Else:
     Print pre-formatted Markdown block with captured values
```

---

## METRICS.md Entry Format

The script emits a Markdown block at the end of its stdout. The entry follows the exact before/after/delta/how-measured format used by all prior entries in `context/METRICS.md`.

```markdown
## Baseline Pipeline Metrics — [Date]

> First measurement. No prior baseline existed for pipeline performance metrics.

### Pipeline Latency
- **Before:** N/A — first measurement
- **After:** AVG ~[X] ms | MIN [Y] ms | MAX [Z] ms | P95 [W] ms (n=[N] completed sessions)
- **Delta:** N/A — first measurement
- **How measured:**
  ```sql
  SELECT ROUND(AVG(...)*1000,0) AS avg_ms, ... FROM sessions
  WHERE status='completed' AND processing_started_at IS NOT NULL ...
  ```
  Dashboard API cross-check: `curl -H "Authorization: Bearer $API_KEY" .../v1/partners/$PARTNER_ID/dashboard | jq '.stats.metrics'`

### Cost Per Session (Bedrock Nova Lite)
- **Before:** N/A — first measurement
- **After:** AVG ~$[X] | MIN $[Y] | MAX $[Z] (AVG [A] input tokens, [B] output tokens)
- **Pricing basis:** $0.06/1M input tokens, $0.24/1M output tokens (Nova Lite)
- **Model:** [model_used value(s)]
- **Delta:** N/A — first measurement
- **How measured:**
  ```sql
  SELECT TO_CHAR(AVG((input_tokens*0.00000006)+(output_tokens*0.00000024)),'FM0.0000000')
  FROM analyses WHERE model_used IS NOT NULL
  ```

### Webhook Delivery Success Rate
- **Before:** N/A — first measurement
- **After:** [X]% ([D] delivered / [T] total attempted) | delivered: [D], failed: [F], dead: [X], pending: [P]
- **Delta:** N/A — first measurement
- **How measured:**
  ```sql
  SELECT ROUND(COUNT(*) FILTER (WHERE status='delivered')*100.0
    / NULLIF(COUNT(*) FILTER (WHERE status!='pending'),0),1)
  FROM webhook_deliveries
  ```

### Session Completion Rate
- **Before:** N/A — first measurement
- **After:** [X]% ([C] completed / [T] total) | Status breakdown: [per-status counts]
- **Delta:** N/A — first measurement
- **How measured:**
  ```sql
  SELECT ROUND(COUNT(*) FILTER (WHERE status='completed')*100.0/NULLIF(COUNT(*),0),1)
  FROM sessions
  ```

### Frontend Performance (Manual — Out of Scope for Script)
- **Dashboard Load Time:** Measure via Browser DevTools → Network → time to first data paint
- **Vercel First Load JS (dashboard):** Run `next build` and record the dashboard route bundle size
- **Target:** Load time < 1s, First Load JS < 120 kB
- **Note:** These metrics are not automated by `scripts/capture-metrics.sh` and must be recorded manually.
```

**Session 7 fallback values** (used when a section returns zero rows):
- Pipeline Latency: `~1,200 ms` (Session 7 manual observation — re-run script to confirm)
- Cost Per Session: `~$0.0000295` (215 input tokens × $0.06/1M + 72 output tokens × $0.24/1M — Session 7 manual observation)
- Webhook Success Rate: `unknown — no deliveries recorded`
- Session Completion Rate: `unknown — insufficient data`

---

## Error Handling

| Condition | Behaviour |
|---|---|
| `DATABASE_URL` not set | Print error to stderr, exit 1 |
| `psql` not on PATH | Print error to stderr, exit 1 |
| `curl` not on PATH | Print error to stderr, exit 1 |
| `jq` not on PATH | Print warning to stderr, skip jq pipe, continue |
| `PARTNER_ID` or `API_KEY` not set | Print `[SKIP] Dashboard API check: set PARTNER_ID and API_KEY to enable`, continue |
| Query returns zero rows (latency) | Print `[SKIP] Pipeline Latency: no completed sessions with timing data found`, continue |
| Query returns zero rows (cost) | Print `[SKIP] Cost Per Session: no analyses rows with model_used found`, continue |
| `total_attempted = 0` (webhook) | Print `[SKIP] Webhook Success Rate: no completed delivery attempts found`, continue |
| `total_count = 0` (sessions) | Print `[SKIP] Session Completion Rate: no sessions found`, continue |
| `psql` exits non-zero (DB connection failure) | Print `ERROR: database connection failed` to stderr, exit 1 |
| `curl` returns non-200 | Print raw response to stdout with a `[WARN] Dashboard API returned non-200` prefix, continue |

The script uses `set -euo pipefail` at the top. Individual `psql` calls are wrapped in a helper function that captures the exit code and handles the DB connection failure case explicitly, rather than letting `set -e` terminate the script mid-run on a transient query error.

---

## Testing Strategy

Property-based testing is **not applicable** to this feature. The two deliverables are a shell script and a Markdown documentation file. The script contains no pure functions, no data transformation logic, and no input/output behaviour that varies meaningfully across a large input space. It is a thin orchestration layer over `psql` and `curl`.

**Appropriate testing approach:**

### Manual smoke tests (run once after implementation)

1. **Dry-run check** — `./scripts/capture-metrics.sh --dry-run` should print all SQL queries and curl commands prefixed with `[DRY RUN]` without connecting to anything.
2. **Missing dependency check** — temporarily rename `psql` or unset `DATABASE_URL`, verify the correct error message and exit code 1.
3. **Missing jq check** — verify the script continues with a warning rather than exiting.
4. **Missing PARTNER_ID/API_KEY** — verify the Dashboard API section is skipped with the correct message.
5. **Live run** — `./scripts/capture-metrics.sh` against the Neon instance, verify all four metric sections print results and the Markdown block is emitted at the end.
6. **Idempotency** — run the script twice in succession, verify stdout is identical.

### SQL query validation

Each SQL query should be run directly against Neon via `psql` before embedding in the script to confirm:
- Correct column names match `db.ts` table definitions
- `PERCENTILE_CONT` is available (PostgreSQL 16 ✓)
- `NULLIF` guards prevent division-by-zero on empty tables
- `TO_CHAR` format string produces 7 decimal places for cost values

### METRICS.md review

After running the script and pasting the output block into `context/METRICS.md`:
- Verify the new section appears after the existing "Baselines To Capture Next Session" table
- Verify no existing metric entries are duplicated
- Verify the before/after/delta/how-measured format matches all prior entries
- Verify the Frontend Performance section notes manual measurement as out of scope

### Out of scope

- Unit tests for the shell script (no test framework; smoke tests are sufficient for a read-only script)
- Automated CI integration (the script requires a live `DATABASE_URL` and is not suitable for CI)
- Frontend performance automation (`Dashboard Load Time` and `Vercel First Load JS` are manual-only per Requirement 8)
