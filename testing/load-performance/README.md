# Load & Performance Testing

Tool: **k6** — https://k6.io

## Install

```bash
brew install k6
```

## Scripts

| File | VUs | Duration | Purpose |
|------|-----|----------|---------|
| `smoke.js` | 1 | ~30s | Confirm full session flow works end-to-end |
| `load.js` | 200 | 7 min | Simulate 200 concurrent users (your target scenario) |
| `stress.js` | 0→400 | 13 min | Find the breaking point — ramps until errors spike |
| `spike.js` | 0→500→0 | ~2 min | Sudden burst — tests recovery without manual intervention |

## Run

```bash
# Always run smoke first to confirm the API is up
k6 run -e API_KEY=sk-live_xxx smoke.js

# Load test — 200 concurrent users
k6 run -e API_KEY=sk-live_xxx load.js

# Stress test — find the breaking point
k6 run -e API_KEY=sk-live_xxx stress.js

# Spike test — sudden burst of 500 users
k6 run -e API_KEY=sk-live_xxx spike.js
```

Results are saved to `results/` as JSON after each run.

## What each script tests

### smoke.js
Runs the full 6-step session flow once:
1. `GET /health` — API is up
2. `GET /health/detailed` — DB + Redis healthy
3. `POST /public/sessions/create-token` — API key exchange
4. `POST /public/sessions` — session creation
5. `POST /public/session/:token/open` — state transition
6. `POST /public/session/:token/upload-url` — S3 signed URL
7. `PUT <s3-url>` — audio upload
8. `POST /public/session/:token/finalize` — submit for processing

### load.js
200 VUs all running the full session flow simultaneously for 5 minutes.
Measures:
- p95 and p99 latency per step
- End-to-end session completion time (p90 target: <5s)
- Error rate (target: <1%)
- Rate limiter behaviour (100 req/min per API key)

### stress.js
Ramps: 50 → 100 → 200 → 400 VUs then drops to 0.
Answers: at what user count does the API start failing?
Watch for:
- Neon "too many connections" errors at high VU counts
- 429s from the rate limiter
- 5xx errors from EC2 CPU saturation

### spike.js
Instant jump to 500 users for 30s then drops to 0.
Confirms the API recovers without manual restart after a traffic burst.

## Thresholds (pass/fail criteria)

| Metric | Target |
|--------|--------|
| p95 response time | < 3,000ms |
| p99 response time | < 10,000ms |
| Error rate | < 1% |
| E2E session flow p90 | < 5,000ms |

## Expected bottlenecks on t3.micro

1. **Neon cold start** — first DB query after auto-pause takes 1–3s
2. **Rate limiter** — 100 req/min per API key; all VUs share one key in tests
3. **EC2 CPU** — t3.micro has 2 vCPUs; sustained load above ~150 VUs will saturate it
4. **Redis** — Upstash free tier is fast but has 500K/month command limit
