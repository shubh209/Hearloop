# Coverage #9 — Mock interview bank

**Status:** draft — batch

## Q1: Walk me through the full pipeline when a user submits voice feedback.

Session → record → S3 presigned upload → finalize (fast) → validate → Groq → Bedrock → `completed` in DB → HMAC webhook with Insights. Diagram: `diagrams/pipeline-async.md`.

## Q2: Why event-driven? What breaks with synchronous?

STT+LLM+webhook = seconds, flaky. Sync finalize → timeouts, thread starvation, no per-step retry. See architecture #4 in `INTERVIEW_PREP.md`.

## Q3: How did you achieve 149ms p95 under 200 concurrent users?

k6 load on **capture/API path** — 200 VUs, **149ms p95, 0% errors** (pre-generated tokens, raised rate limit in test). **Not** full AI in that latency number — pipeline async after finalize. Bottlenecks: EC2 CPU, rate limit, Neon connections.

## Q4: What does OWASP ZAP test? What did you fix?

Baseline scan of live API — common web vulns. **65 pass, 0 fail**. Plus: Server header suppressed, UUID validation, SSRF on webhooks, dependency/CVE hardening, rate-limit tests.

## Q5: How does multi-tenancy work?

`partner_id` on sessions; API key → one Partner; create-token + public session token; per-Partner webhook, `allowed_origins`, `business_context`. Architecture #6.

## Q6: Tradeoffs with serverless? *(reframe: hybrid)*

**Not fully serverless** — EC2 for BullMQ workers. Tradeoff: single-instance ops. Win: **~$9.60/mo**, Neon/Upstash/Vercel/S3. V2: custom TLS, httpOnly auth, quotas.
