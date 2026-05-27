/**
 * rate-limit-test.js — Rate Limiter Correctness Test
 *
 * Tests that the rate limiter:
 *   1. Allows exactly MAX requests per window per API key
 *   2. Returns 429 on the (MAX+1)th request
 *   3. Resets correctly after the window expires
 *   4. Isolates buckets per API key (two keys don't share a bucket)
 *   5. Falls back to IP-based limiting for unauthenticated public routes
 *
 * Strategy:
 *   - Temporarily sets RATE_LIMIT_MAX=10 and RATE_LIMIT_WINDOW_MS=15000 (15s)
 *     on EC2 via SSH so tests run in seconds, not minutes
 *   - Restores original values when done (even on failure)
 *   - Uses two real API keys from test-keys.json for isolation test
 *
 * Prerequisites:
 *   - test-keys.json must exist (run setup-test-partners.js first)
 *   - SSH key at ~/.ssh/hearloop-key.pem
 *
 * Run:
 *   node testing/load-performance/rate-limit-test.js
 */

const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE_URL = 'https://18-223-189-193.nip.io/v1';
const HEALTH_URL = 'https://18-223-189-193.nip.io/health';
const EC2_HOST = 'ec2-user@18.223.189.193';
const SSH_KEY = path.join(process.env.HOME, '.ssh/hearloop-key.pem');
const KEYS_FILE = path.join(__dirname, 'test-keys.json');

const TEST_MAX = 10;
const TEST_WINDOW_MS = 15000; // 15 seconds

// ── SSH helper — writes to a temp script to avoid DOCKER_HOST env leaking ────
function ssh(cmd) {
  const tmpScript = `/tmp/hl-rate-test-${Date.now()}.sh`;
  fs.writeFileSync(tmpScript, `#!/bin/bash\n${cmd}\n`);
  try {
    return execSync(
      `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ${EC2_HOST} 'bash -s' < ${tmpScript}`,
      { encoding: 'utf8', timeout: 30000 }
    ).trim();
  } finally {
    try { fs.unlinkSync(tmpScript); } catch {}
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
function rawRequest(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const opts = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method,
      headers,
      rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function post(url, bodyObj, extraHeaders = {}) {
  const data = JSON.stringify(bodyObj);
  return rawRequest(url, 'POST', {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data),
    ...extraHeaders,
  }, data);
}

function get(url) {
  return rawRequest(url, 'GET', {}, null);
}

// Send N requests as fast as possible, return array of status codes
async function burst(n, fn) {
  const statuses = [];
  for (let i = 0; i < n; i++) {
    const res = await fn();
    statuses.push(res.status);
  }
  return statuses;
}

// ── EC2 container management ──────────────────────────────────────────────────
function applyEnvAndRestart(max, windowMs) {
  console.log(`  Setting RATE_LIMIT_MAX=${max} RATE_LIMIT_WINDOW_MS=${windowMs} on EC2...`);
  ssh(`sed -i '/RATE_LIMIT_MAX/d' /home/ec2-user/.env && echo 'RATE_LIMIT_MAX=${max}' >> /home/ec2-user/.env`);
  ssh(`sed -i '/RATE_LIMIT_WINDOW_MS/d' /home/ec2-user/.env && echo 'RATE_LIMIT_WINDOW_MS=${windowMs}' >> /home/ec2-user/.env`);
  ssh(`docker stop hearloop-api || true && docker rm hearloop-api || true && IMAGE=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep hearloop-api | head -1) && docker run -d --name hearloop-api --env-file /home/ec2-user/.env -p 3001:3001 --restart unless-stopped $IMAGE`);
}

function restoreEnvAndRestart() {
  console.log('  Restoring RATE_LIMIT_MAX=100, removing RATE_LIMIT_WINDOW_MS...');
  ssh(`sed -i '/RATE_LIMIT_MAX/d' /home/ec2-user/.env && echo 'RATE_LIMIT_MAX=100' >> /home/ec2-user/.env`);
  ssh(`sed -i '/RATE_LIMIT_WINDOW_MS/d' /home/ec2-user/.env`);
  ssh(`docker stop hearloop-api || true && docker rm hearloop-api || true && IMAGE=$(docker images --format '{{.Repository}}:{{.Tag}}' | grep hearloop-api | head -1) && docker run -d --name hearloop-api --env-file /home/ec2-user/.env -p 3001:3001 --restart unless-stopped $IMAGE`);
}

async function waitForHealthy(maxMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await get(HEALTH_URL);
      if (res.status === 200 && res.body?.status === 'ok') return;
    } catch {}
    await sleep(1000);
  }
  throw new Error('API did not become healthy within timeout');
}

