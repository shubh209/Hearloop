/**
 * stress.js — Stress test
 *
 * Purpose : Find the breaking point. Ramps users up aggressively until the
 *           API starts failing, then checks it recovers cleanly.
 * Load    : 0 → 50 → 100 → 200 → 400 → 0 VUs in stages.
 * Pass    : API recovers to <1% error rate after load drops.
 *
 * Run:
 *   k6 run -e API_KEY=sk-live_xxx stress.js
 *
 * What to watch:
 *   - At what VU count does error rate spike above 1%?
 *   - Does the API recover after load drops (no stuck connections)?
 *   - Does Neon connection pool exhaust? (look for "too many connections" errors)
 *   - Does the rate limiter (100 req/min) kick in and return 429s?
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, API_KEY } from './config.js';

const rateLimitHits = new Counter('rate_limit_429s');
const serverErrors = new Counter('server_errors_5xx');
const successfulTokens = new Counter('successful_tokens');

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // warm up
    { duration: '3m', target: 100 },  // moderate load
    { duration: '3m', target: 200 },  // heavy load (your target scenario)
    { duration: '3m', target: 400 },  // beyond capacity — find the break point
    { duration: '2m', target: 0 },    // recovery — must return to healthy
  ],
  thresholds: {
    // During recovery phase, error rate must drop back below 5%
    http_req_failed: ['rate<0.05'],
    // p99 must stay under 10s even under stress
    http_req_duration: ['p(99)<10000'],
  },
};

const headers = { 'Content-Type': 'application/json' };

export default function () {
  // Stress test focuses on the most DB/Redis-intensive endpoint:
  // create-token → create-session (2 DB writes + 1 Redis enqueue)

  // ── Step 1: Create token ──────────────────────────────────────────────────
  const tokenRes = http.post(
    `${BASE_URL}/public/sessions/create-token`,
    JSON.stringify({ apiKey: API_KEY }),
    { headers, tags: { step: 'create_token' } }
  );

  if (tokenRes.status === 429) {
    rateLimitHits.add(1);
    sleep(2); // back off when rate limited
    return;
  }

  if (tokenRes.status >= 500) {
    serverErrors.add(1);
    sleep(1);
    return;
  }

  const tokenOk = check(tokenRes, {
    'create-token: 200': (r) => r.status === 200,
  });

  if (!tokenOk) {
    sleep(1);
    return;
  }

  successfulTokens.add(1);
  const { sessionCreateToken } = JSON.parse(tokenRes.body);

  // ── Step 2: Create session ────────────────────────────────────────────────
  const sessionRes = http.post(
    `${BASE_URL}/public/sessions`,
    JSON.stringify({ promptText: 'Stress test', maxDurationSec: 5 }),
    {
      headers: { ...headers, Authorization: `Bearer ${sessionCreateToken}` },
      tags: { step: 'create_session' },
    }
  );

  if (sessionRes.status === 429) {
    rateLimitHits.add(1);
    sleep(2);
    return;
  }

  if (sessionRes.status >= 500) {
    serverErrors.add(1);
  }

  check(sessionRes, {
    'create-session: 201': (r) => r.status === 201,
  });

  // Short sleep — stress test intentionally keeps pressure high
  sleep(0.2);
}

export function handleSummary(data) {
  const stages = [
    { label: 'Warm-up (50 VUs)',    note: 'Should be clean' },
    { label: 'Moderate (100 VUs)',  note: 'Expect <1% errors' },
    { label: 'Heavy (200 VUs)',     note: 'Your target scenario' },
    { label: 'Beyond (400 VUs)',    note: 'Expect errors — find the break point' },
    { label: 'Recovery (0 VUs)',    note: 'Must return to healthy' },
  ];

  return {
    'testing/load-performance/results/stress-summary.json': JSON.stringify(data, null, 2),
    stdout: `
=== Stress Test Summary ===
Rate limit hits (429) : ${data.metrics.rate_limit_429s?.values?.count ?? 0}
Server errors (5xx)   : ${data.metrics.server_errors_5xx?.values?.count ?? 0}
Successful tokens     : ${data.metrics.successful_tokens?.values?.count ?? 0}
p95 latency           : ${Math.round(data.metrics.http_req_duration?.values?.['p(95)'] ?? 0)}ms
p99 latency           : ${Math.round(data.metrics.http_req_duration?.values?.['p(99)'] ?? 0)}ms
Overall error rate    : ${((data.metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%

Stages:
${stages.map((s) => `  ${s.label.padEnd(25)} — ${s.note}`).join('\n')}

Tip: Run with --out json=results/stress-raw.json for per-second breakdown.
`,
  };
}
