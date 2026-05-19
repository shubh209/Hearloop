# Hearloop — Backlog

Last updated: May 19, 2026

---

## Immediate (Before Next Deploy)

1. **Apply migration 005 to Neon** — `ALTER TABLE partners ADD COLUMN business_context TEXT;`
   - Without this, the deployed API will crash on any query that references `business_context`

---

## P1: Unlock Production Metrics (Bedrock Approval Pending)

**Blocker:** AWS Bedrock daily token quota approval in progress

1. **E2E Session Test** — Record audio → verify analysis populated
   - Check `analyses` table: `sentiment_label`, `topics`, `model_used`, `input_tokens`, `output_tokens`
   - Dashboard should show real latency + cost in `stats.metrics`
   - Test with a partner that has `business_context` set — verify summary is more specific

2. **Metrics Capture** — Before/after numbers for portfolio
   - Pipeline end-to-end latency (SQL: `AVG(processing_completed_at - processing_started_at)`)
   - Cost per session (Bedrock: `(input_tokens × 0.00000006) + (output_tokens × 0.00000024)`)
   - Webhook delivery success rate

---

## P2: Observability (Recommended Next Feature)

**`GET /health/detailed`** — returns real system status, no auth required:
```json
{
  "status": "healthy",
  "checks": {
    "database": { "status": "ok", "latencyMs": 12 },
    "redis": { "status": "ok", "latencyMs": 4 },
    "queueDepths": { "validate": 0, "transcribe": 0, "analyze": 2, "webhooks": 0 },
    "pipeline": { "completionRate24h": 0.94, "avgLatencyMs": 3200, "failedLast24h": 2 }
  }
}
```
- Uses only existing DB + Redis — no new infrastructure
- ~4 hours of work
- Directly demonstrates observability as a first-class engineering concern

---

## P2: Platform Security / Infrastructure

1. **Custom domain + SSL on EC2** — Remove Vercel proxy, direct HTTPS
2. **CloudWatch monitoring** — Bedrock invocation logs + latency tracking
3. **httpOnly cookie auth** — Replace localStorage `hl_session` with server-set cookie

---

## P3: Feature Expansion

1. **React SDK package** — `@hearloop/react` npm package for widget
2. **Webhook retries UI** — Partner can view/replay failed webhooks from dashboard

---

## Completed ✅

### Session 6 (May 19, 2026)
- ✅ Business context per partner — `business_context` column, settings endpoint, prompt injection
- ✅ Redis drainDelay raised 300s → 600s (observed 18K/day → projected ~6–8K/day)
- ✅ validateQueue added to shutdown handler (was missing)

### Session 5 (May 17, 2026)
- ✅ Frontend origin validation
- ✅ Server-side session creation token flow
- ✅ Widget API key protection
- ✅ Vercel config (web-only build)

### Sessions 1–4
- ✅ Full pipeline, CI/CD, infra migration, CORS, logging, CSS tokens, npm workspace fix

**See AGENTS.md for full context.**