// ── Assertions ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`    ✅ ${message}`);
    passed++;
  } else {
    console.error(`    ❌ FAIL: ${message}`);
    failed++;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────
async function runTests(apiKey1, apiKey2) {
  const tokenUrl = `${BASE_URL}/public/sessions/create-token`;

  // ── Test 1: API key bucket allows exactly MAX requests ────────────────────
  console.log('\n  Test 1: API key bucket allows exactly MAX requests');
  const t1 = await burst(TEST_MAX, () => post(tokenUrl, { apiKey: apiKey1 }));
  assert(t1.every((s) => s === 200), `All ${TEST_MAX} requests return 200 (got: ${t1.join(',')})`);

  // ── Test 2: (MAX+1)th request returns 429 ────────────────────────────────
  console.log('\n  Test 2: (MAX+1)th request returns 429');
  const t2 = await post(tokenUrl, { apiKey: apiKey1 });
  assert(t2.status === 429, `Request ${TEST_MAX + 1} returns 429 (got: ${t2.status})`);
  assert(
    t2.body?.statusCode === 429 || t2.body?.error === 'Too Many Requests',
    `Response body confirms rate limit (got: ${JSON.stringify(t2.body)})`
  );

  // ── Test 3: Window resets after TEST_WINDOW_MS ────────────────────────────
  console.log(`\n  Test 3: Window resets after ${TEST_WINDOW_MS}ms`);
  console.log(`    Waiting ${TEST_WINDOW_MS + 2000}ms...`);
  await sleep(TEST_WINDOW_MS + 2000);
  const t3 = await post(tokenUrl, { apiKey: apiKey1 });
  assert(t3.status === 200, `Request succeeds after window reset (got: ${t3.status})`);

  // ── Test 4: Key isolation — authenticated routes have independent buckets ──
  // NOTE: create-token is a PUBLIC endpoint — no Bearer token in the request,
  // so the keyGenerator falls back to req.ip for ALL create-token calls.
  // Key isolation only applies to AUTHENTICATED routes (Bearer token present).
  // We test isolation using POST /sessions which requires Bearer auth.
  console.log('\n  Test 4: Authenticated routes have independent rate limit buckets per API key');
  console.log(`    Waiting ${TEST_WINDOW_MS + 2000}ms for clean window...`);
  await sleep(TEST_WINDOW_MS + 2000);

  // First get session-create tokens for both keys (uses IP bucket — do sequentially)
  const tokenRes1 = await post(tokenUrl, { apiKey: apiKey1 });
  const tokenRes2 = await post(tokenUrl, { apiKey: apiKey2 });

  if (tokenRes1.status !== 200 || tokenRes2.status !== 200) {
    console.log(`    ⚠️  Could not get session tokens (${tokenRes1.status}, ${tokenRes2.status}) — skipping isolation test`);
    assert(false, 'Could not get session tokens for isolation test');
    return;
  }

  const sct1 = tokenRes1.body.sessionCreateToken;
  const sct2 = tokenRes2.body.sessionCreateToken;

  // Exhaust Key1's bucket on POST /public/sessions (authenticated with Bearer sct1)
  // The keyGenerator sees the Bearer token and uses sct1.slice(0,16) as the bucket key
  const sessUrl = `${BASE_URL}/public/sessions`;
  const sessBody = { promptText: 'rate limit test', maxDurationSec: 5 };

  // Send MAX requests with sct1 — exhausts sct1's bucket
  // Note: each token is single-use, so we need MAX tokens for Key1
  // Instead, test with the API key directly on an authenticated route
  // Use GET /sessions/:id with a fake UUID — returns 404 but still counts against the bucket
  const authUrl = `${BASE_URL}/sessions/00000000-0000-0000-0000-000000000000`;
  const t4k1 = await burst(TEST_MAX, () =>
    rawRequest(authUrl, 'GET', { Authorization: `Bearer ${apiKey1}` }, null)
  );
  // All should be 401 (invalid key for sessions route) or 404 — not 429 yet
  const k1NotRateLimited = t4k1.every((s) => s !== 429);
  assert(k1NotRateLimited, `Key1: first ${TEST_MAX} authenticated requests not rate limited (got: ${t4k1.join(',')})`);

  // (MAX+1)th with Key1 should be 429
  const t4k1last = await rawRequest(authUrl, 'GET', { Authorization: `Bearer ${apiKey1}` }, null);
  assert(t4k1last.status === 429, `Key1: (MAX+1)th request returns 429 (got: ${t4k1last.status})`);

  // Key2 with its own Bearer token should NOT be rate limited
  const t4k2 = await rawRequest(authUrl, 'GET', { Authorization: `Bearer ${apiKey2}` }, null);
  console.log(`    Key2 response: ${t4k2.status}`);
  assert(t4k2.status !== 429, `Key2 has independent bucket, not rate limited (got: ${t4k2.status})`);

  // ── Test 5: IP-based limiting for unauthenticated requests ────────────────
  // NOTE: /health is registered BEFORE the rate limit plugin in Fastify boot
  // order, so it is intentionally exempt. We use /v1/public/sessions/create-token
  // with no Authorization header — keyGenerator returns req.ip as fallback.
  console.log('\n  Test 5: IP-based rate limiting for unauthenticated public routes');
  console.log(`    Waiting ${TEST_WINDOW_MS + 2000}ms for clean window...`);
  await sleep(TEST_WINDOW_MS + 2000);

  // Send MAX requests with no Authorization header — falls back to IP bucket
  // These return 400 (missing apiKey) but still consume the IP rate limit counter
  const t5 = await burst(TEST_MAX, () =>
    rawRequest(tokenUrl, 'POST', { 'Content-Type': 'application/json', 'Content-Length': '2' }, '{}')
  );
  assert(t5.every((s) => s === 400), `First ${TEST_MAX} unauthenticated requests return 400 not 429 (got: ${t5.join(',')})`);

  // (MAX+1)th should be 429 — IP bucket exhausted
  const t5last = await rawRequest(tokenUrl, 'POST', { 'Content-Type': 'application/json', 'Content-Length': '2' }, '{}');
  assert(t5last.status === 429, `(MAX+1)th unauthenticated request returns 429 via IP bucket (got: ${t5last.status})`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Rate Limiter Correctness Tests       ║');
  console.log('╚══════════════════════════════════════════╝');

  if (!fs.existsSync(KEYS_FILE)) {
    console.error('test-keys.json not found. Run setup-test-partners.js first.');
    process.exit(1);
  }
  const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  if (keys.length < 2) {
    console.error('Need at least 2 test partners in test-keys.json.');
    process.exit(1);
  }
  const [key1, key2] = keys;
  console.log(`\nUsing: ${key1.email} and ${key2.email}`);

  console.log('\n── Setting up EC2 rate limit config ──');
  applyEnvAndRestart(TEST_MAX, TEST_WINDOW_MS);
  console.log('  Waiting 15s for container to start...');
  await sleep(15000);
  await waitForHealthy();
  console.log('  ✅ API healthy with test config');

  let testError = null;
  try {
    await runTests(key1.apiKey, key2.apiKey);
  } catch (err) {
    testError = err;
    console.error('\n  ❌ Unexpected error:', err.message);
  } finally {
    console.log('\n── Restoring EC2 rate limit config ──');
    restoreEnvAndRestart();
    console.log('  Waiting 15s for container to start...');
    await sleep(15000);
    await waitForHealthy();
    console.log('  ✅ API healthy with restored config (100/min)');
  }

  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(Math.max(0, 27 - String(passed).length - String(failed).length))}║`);
  console.log('╚══════════════════════════════════════════╝');

  if (testError || failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
