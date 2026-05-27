/**
 * setup-test-partners.js
 *
 * Registers N test partner accounts and writes their API keys to
 * test-keys.csv so load.js can assign one key per VU.
 *
 * Run ONCE before load.js:
 *   node setup-test-partners.js
 *
 * Output: testing/load-performance/test-keys.csv
 *
 * To clean up test partners afterwards, run:
 *   node cleanup-test-partners.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://18-223-189-193.nip.io/v1';
const NUM_PARTNERS = 200;
const OUTPUT_FILE = path.join(__dirname, 'test-keys.json');
const CONCURRENCY = 10; // register 10 at a time to avoid overwhelming the API

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
      rejectUnauthorized: false, // nip.io uses self-signed cert
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

async function registerPartner(index) {
  const email = `loadtest-${index}@hearloop-test.io`;
  const res = await post(`${BASE_URL}/partners/register`, {
    name: `Load Test Partner ${index}`,
    email,
    password: 'loadtest123',
  });

  if (res.status === 201) {
    return { email, apiKey: res.body.apiKey, partnerId: res.body.partnerId };
  } else if (res.status === 409) {
    // Already exists — log in to get the key prefix (can't recover full key)
    // For simplicity, skip already-registered partners
    console.warn(`  ⚠️  Partner ${index} already registered — skipping`);
    return null;
  } else {
    console.error(`  ❌ Partner ${index} failed: ${JSON.stringify(res.body)}`);
    return null;
  }
}

async function main() {
  console.log(`Registering ${NUM_PARTNERS} test partners (${CONCURRENCY} at a time)...`);

  const keys = [];
  const indices = Array.from({ length: NUM_PARTNERS }, (_, i) => i + 1);

  // Process in batches of CONCURRENCY
  for (let i = 0; i < indices.length; i += CONCURRENCY) {
    const batch = indices.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(registerPartner));
    for (const r of results) {
      if (r) keys.push(r);
    }
    process.stdout.write(`\r  Progress: ${Math.min(i + CONCURRENCY, NUM_PARTNERS)}/${NUM_PARTNERS}`);
    // Small delay between batches to respect rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n\nRegistered ${keys.length} partners.`);

  if (keys.length === 0) {
    console.error('No keys generated — check the API is reachable.');
    process.exit(1);
  }

  // Write JSON — one object per partner, easy to inspect and load in k6
  const json = JSON.stringify(keys, null, 2);
  fs.writeFileSync(OUTPUT_FILE, json);
  console.log(`✅ Keys written to: ${OUTPUT_FILE}`);
  console.log(`   Run the load test with: k6 run testing/load-performance/load.js`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
