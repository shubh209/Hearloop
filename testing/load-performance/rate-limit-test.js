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
 *   - Temporarily sets RATE_LIMIT_MAX=10 and RATE_LIMIT_WINDOW_MS=5000 (5s)
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

// Test rate limit settings — small enough to test quickly
const TEST_MAX = 10;
const TEST_WINDOW_MS = 8000; // 8 seconds — enough time to send 10 requests cleanly

// ── Helpers ───────────────────────────────────────────────────────────────────

function ssh(cmd) {
  return execSync(
    `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ${EC2_HOST} "${cmd}"`,
    { encoding: 'utf8', timeout: 30000 }
  ).trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + (urlObj.search || ''),
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: false,
    };

    const req = https.request(reqOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function post(url, body, headers = {}) {
  const data = JSON.stringify(body);
  return request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), ...headers },
    body: data,
  });
}

// Send N requests in sequence, return array of status codes
async function sendRequests(n, url, body, headers = {}, delayMs = 100) {
  const statuses = [];
  for (let i = 0; i < n; i++) {
    const res = await post(url, body, headers);
    statuses.push(res.status);
    if (delayMs > 0) await sleep(delayMs);
  }
  return statuses;
}

// ── EC2 env management ────────────────────────────────────────────────────────

function setRateLimitOnEC2(max, windowMs) {
  console.log(`  Setting RATE_LIMIT_MAX=${max} RATE_LIMIT_WINDOW_MS=${windowMs} on EC2...`);
  // Update .env file
  ssh(`sed -i '/RATE_LIMIT_MAX/d' /home/ec2-user/.env && echo 'RATE_LIMIT_MAX=${max}' >> /home/ec2-user/.env`);
  ssh(`sed -i '/RATE_LIMIT_WINDOW_MS/d' /home/ec2-user/.env && echo 'RATE_LIMIT_WINDOW_MS=${windowMs}' >> /home/ec2-user/.env`);
  // Restart container to pick up new env
  ssh('docker restart hearloop-api');
  console.log('  Waiting 10s for container to restart...');
}

function restoreRateLimitOnEC2() {
  console.log('  Restoring RATE_LIMIT_MAX=100 and removing RATE_LIMIT_WINDOW_MS...');
  ssh(`sed -i '/RATE_LIMIT_MAX/d' /home/ec2-user/.env && echo 'RATE_LIMIT_MAX=100' >> /home/ec2-user/.env`);
  ssh(`sed -i '/RATE_LIMIT_WINDOW_MS/d' /home/ec2-user/.env`);
  ssh('docker restart hearloop-api');
  console.log('  Waiting 10s for container to restart...');
}

async function waitForHealthy(maxWaitMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await request(HEALTH_URL);
      if (res.status === 200 && res.body?.status === 'ok') return true;
    } catch {}
    await sleep(1000);
  }
  throw new Error('API did not become healthy within timeout');
}

// ── Test runner ───────────────────────────────────────────────────────────────

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

