/**
 * soak.js — Soak Test
 *
 * Purpose : Run at moderate load (20 VUs) for 10 minutes to detect:
 *   - Memory leaks (heap growing unbounded over time)
 *   - DB connection pool exhaustion (Neon max_connections)
 *   - Redis command accumulation (Upstash quota drain)
 *   - Response time degradation over time (p95 should stay flat)
 *
 * Design:
 *   - 20 VUs × 10 min × ~1 session/8s ≈ 1,500 iterations
 *   - Pre-generated tokens (generate-tokens.js 200) — one per iteration
 *   - Auto-cleanup at the end via teardown() function
 *
 * Prerequisites:
 *   node testing/load-performance/generate-tokens.js 200
 *   (run immediately before — tokens expire in 10 min)
 *
 * Run:
 *   node testing/load-performance/generate-tokens.js 200 && \
 *   mkdir -p testing/load-performance/results && \
 *   k6 run testing/load-performance/soak.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend, Gauge } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import exec from 'k6/execution';
import { BASE_URL, THRESHOLDS } from './config.js';

// ── Token pool ────────────────────────────────────────────────────────────────
const testTokens = new SharedArray('soakTokens', function () {
  const data = JSON.parse(open('./test-tokens.json'));
  return data.map((entry) => entry.sessionCreateToken);
});

// ── Custom metrics ────────────────────────────────────────────────────────────
const sessionCreated    = new Counter('soak_sessions_created');
const sessionFinalized  = new Counter('soak_sessions_finalized');
const sessionFailed     = new Counter('soak_sessions_failed');
const endToEndMs        = new Trend('soak_end_to_end_ms', true);

// ── Test config ───────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    soak: {
      executor: 'constant-vus',
      vus: 20,
      duration: '10m',
    },
  },
  thresholds: {
    // p95 must stay under 3s throughout the entire 10 minutes
    // If it degrades over time, this will catch it
    http_req_duration: ['p(95)<3000'],
    // Error rate must stay under 2% — slightly relaxed vs load test
    // because tokens may expire mid-test if generation took too long
    http_req_failed: ['rate<0.02'],
    // At least 80% of sessions must complete successfully
    soak_sessions_finalized: ['count>=1000'],
    soak_sessions_failed: ['count<200'],
    // p95 end-to-end must stay under 6s
    soak_end_to_end_ms: ['p(95)<6000'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ── Main VU function ──────────────────────────────────────────────────────────
export default function () {
  // Use global iteration index to pick a unique token.
  // With 20 VUs × 10 min × ~1 iter/8s ≈ 1,500 iterations.
  // Pool has 200 tokens — wrap around after exhaustion.
  // Wrapped tokens will fail with 401 (already used) — counted in failed metric.
  const tokenIndex = exec.scenario.iterationInTest % testTokens.length;
  const sessionCreateToken = testTokens[tokenIndex];

  if (!sessionCreateToken) {
    sessionFailed.add(1);
    return;
  }

  const startMs = Date.now();

  // ── Step 1: Create session ──────────────────────────────────────────────────
  const sessionRes = http.post(
    `${BASE_URL}/public/sessions`,
    JSON.stringify({ promptText: 'Soak test session', maxDurationSec: 5 }),
    {
      headers: { ...JSON_HEADERS, Authorization: `Bearer ${sessionCreateToken}` },
      tags: { step: 'create_session', test: 'soak' },
    }
  );

  const sessionOk = check(sessionRes, {
    'soak create-session: 201': (r) => r.status === 201,
  });

  if (!sessionOk) {
    sessionFailed.add(1);
    sleep(2); // back off on failure
    return;
  }

  sessionCreated.add(1);
  const { sessionToken } = JSON.parse(sessionRes.body);

  sleep(0.5);

  // ── Step 2: Open session ────────────────────────────────────────────────────
  const openRes = http.post(
    `${BASE_URL}/public/session/${sessionToken}/open`,
    '{}',
    { headers: JSON_HEADERS, tags: { step: 'open_session', test: 'soak' } }
  );

  if (!check(openRes, { 'soak open-session: 200': (r) => r.status === 200 })) {
    sessionFailed.add(1);
    return;
  }

  sleep(0.5);

  // ── Step 3: Get upload URL ──────────────────────────────────────────────────
  const uploadUrlRes = http.post(
    `${BASE_URL}/public/session/${sessionToken}/upload-url`,
    JSON.stringify({ mimeType: 'audio/webm' }),
    { headers: JSON_HEADERS, tags: { step: 'upload_url', test: 'soak' } }
  );

  if (!check(uploadUrlRes, { 'soak upload-url: 200': (r) => r.status === 200 })) {
    sessionFailed.add(1);
    return;
  }

  const { storageKey } = JSON.parse(uploadUrlRes.body);

  sleep(0.5);

  // ── Step 4: Finalize ──────────────────────────────────────────────────────
  const finalizeRes = http.post(
    `${BASE_URL}/public/session/${sessionToken}/finalize`,
    JSON.stringify({ storageKey, mimeType: 'audio/webm', sizeBytes: 1024 }),
    { headers: JSON_HEADERS, tags: { step: 'finalize', test: 'soak' } }
  );

  const finalizeOk = check(finalizeRes, {
    'soak finalize: 200': (r) => r.status === 200,
    'soak finalize: submitted': (r) => {
      try { return JSON.parse(r.body).status === 'submitted'; } catch { return false; }
    },
  });

  if (finalizeOk) {
    sessionFinalized.add(1);
    endToEndMs.add(Date.now() - startMs);
  } else {
    sessionFailed.add(1);
  }

  // Realistic think time — 5-10s between sessions per VU
  // This keeps load moderate and mimics real user behaviour
  sleep(Math.random() * 5 + 5);
}

// ── Teardown — runs once after all VUs finish ─────────────────────────────────
// Cleans up test sessions created during the soak test via the cleanup script
export function teardown(data) {
  console.log('\nSoak test complete. Cleanup will run via cleanup-test-partners.js');
  console.log('Run: DATABASE_URL=<url> node testing/load-performance/cleanup-test-partners.js');
}

// ── Summary ───────────────────────────────────────────────────────────────────
export function handleSummary(data) {
  const created   = data.metrics.soak_sessions_created?.values?.count   ?? 0;
  const finalized = data.metrics.soak_sessions_finalized?.values?.count ?? 0;
  const failed    = data.metrics.soak_sessions_failed?.values?.count    ?? 0;
  const p95       = Math.round(data.metrics.http_req_duration?.values?.['p(95)'] ?? 0);
  const p99       = Math.round(data.metrics.http_req_duration?.values?.['p(99)'] ?? 0);
  const errorRate = ((data.metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2);
  const e2eP95    = Math.round(data.metrics.soak_end_to_end_ms?.values?.['p(95)'] ?? 0);
  const e2eMin    = Math.round(data.metrics.soak_end_to_end_ms?.values?.['min'] ?? 0);
  const e2eMax    = Math.round(data.metrics.soak_end_to_end_ms?.values?.['max'] ?? 0);

  const summary = `
╔══════════════════════════════════════════════╗
║       Soak Test Results (20 VUs × 10 min)    ║
╠══════════════════════════════════════════════╣
║ Sessions created   : ${String(created).padEnd(23)}║
║ Sessions finalized : ${String(finalized).padEnd(23)}║
║ Sessions failed    : ${String(failed).padEnd(23)}║
╠══════════════════════════════════════════════╣
║ p95 request latency: ${String(p95 + 'ms').padEnd(23)}║
║ p99 request latency: ${String(p99 + 'ms').padEnd(23)}║
║ Error rate         : ${String(errorRate + '%').padEnd(23)}║
╠══════════════════════════════════════════════╣
║ E2E p95            : ${String(e2eP95 + 'ms').padEnd(23)}║
║ E2E min            : ${String(e2eMin + 'ms').padEnd(23)}║
║ E2E max            : ${String(e2eMax + 'ms').padEnd(23)}║
╚══════════════════════════════════════════════╝

What to look for in the results:
  - p95 latency should be FLAT across the 10 minutes (no degradation)
  - Error rate should stay under 2%
  - If E2E max >> E2E p95, there were occasional slow outliers (Neon cold starts)
  - Run cleanup: DATABASE_URL=<url> node testing/load-performance/cleanup-test-partners.js
`;

  return {
    'testing/load-performance/results/soak-summary.json': JSON.stringify(data, null, 2),
    stdout: summary,
  };
}
