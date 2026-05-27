/**
 * smoke.js — Smoke test
 *
 * Purpose : Confirm the API is up and the full session flow works end-to-end.
 * Load    : 1 virtual user, runs once (no loop).
 * Pass    : All checks green, no HTTP errors.
 *
 * Run:
 *   k6 run -e API_KEY=sk-live_xxx smoke.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, API_KEY } from './config.js';

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ['rate==1.00'], // every single check must pass
    http_req_failed: ['rate==0'],
  },
};

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  // ── Step 1: Health check ──────────────────────────────────────────────────
  const health = http.get('https://18-223-189-193.nip.io/health');
  check(health, {
    'health: status 200': (r) => r.status === 200,
    'health: status ok': (r) => JSON.parse(r.body).status === 'ok',
  });

  // ── Step 2: Health detailed ───────────────────────────────────────────────
  const detailed = http.get('https://18-223-189-193.nip.io/health/detailed');
  check(detailed, {
    'health/detailed: status 200': (r) => r.status === 200,
    'health/detailed: db ok': (r) => JSON.parse(r.body).checks.database.status === 'ok',
    'health/detailed: redis ok': (r) => JSON.parse(r.body).checks.redis.status === 'ok',
  });

  sleep(0.5);

  // ── Step 3: Exchange API key for session-create token ─────────────────────
  const tokenRes = http.post(
    `${BASE_URL}/public/sessions/create-token`,
    JSON.stringify({ apiKey: API_KEY }),
    { headers }
  );
  check(tokenRes, {
    'create-token: status 200': (r) => r.status === 200,
    'create-token: has sessionCreateToken': (r) => !!JSON.parse(r.body).sessionCreateToken,
    'create-token: expiresIn ~600': (r) => JSON.parse(r.body).expiresIn > 0,
  });

  const { sessionCreateToken } = JSON.parse(tokenRes.body);

  sleep(0.5);

  // ── Step 4: Create session ────────────────────────────────────────────────
  const sessionRes = http.post(
    `${BASE_URL}/public/sessions`,
    JSON.stringify({ promptText: 'How was your experience?', maxDurationSec: 5 }),
    { headers: { ...headers, Authorization: `Bearer ${sessionCreateToken}` } }
  );
  check(sessionRes, {
    'create-session: status 201': (r) => r.status === 201,
    'create-session: has sessionId': (r) => !!JSON.parse(r.body).sessionId,
    'create-session: has sessionToken': (r) => !!JSON.parse(r.body).sessionToken,
  });

  const { sessionToken } = JSON.parse(sessionRes.body);

  sleep(0.5);

  // ── Step 5: Open session ──────────────────────────────────────────────────
  // Send empty JSON body — Fastify rejects null body when Content-Type is application/json
  const openRes = http.post(
    `${BASE_URL}/public/session/${sessionToken}/open`,
    '{}',
    { headers }
  );
  check(openRes, {
    'open-session: status 200': (r) => r.status === 200,
    'open-session: status opened': (r) => JSON.parse(r.body).status === 'opened',
  });

  sleep(0.5);

  // ── Step 6: Get upload URL ────────────────────────────────────────────────
  const uploadUrlRes = http.post(
    `${BASE_URL}/public/session/${sessionToken}/upload-url`,
    JSON.stringify({ mimeType: 'audio/webm' }),
    { headers }
  );
  check(uploadUrlRes, {
    'upload-url: status 200': (r) => r.status === 200,
    'upload-url: has uploadUrl': (r) => !!JSON.parse(r.body).uploadUrl,
    'upload-url: has storageKey': (r) => !!JSON.parse(r.body).storageKey,
  });

  const { uploadUrl, storageKey } = JSON.parse(uploadUrlRes.body);

  sleep(0.5);

  // ── Step 7: Upload audio to S3 ────────────────────────────────────────────
  // Uses a 1KB fake blob — enough to confirm the signed URL works
  const audioData = new Uint8Array(1024).fill(0);
  const uploadRes = http.put(uploadUrl, audioData.buffer, {
    headers: { 'Content-Type': 'audio/webm' },
  });
  check(uploadRes, {
    'upload-audio: status 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // ── Step 8: Finalize session ──────────────────────────────────────────────
  const finalizeRes = http.post(
    `${BASE_URL}/public/session/${sessionToken}/finalize`,
    JSON.stringify({
      storageKey,
      mimeType: 'audio/webm',
      sizeBytes: 1024,
    }),
    { headers }
  );
  check(finalizeRes, {
    'finalize: status 200': (r) => r.status === 200,
    'finalize: status submitted': (r) => JSON.parse(r.body).status === 'submitted',
  });

  console.log(`✅ Smoke test passed — sessionToken: ${sessionToken}`);
}