async function runTests(apiKey1, apiKey2) {
  const createTokenUrl = `${BASE_URL}/public/sessions/create-token`;

  // ── Test 1: API key bucket — allows exactly MAX requests ──────────────────
  console.log('\n  Test 1: API key bucket allows exactly MAX requests');
  const statuses1 = await sendRequests(
    TEST_MAX,
    createTokenUrl,
    { apiKey: apiKey1 },
    {},
    150 // 150ms between requests — well within the 8s window
  );
  const allPassed = statuses1.every((s) => s === 200);
  assert(allPassed, `First ${TEST_MAX} requests all return 200 (got: ${statuses1.join(',')})`);

  // ── Test 2: (MAX+1)th request returns 429 ─────────────────────────────────
  console.log('\n  Test 2: (MAX+1)th request returns 429');
  const res429 = await post(createTokenUrl, { apiKey: apiKey1 });
  assert(res429.status === 429, `Request ${TEST_MAX + 1} returns 429 (got: ${res429.status})`);
  assert(
    res429.body?.statusCode === 429 || res429.body?.error === 'Too Many Requests',
    `Response body indicates rate limit (got: ${JSON.stringify(res429.body)})`
  );

  // ── Test 3: Window reset — wait for window to expire, then retry ──────────
  console.log(`\n  Test 3: Window resets after ${TEST_WINDOW_MS}ms`);
  console.log(`    Waiting ${TEST_WINDOW_MS + 1000}ms for window to expire...`);
  await sleep(TEST_WINDOW_MS + 1000);

  const resAfterReset = await post(createTokenUrl, { apiKey: apiKey1 });
  assert(resAfterReset.status === 200, `Request succeeds after window reset (got: ${resAfterReset.status})`);

  // ── Test 4: Key isolation — two keys have independent buckets ─────────────
  console.log('\n  Test 4: Two API keys have independent rate limit buckets');

  // Exhaust key1's bucket again
  await sendRequests(TEST_MAX, createTokenUrl, { apiKey: apiKey1 }, {}, 150);
  const key1Exhausted = await post(createTokenUrl, { apiKey: apiKey1 });
  assert(key1Exhausted.status === 429, `Key1 is rate limited after ${TEST_MAX} requests`);

  // Key2 should still work — it has its own bucket
  const key2Res = await post(createTokenUrl, { apiKey: apiKey2 });
  assert(key2Res.status === 200, `Key2 is NOT rate limited (independent bucket) (got: ${key2Res.status})`);

  // Wait for window to reset before IP test
  console.log(`\n    Waiting ${TEST_WINDOW_MS + 1000}ms for window reset before IP test...`);
  await sleep(TEST_WINDOW_MS + 1000);

  // ── Test 5: IP-based limiting for unauthenticated requests ────────────────
  console.log('\n  Test 5: IP-based rate limiting for unauthenticated public routes');
  // Send MAX requests with no auth (falls back to IP bucket)
  const ipStatuses = await sendRequests(
    TEST_MAX,
    createTokenUrl,
    { apiKey: 'invalid-key-triggers-ip-bucket' }, // invalid key → 401, but still counts against IP
    {},
    150
  );
  // All should get 401 (invalid key) but NOT 429 yet
  const noRateLimitYet = ipStatuses.every((s) => s === 401);
  assert(noRateLimitYet, `First ${TEST_MAX} unauthenticated requests return 401 not 429 (got: ${ipStatuses.join(',')})`);

  // The (MAX+1)th should be 429 (IP bucket exhausted)
  const ipRes429 = await post(createTokenUrl, { apiKey: 'invalid-key-triggers-ip-bucket' });
  assert(
    ipRes429.status === 429,
    `(MAX+1)th unauthenticated request returns 429 via IP bucket (got: ${ipRes429.status})`
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     Rate Limiter Correctness Tests       ║');
  console.log('╚══════════════════════════════════════════╝');

  // Load test keys
  if (!fs.existsSync(KEYS_FILE)) {
    console.error('test-keys.json not found. Run setup-test-partners.js first.');
    process.exit(1);
  }
  const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  if (keys.length < 2) {
    console.error('Need at least 2 test partners in test-keys.json for isolation test.');
    process.exit(1);
  }
  const [key1, key2] = keys;
  console.log(`\nUsing partners: ${key1.email} and ${key2.email}`);

  // Set test rate limit on EC2
  console.log('\n── Setting up EC2 rate limit config ──');
  setRateLimitOnEC2(TEST_MAX, TEST_WINDOW_MS);
  await sleep(10000);
  await waitForHealthy();
  console.log('  ✅ API healthy with test rate limit config');

  let testError = null;
  try {
    await runTests(key1.apiKey, key2.apiKey);
  } catch (err) {
    testError = err;
    console.error('\n  ❌ Unexpected error during tests:', err.message);
  } finally {
    // Always restore — even if tests fail
    console.log('\n── Restoring EC2 rate limit config ──');
    restoreRateLimitOnEC2();
    await sleep(10000);
    await waitForHealthy();
    console.log('  ✅ API healthy with restored rate limit (100/min)');
  }

  // Results
  console.log('\n╔══════════════════════════════════════════╗');
  console.log(`║  Results: ${passed} passed, ${failed} failed${' '.repeat(28 - String(passed).length - String(failed).length)}║`);
  console.log('╚══════════════════════════════════════════╝');

  if (testError || failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
