/**
 * generate-tokens.js
 *
 * Pre-generates a large pool of session-create tokens and writes them
 * to test-tokens.json. The load test reads this file so VUs skip the
 * rate-limited create-token step entirely.
 *
 * Each token is single-use. The pool must be large enough to cover all
 * VU iterations across the full test duration:
 *   200 VUs × ~1 session/8s × 420s (7 min) ≈ 10,500 iterations max
 *   We generate 2,000 tokens as a practical ceiling (rate limit allows ~85/min)
 *
 * Tokens are valid for 10 minutes — run this immediately before load.js.
 *
 * Run:
 *   node generate-tokens.js [count]   (default: 500)
 *
 * Output: testing/load-performance/test-tokens.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://18-223-189-193.nip.io/v1';
const KEYS_FILE = path.join(__dirname, 'test-keys.json');
const OUTPUT_FILE = path.join(__dirname, 'test-tokens.json');

// How many tokens to generate — default 500, pass as CLI arg to override
const COUNT = parseInt(process.argv[2] || '500', 10);

// 700ms between requests — stays well under 100 req/min (max ~85/min)
const DELAY_MS = 700;

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      rejectUnauthorized: false,
    };

    const req = https.request(options, (res) => {
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
    req.write(data);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  if (!fs.existsSync(KEYS_FILE)) {
    console.error('test-keys.json not found. Run setup-test-partners.js first.');
    process.exit(1);
  }

  const keys = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));

  // ── Step 1: Wipe stale tokens from DB and local file ─────────────────────
  console.log('Cleaning up stale tokens from previous runs...');

  // Delete all expired or used tokens from the DB for test partners only
  const partnerIds = keys.map((k) => `'${k.partnerId}'`).join(',');
  const deleteRes = await new Promise((resolve, reject) => {
    const { Client } = require('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    client.connect()
      .then(() => client.query(
        `DELETE FROM session_create_tokens
         WHERE partner_id = ANY(ARRAY[${partnerIds}]::uuid[])
           AND (expires_at < NOW() OR used_at IS NOT NULL)`
      ))
      .then((r) => { client.end(); resolve(r.rowCount); })
      .catch((e) => { client.end(); reject(e); });
  }).catch((err) => {
    // Non-fatal — DB cleanup failure shouldn't block token generation
    console.warn(`  ⚠️  DB cleanup failed (non-fatal): ${err.message}`);
    return 0;
  });

  console.log(`  ✅ Deleted ${deleteRes} stale tokens from DB`);

  // Remove stale local file so k6 can't accidentally load old tokens
  if (fs.existsSync(OUTPUT_FILE)) {
    fs.unlinkSync(OUTPUT_FILE);
    console.log(`  ✅ Removed stale ${path.basename(OUTPUT_FILE)}`);
  }

  console.log();
  console.log(`Generating ${COUNT} session-create tokens (cycling across ${keys.length} partners)...`);
  console.log(`Delay: ${DELAY_MS}ms between requests (~85 req/min, under the 100/min limit).`);
  console.log(`Estimated time: ~${Math.ceil((COUNT * DELAY_MS) / 60000)} minutes\n`);

  const tokens = [];
  const failed = [];

  for (let i = 0; i < COUNT; i++) {
    // Cycle through keys so no single partner gets hammered
    const { email, apiKey, partnerId } = keys[i % keys.length];

    const res = await post(`${BASE_URL}/public/sessions/create-token`, { apiKey });

    if (res.status === 200 && res.body.sessionCreateToken) {
      tokens.push({
        email,
        partnerId,
        sessionCreateToken: res.body.sessionCreateToken,
        expiresIn: res.body.expiresIn,
      });
      process.stdout.write(`\r  ✅ ${i + 1}/${COUNT} tokens generated`);
    } else {
      failed.push({ email, status: res.status, error: JSON.stringify(res.body) });
      process.stdout.write(`\r  ❌ ${i + 1}/${COUNT} — ${email} failed (${res.status})`);
    }

    if (i < COUNT - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`\n\nGenerated : ${tokens.length} tokens`);
  if (failed.length > 0) {
    console.warn(`Failed    : ${failed.length}`);
    failed.forEach((f) => console.warn(`  ${f.email}: ${f.error}`));
  }

  if (tokens.length === 0) {
    console.error('No tokens generated — aborting.');
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(tokens, null, 2));
  console.log(`\n✅ ${tokens.length} tokens written to: ${OUTPUT_FILE}`);
  console.log(`   Tokens expire in ~${tokens[0]?.expiresIn}s — run load.js immediately.`);
  console.log(`\n   k6 run testing/load-performance/load.js`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
