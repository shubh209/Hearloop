# Coverage #4 — Scale, performance, cost

**Status:** draft — batch

## 30-second

- **k6:** smoke (19/19 checks), **load 200 VUs → 149ms p95, 0% errors**, stress 50→400, spike 500, soak 20 VUs × 10 min **~116ms p95 flat**.
- **149ms p95** = **API/capture path** under concurrency — **not** full STT+Bedrock in that HTTP window; full session E2E **~1.9–3.9s** (soak).
- **Bottlenecks on t3.micro:** Neon cold start, rate limiter (100 req/min per key), EC2 CPU >~150 VUs, Upstash command budget.
- **Cost:** **~$9.60/mo hybrid** (was ~$35); Bedrock **fractions of a cent/session** (Nova Lite).

## Say honestly if pressed

Load test used **RATE_LIMIT_MAX=10000** and pre-generated tokens — production default is **100 req/min** per API key.
