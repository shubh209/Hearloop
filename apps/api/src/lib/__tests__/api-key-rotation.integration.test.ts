import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../db";
import { createApiKeyRotator } from "../create-api-key";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const PARTNER_ID = "00000000-0000-4000-8000-000000000032";
const INITIAL_KEY_ID = "00000000-0000-4000-8000-000000000033";
const ROTATOR_A = "hearloop-task2-rotator-a";
const ROTATOR_B = "hearloop-task2-rotator-b";

const integrationTest = TEST_DATABASE_URL ? test : test.skip;
let coordinator: Kysely<Database> | undefined;
let observer: Kysely<Database> | undefined;
let rotatorA: Kysely<Database> | undefined;
let rotatorB: Kysely<Database> | undefined;

function createDatabase(applicationName: string) {
  if (!TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required");
  return new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: TEST_DATABASE_URL,
        application_name: applicationName,
        max: 1,
      }),
    }),
  });
}

async function waitUntilRotatorsAreBlocked() {
  if (!observer) throw new Error("integration observer is required");

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const blocked = await sql<{ application_name: string }>`
      select application_name
      from pg_stat_activity
      where datname = current_database()
        and application_name in (${ROTATOR_A}, ${ROTATOR_B})
        and state = 'active'
        and wait_event_type = 'Lock'
    `.execute(observer);

    if (new Set(blocked.rows.map((row) => row.application_name)).size === 2) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("both PostgreSQL rotations did not block on the controlled race");
}

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;

  coordinator = createDatabase("hearloop-task2-coordinator");
  observer = createDatabase("hearloop-task2-observer");
  rotatorA = createDatabase(ROTATOR_A);
  rotatorB = createDatabase(ROTATOR_B);

  await sql`
    insert into partners (id, name)
    values (${PARTNER_ID}, 'Atomic secret rotation integration Partner')
  `.execute(coordinator);
});

beforeEach(async () => {
  await coordinator
    ?.deleteFrom("api_keys")
    .where("partner_id", "=", PARTNER_ID)
    .execute();
  await coordinator
    ?.insertInto("api_keys")
    .values({
      id: INITIAL_KEY_ID,
      partner_id: PARTNER_ID,
      type: "secret",
      key_prefix: "sk-live_seed",
      key_hash: "seed-hash",
      last_used_at: null,
      revoked_at: null,
      created_at: new Date(),
    })
    .execute();
});

afterAll(async () => {
  if (coordinator) {
    await coordinator
      .deleteFrom("partners")
      .where("id", "=", PARTNER_ID)
      .execute();
  }
  await Promise.all([
    rotatorA?.destroy(),
    rotatorB?.destroy(),
    observer?.destroy(),
    coordinator?.destroy(),
  ]);
});

integrationTest(
  "leaves one active secret when two PostgreSQL rotations contend",
  async () => {
    if (!coordinator || !rotatorA || !rotatorB) {
      throw new Error("TEST_DATABASE_URL is required");
    }

    let pendingRotations: Promise<unknown[]> | undefined;
    await coordinator.transaction().execute(async (transaction) => {
      await transaction
        .selectFrom("partners")
        .select("id")
        .where("id", "=", PARTNER_ID)
        .forUpdate()
        .executeTakeFirstOrThrow();

      pendingRotations = Promise.all([
        createApiKeyRotator(rotatorA)(PARTNER_ID, "secret"),
        createApiKeyRotator(rotatorB)(PARTNER_ID, "secret"),
      ]);

      await waitUntilRotatorsAreBlocked();
    });

    await pendingRotations;
    const activeSecrets = await coordinator
      .selectFrom("api_keys")
      .selectAll()
      .where("partner_id", "=", PARTNER_ID)
      .where("type", "=", "secret")
      .where("revoked_at", "is", null)
      .execute();

    expect(activeSecrets).toHaveLength(1);
  }
);
