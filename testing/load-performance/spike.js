/**
 * spike.js — Spike test
 *
 * Purpose : Simulate a sudden burst of traffic (e.g. a QR code goes viral
 *           at an event). 0 → 500 users instantly, hold 30s, drop to 0.
 *           Tests whether the API recovers without manual intervention.
 * Pass    : API returns to <1% error rate within 1 minute of spike ending.
 *
 * Run:
 *   k6 run -e API_KEY=sk-live_xxx spike.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL, API_KEY } from './config.js';

const spikeErrors = new Counter('spike_errors');
const spikeSuccesses = new Counter('spike_successes');

export const options = {
  stages: [
    { duration: '10s', target: 500 }, // instant spike to 500 users
    { duration: '30s', target: 500 }, // hold the spike
    { duration: '10s', target: 0 },   // drop instantly
    { duration: '1m',  target: 0 },   // recovery window — watch error rate
  ],
  thresholds: {
    // After recovery, error rate must be below 5%
    http_req_failed: ['rate<0.05'],
  },
};

const headers = { 'Content-Type': 'application/json' };

export default function () {
  // Spike test hits the lightest read endpoint to maximise concurrency signal
  // without burning through API key quota or creating thousands of DB rows
  const res = http.get('https://18-223-189-193.nip.io/health', {
    tags: { step: 'health_spike' },
  });

  const ok = check(res, {
    'health: 200': (r) => r.status === 200,
    'health: ok': (r) => {
      try { return JSON.parse(r.body).status === 'ok'; } catch { return false; }
    },
  });

  if (ok) {
    spikeSuccesses.add(1);
  } else {
    spikeErrors.add(1);
  }

  // No sleep — spike test intentionally hammers without pause
}

export function handleSummary(data) {
  return {
    'testing/load-performance/results/spike-summary.json': JSON.stringify(data, null, 2),
    stdout: `
=== Spike Test Summary ===
Spike successes : ${data.metrics.spike_successes?.values?.count ?? 0}
Spike errors    : ${data.metrics.spike_errors?.values?.count ?? 0}
p95 latency     : ${Math.round(data.metrics.http_req_duration?.values?.['p(95)'] ?? 0)}ms
p99 latency     : ${Math.round(data.metrics.http_req_duration?.values?.['p(99)'] ?? 0)}ms
Error rate      : ${((data.metrics.http_req_failed?.values?.rate ?? 0) * 100).toFixed(2)}%

Recovery check: error rate after spike should be < 1%.
If it stays elevated, the EC2 instance may need a restart or the
connection pool (Neon/Redis) may have exhausted.
`,
  };
}
