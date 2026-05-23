#!/usr/bin/env bash
set -euo pipefail

# ---------------------------------------------------------------------------
# capture-metrics.sh — Baseline metrics capture for Hearloop pipeline
# Usage: ./scripts/capture-metrics.sh [--dry-run]
# ---------------------------------------------------------------------------

# --- Argument parsing -------------------------------------------------------
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
  DRY_RUN=true
elif [ $# -gt 0 ]; then
  echo "ERROR: unrecognised argument. Usage: capture-metrics.sh [--dry-run]" >&2
  exit 1
fi

# Check for --dry-run anywhere else in the argument list (positions 2+)
for arg in "${@:2}"; do
  if [ "$arg" = "--dry-run" ]; then
    echo "ERROR: unrecognised argument. Usage: capture-metrics.sh [--dry-run]" >&2
    exit 1
  fi
done

# --- Source .env from project root ------------------------------------------
# Only export lines matching KEY=VALUE (ignores comments and freeform text)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/../.env"
if [ -f "$ENV_FILE" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip blank lines and comments
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    # Only process lines that look like IDENTIFIER=value
    if [[ "$line" =~ ^[A-Za-z_][A-Za-z0-9_]*= ]]; then
      export "$line"
    fi
  done < "$ENV_FILE"
fi

# --- Dependency validation (skipped in --dry-run mode) ----------------------
if [ "$DRY_RUN" = false ]; then
  if [ -z "${DATABASE_URL:-}" ]; then
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
fi

# --- Helper: run_psql -------------------------------------------------------
# Wraps psql with standard flags. Exits 1 with a clear error on connection failure.
# Usage: run_psql "<SQL query>"
run_psql() {
  local query="$1"
  local output
  local exit_code

  output=$(psql "$DATABASE_URL" --no-psqlrc --tuples-only -c "$query" 2>&1)
  exit_code=$?

  if [ $exit_code -ne 0 ]; then
    echo "ERROR: database connection failed" >&2
    exit 1
  fi

  echo "$output"
}

# ---------------------------------------------------------------------------
# Section 1: Pipeline Latency
# ---------------------------------------------------------------------------
echo ""
echo "=== Pipeline Latency ==="

LATENCY_SQL="SELECT
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
  AND processing_completed_at >= processing_started_at"

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] psql \$DATABASE_URL --no-psqlrc --tuples-only -c '$LATENCY_SQL'"
else
  LATENCY_RESULT=$(run_psql "$LATENCY_SQL")
  # Parse: avg_ms | min_ms | max_ms | p95_ms | sample_size
  LATENCY_AVG=$(echo "$LATENCY_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$1); print $1}')
  LATENCY_MIN=$(echo "$LATENCY_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$2); print $2}')
  LATENCY_MAX=$(echo "$LATENCY_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$3); print $3}')
  LATENCY_P95=$(echo "$LATENCY_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$4); print $4}')
  LATENCY_N=$(echo "$LATENCY_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$5); print $5}')

  if [ -z "$LATENCY_N" ] || [ "$LATENCY_N" = "0" ]; then
    echo "[SKIP] Pipeline Latency: no completed sessions with timing data found"
  else
    echo "AVG: ${LATENCY_AVG} ms | MIN: ${LATENCY_MIN} ms | MAX: ${LATENCY_MAX} ms | P95: ${LATENCY_P95} ms"
    echo "Sample size: ${LATENCY_N} sessions"
  fi
fi

# ---------------------------------------------------------------------------
# Section 2: Cost Per Session
# ---------------------------------------------------------------------------
echo ""
echo "=== Cost Per Session ==="

COST_SQL="SELECT
  TO_CHAR(AVG((input_tokens * 0.00000006) + (output_tokens * 0.00000024)), 'FM0.0000000') AS avg_cost_usd,
  TO_CHAR(MIN((input_tokens * 0.00000006) + (output_tokens * 0.00000024)), 'FM0.0000000') AS min_cost_usd,
  TO_CHAR(MAX((input_tokens * 0.00000006) + (output_tokens * 0.00000024)), 'FM0.0000000') AS max_cost_usd,
  COUNT(*) AS sample_size
FROM analyses
WHERE model_used IS NOT NULL"

TOKEN_SQL="SELECT
  ROUND(AVG(input_tokens)::numeric, 0)  AS avg_input_tokens,
  ROUND(AVG(output_tokens)::numeric, 0) AS avg_output_tokens
FROM analyses
WHERE model_used IS NOT NULL"

MODEL_SQL="SELECT model_used, COUNT(*) AS session_count
FROM analyses
WHERE model_used IS NOT NULL
GROUP BY model_used
ORDER BY session_count DESC"

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] psql \$DATABASE_URL --no-psqlrc --tuples-only -c '$COST_SQL'"
  echo "[DRY RUN] psql \$DATABASE_URL --no-psqlrc --tuples-only -c '$TOKEN_SQL'"
  echo "[DRY RUN] psql \$DATABASE_URL --no-psqlrc --tuples-only -c '$MODEL_SQL'"
else
  COST_RESULT=$(run_psql "$COST_SQL")
  COST_N=$(echo "$COST_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$4); print $4}')

  if [ -z "$COST_N" ] || [ "$COST_N" = "0" ]; then
    echo "[SKIP] Cost Per Session: no analyses rows with model_used found"
  else
    COST_AVG=$(echo "$COST_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$1); print $1}')
    COST_MIN=$(echo "$COST_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$2); print $2}')
    COST_MAX=$(echo "$COST_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$3); print $3}')
    echo "AVG: \$${COST_AVG} | MIN: \$${COST_MIN} | MAX: \$${COST_MAX} (n=${COST_N})"

    TOKEN_RESULT=$(run_psql "$TOKEN_SQL")
    TOKEN_IN=$(echo "$TOKEN_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$1); print $1}')
    TOKEN_OUT=$(echo "$TOKEN_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$2); print $2}')
    echo "AVG tokens: ${TOKEN_IN} input | ${TOKEN_OUT} output"

    echo "Model breakdown:"
    run_psql "$MODEL_SQL" | while IFS='|' read -r model count; do
      model=$(echo "$model" | xargs)
      count=$(echo "$count" | xargs)
      echo "  ${model}: ${count} sessions"
    done
  fi
fi

# ---------------------------------------------------------------------------
# Section 3: Webhook Success Rate
# ---------------------------------------------------------------------------
echo ""
echo "=== Webhook Success Rate ==="

WEBHOOK_RATE_SQL="SELECT
  ROUND(
    COUNT(*) FILTER (WHERE status = 'delivered') * 100.0
    / NULLIF(COUNT(*) FILTER (WHERE status != 'pending'), 0),
    1
  ) AS success_rate_pct,
  COUNT(*) FILTER (WHERE status != 'pending') AS total_attempted
FROM webhook_deliveries"

WEBHOOK_BREAKDOWN_SQL="SELECT status, COUNT(*) AS count
FROM webhook_deliveries
GROUP BY status
ORDER BY status"

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] psql \$DATABASE_URL --no-psqlrc --tuples-only -c '$WEBHOOK_RATE_SQL'"
  echo "[DRY RUN] psql \$DATABASE_URL --no-psqlrc --tuples-only -c '$WEBHOOK_BREAKDOWN_SQL'"
else
  WEBHOOK_RESULT=$(run_psql "$WEBHOOK_RATE_SQL")
  WEBHOOK_TOTAL=$(echo "$WEBHOOK_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$2); print $2}')

  if [ -z "$WEBHOOK_TOTAL" ] || [ "$WEBHOOK_TOTAL" = "0" ]; then
    echo "[SKIP] Webhook Success Rate: no completed delivery attempts found"
  else
    WEBHOOK_RATE=$(echo "$WEBHOOK_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$1); print $1}')
    echo "Success rate: ${WEBHOOK_RATE}% (${WEBHOOK_TOTAL} total attempted)"
    echo "Status breakdown:"
    run_psql "$WEBHOOK_BREAKDOWN_SQL" | while IFS='|' read -r status count; do
      status=$(echo "$status" | xargs)
      count=$(echo "$count" | xargs)
      [ -n "$status" ] && echo "  ${status}: ${count}"
    done
  fi
fi

# ---------------------------------------------------------------------------
# Section 4: Session Completion Rate
# ---------------------------------------------------------------------------
echo ""
echo "=== Session Completion Rate ==="

SESSION_RATE_SQL="SELECT
  ROUND(
    COUNT(*) FILTER (WHERE status = 'completed') * 100.0
    / NULLIF(COUNT(*), 0),
    1
  ) AS completion_rate_pct,
  COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
  COUNT(*) AS total_count
FROM sessions"

SESSION_BREAKDOWN_SQL="SELECT status, COUNT(*) AS count
FROM sessions
GROUP BY status
ORDER BY status"

if [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] psql \$DATABASE_URL --no-psqlrc --tuples-only -c '$SESSION_RATE_SQL'"
  echo "[DRY RUN] psql \$DATABASE_URL --no-psqlrc --tuples-only -c '$SESSION_BREAKDOWN_SQL'"
else
  SESSION_RESULT=$(run_psql "$SESSION_RATE_SQL")
  SESSION_TOTAL=$(echo "$SESSION_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$3); print $3}')

  if [ -z "$SESSION_TOTAL" ] || [ "$SESSION_TOTAL" = "0" ]; then
    echo "[SKIP] Session Completion Rate: no sessions found"
  else
    SESSION_RATE=$(echo "$SESSION_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$1); print $1}')
    SESSION_COMPLETED=$(echo "$SESSION_RESULT" | awk -F'|' 'NR==1{gsub(/ /,"",$2); print $2}')
    echo "Completion rate: ${SESSION_RATE}% (${SESSION_COMPLETED} completed / ${SESSION_TOTAL} total)"
    echo "Status breakdown:"
    run_psql "$SESSION_BREAKDOWN_SQL" | while IFS='|' read -r status count; do
      status=$(echo "$status" | xargs)
      count=$(echo "$count" | xargs)
      [ -n "$status" ] && echo "  ${status}: ${count}"
    done
  fi
fi

# ---------------------------------------------------------------------------
# Section 5: Dashboard API Verification
# ---------------------------------------------------------------------------
echo ""
echo "=== Dashboard API Verification ==="

# Default API-sourced values to N/A
API_AVG_LATENCY="N/A"
API_TOTAL_INPUT_TOKENS="N/A"
API_TOTAL_OUTPUT_TOKENS="N/A"
API_ESTIMATED_COST="N/A"

if [ -z "${PARTNER_ID:-}" ] || [ -z "${API_KEY:-}" ]; then
  echo "[SKIP] Dashboard API check: set PARTNER_ID and API_KEY to enable"
elif [ "$DRY_RUN" = true ]; then
  echo "[DRY RUN] curl -s -H \"Authorization: Bearer \$API_KEY\" \"http://18.223.189.193:3001/v1/partners/\$PARTNER_ID/dashboard\" | jq '.stats.metrics, .stats.completionRate, .stats.total'"
else
  HTTP_RESPONSE=$(curl -s -w "\n%{http_code}" -H "Authorization: Bearer $API_KEY" "http://18.223.189.193:3001/v1/partners/$PARTNER_ID/dashboard")
  HTTP_STATUS=$(echo "$HTTP_RESPONSE" | tail -n1)
  HTTP_BODY=$(echo "$HTTP_RESPONSE" | sed '$d')

  if [ "$HTTP_STATUS" != "200" ]; then
    echo "[WARN] Dashboard API returned HTTP ${HTTP_STATUS} — skipping API comparison" >&2
  else
    if [ "$JQ_AVAILABLE" = true ]; then
      echo "$HTTP_BODY" | jq '.stats.metrics, .stats.completionRate, .stats.total'
      API_AVG_LATENCY=$(echo "$HTTP_BODY" | jq -r '.stats.metrics.avgLatencyMs // "N/A"')
      API_TOTAL_INPUT_TOKENS=$(echo "$HTTP_BODY" | jq -r '.stats.metrics.totalInputTokens // "N/A"')
      API_TOTAL_OUTPUT_TOKENS=$(echo "$HTTP_BODY" | jq -r '.stats.metrics.totalOutputTokens // "N/A"')
      API_ESTIMATED_COST=$(echo "$HTTP_BODY" | jq -r '.stats.metrics.estimatedCostUsd // "N/A"')
    else
      echo "$HTTP_BODY"
    fi
    echo "NOTE: Dashboard API covers last 100 sessions only; SQL queries above cover all sessions."
  fi
fi

# ---------------------------------------------------------------------------
# Section 6: METRICS.md Block
# ---------------------------------------------------------------------------
echo ""
echo "=== METRICS.md Block ==="
echo ""
echo "Copy the block below and paste it into context/METRICS.md after the"
echo "'## Baselines To Capture Next Session' table."
echo ""

# Resolve fallback values for any section that was skipped or returned no data
if [ "$DRY_RUN" = true ]; then
  _LATENCY_AVG="<avg_ms>"
  _LATENCY_MIN="<min_ms>"
  _LATENCY_MAX="<max_ms>"
  _LATENCY_P95="<p95_ms>"
  _LATENCY_N="<N>"
  _COST_AVG="<avg_cost>"
  _COST_MIN="<min_cost>"
  _COST_MAX="<max_cost>"
  _TOKEN_IN="<input_tokens>"
  _TOKEN_OUT="<output_tokens>"
  _WEBHOOK_RATE="<rate>"
  _WEBHOOK_TOTAL="<total>"
  _WEBHOOK_AFTER="<rate>% (<total> total attempted)"
  _SESSION_RATE="<rate>"
  _SESSION_COMPLETED="<completed>"
  _SESSION_TOTAL="<total>"
else
  # Latency fallback
  if [ -z "${LATENCY_N:-}" ] || [ "${LATENCY_N:-0}" = "0" ]; then
    _LATENCY_AVG="~1,200 ms (Session 7 manual observation — re-run script to confirm)"
    _LATENCY_MIN="~1,200 ms (Session 7 manual observation — re-run script to confirm)"
    _LATENCY_MAX="~1,200 ms (Session 7 manual observation — re-run script to confirm)"
    _LATENCY_P95="~1,200 ms (Session 7 manual observation — re-run script to confirm)"
    _LATENCY_N="1 (Session 7 manual observation)"
  else
    _LATENCY_AVG="${LATENCY_AVG}"
    _LATENCY_MIN="${LATENCY_MIN}"
    _LATENCY_MAX="${LATENCY_MAX}"
    _LATENCY_P95="${LATENCY_P95}"
    _LATENCY_N="${LATENCY_N}"
  fi

  # Cost fallback
  if [ -z "${COST_N:-}" ] || [ "${COST_N:-0}" = "0" ]; then
    _COST_AVG="~\$0.0000295 (Session 7 manual observation — re-run script to confirm)"
    _COST_MIN="~\$0.0000295 (Session 7 manual observation — re-run script to confirm)"
    _COST_MAX="~\$0.0000295 (Session 7 manual observation — re-run script to confirm)"
    _TOKEN_IN="215 (Session 7 manual observation)"
    _TOKEN_OUT="72 (Session 7 manual observation)"
  else
    _COST_AVG="${COST_AVG}"
    _COST_MIN="${COST_MIN}"
    _COST_MAX="${COST_MAX}"
    _TOKEN_IN="${TOKEN_IN}"
    _TOKEN_OUT="${TOKEN_OUT}"
  fi

  # Webhook fallback
  if [ -z "${WEBHOOK_TOTAL:-}" ] || [ "${WEBHOOK_TOTAL:-0}" = "0" ]; then
    _WEBHOOK_AFTER="unknown — no deliveries recorded (0 total attempted)"
  else
    _WEBHOOK_AFTER="${WEBHOOK_RATE}% (${WEBHOOK_TOTAL} total attempted)"
  fi

  # Session completion fallback
  if [ -z "${SESSION_TOTAL:-}" ] || [ "${SESSION_TOTAL:-0}" = "0" ]; then
    _SESSION_RATE="unknown — insufficient data"
    _SESSION_COMPLETED="0"
    _SESSION_TOTAL="0"
  else
    _SESSION_RATE="${SESSION_RATE}"
    _SESSION_COMPLETED="${SESSION_COMPLETED}"
    _SESSION_TOTAL="${SESSION_TOTAL}"
  fi
fi

cat << 'METRICS_BLOCK'
## Baseline Pipeline Metrics — May 2026

> First measurement. No prior baseline existed for pipeline performance metrics.

### Pipeline Latency
- **Before:** N/A — first measurement
METRICS_BLOCK

echo "- **After:** AVG ~${_LATENCY_AVG} ms | MIN ${_LATENCY_MIN} ms | MAX ${_LATENCY_MAX} ms | P95 ${_LATENCY_P95} ms (n=${_LATENCY_N} completed sessions)"

cat << 'METRICS_BLOCK'
- **Delta:** N/A — first measurement
- **How measured:** `SELECT ROUND(AVG(EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000)::numeric, 0) AS avg_ms, ... FROM sessions WHERE status = 'completed' AND processing_started_at IS NOT NULL AND processing_completed_at IS NOT NULL`
  Dashboard API cross-check: `curl -H "Authorization: Bearer $API_KEY" http://18.223.189.193:3001/v1/partners/$PARTNER_ID/dashboard | jq '.stats.metrics'`

### Cost Per Session (Bedrock Nova Lite)
- **Before:** N/A — first measurement
METRICS_BLOCK

echo "- **After:** AVG ~\$${_COST_AVG} | MIN \$${_COST_MIN} | MAX \$${_COST_MAX} (AVG ${_TOKEN_IN} input tokens, ${_TOKEN_OUT} output tokens)"

cat << 'METRICS_BLOCK'
- **Pricing basis:** $0.06/1M input tokens, $0.24/1M output tokens (Nova Lite)
- **Delta:** N/A — first measurement
- **How measured:** `SELECT TO_CHAR(AVG((input_tokens * 0.00000006) + (output_tokens * 0.00000024)), 'FM0.0000000') FROM analyses WHERE model_used IS NOT NULL`

### Webhook Delivery Success Rate
- **Before:** N/A — first measurement
METRICS_BLOCK

echo "- **After:** ${_WEBHOOK_AFTER}"

cat << 'METRICS_BLOCK'
- **Delta:** N/A — first measurement
- **How measured:** `SELECT ROUND(COUNT(*) FILTER (WHERE status = 'delivered') * 100.0 / NULLIF(COUNT(*) FILTER (WHERE status != 'pending'), 0), 1) FROM webhook_deliveries`

### Session Completion Rate
- **Before:** N/A — first measurement
METRICS_BLOCK

echo "- **After:** ${_SESSION_RATE}% (${_SESSION_COMPLETED} completed / ${_SESSION_TOTAL} total)"

cat << 'METRICS_BLOCK'
- **Delta:** N/A — first measurement
- **How measured:** `SELECT ROUND(COUNT(*) FILTER (WHERE status = 'completed') * 100.0 / NULLIF(COUNT(*), 0), 1) FROM sessions`

### Frontend Performance (Manual — Out of Scope for Script)
- **Dashboard Load Time:** Measure via Browser DevTools → Network → DOMContentLoaded (no throttling, production mode)
- **Vercel First Load JS (dashboard):** Run `cd apps/web && npm run build` and record the `/dashboard` route row
- **Target:** Load time < 1s, First Load JS < 120 kB
- **Note:** These metrics are not automated by `scripts/capture-metrics.sh` and must be recorded manually.
METRICS_BLOCK
