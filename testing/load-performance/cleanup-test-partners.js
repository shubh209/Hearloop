/**
 * cleanup-test-partners.js
 *
 * Deletes all test partners created by setup-test-partners.js
 * by removing rows from the DB directly via the Neon connection string.
 *
 * Run after load testing is complete:
 *   node cleanup-test-partners.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const CSV_FILE = path.join(__dirname, 'test-keys.json');

async function main() {
  if (!fs.existsSync(CSV_FILE)) {
    console.log('No test-keys.json found — nothing to clean up.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(CSV_FILE, 'utf8'));
  const partnerIds = data.map((entry) => entry.partnerId).filter(Boolean);

  if (partnerIds.length === 0) {
    console.log('No partner IDs found in CSV.');
    return;
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log(`Deleting ${partnerIds.length} test partners...`);

  // Cascade deletes api_keys, sessions, analyses, webhook_deliveries
  const result = await client.query(
    `DELETE FROM partners WHERE id = ANY($1::uuid[])`,
    [partnerIds]
  );

  console.log(`✅ Deleted ${result.rowCount} partners.`);
  await client.end();

  // Remove the JSON file
  fs.unlinkSync(CSV_FILE);
  console.log('Removed test-keys.json.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
