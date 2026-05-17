# Hearloop — Backlog

## P1: Unlock Production Metrics (Bedrock Approval Pending)

**Blocker:** AWS Bedrock daily token quota approval in progress

1. **E2E Session Test** — Record audio → verify analysis populated
   - Check `analyses` table: `sentiment_label`, `topics`, `model_used`, `input_tokens`, `output_tokens`
   - Dashboard should show real latency + cost in `stats.metrics`
   
2. **Metrics Capture** — Before/after numbers for portfolio
   - Pipeline end-to-end latency (SQL: `AVG(processing_completed_at - processing_started_at)`)
   - Cost per session (Bedrock: `(input_tokens × 0.00000006) + (output_tokens × 0.00000024)`)
   - Webhook delivery success rate

## P2: Platform Security Hardening

1. **Custom domain + SSL on EC2** — Remove Vercel proxy, direct HTTPS
2. **CloudWatch monitoring** — Bedrock invocation logs + latency tracking
3. **Rate limiting enhancements** — Per-origin limits on widget creation

## P3: Feature Expansion

1. **React SDK package** — `@hearloop/react` npm package for widget
2. **Dashboard analytics** — Real-time sentiment trends, topic breakdown
3. **Webhook retries UI** — Partner can view/replay failed webhooks

## Completed Features (Session 5)

- ✅ Frontend origin validation
- ✅ Server-side session creation token flow
- ✅ Widget API key protection
- ✅ Vercel config (web-only build)

**See AGENTS.md for full context.**
