import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../db";
import { createSessionCreateTokenClaimer } from "../session-create-token";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const PARTNER_ID = "00000000-0000-4000-8000-000000000031";
const TOKEN = "b".repeat(64);
const NOW = new Date("2026-08-24T12:00:00.000Z");
const CLAIMANT_A = "hearloop-task3-claimant-a";
const CLAIMANT_B = "hearloop-task3-claimant-b";

type ClaimResult = { partnerId: string } | null;
type Claim = (token: string, now: Date) => Promise<ClaimResult>;

const integrationTest = TEST_DATABASE_URL ? test : test.skip;
let coordinator: Kysely<Database> | undefined;
let observer: Kysely<Database> | undefined;
let claimantA: Kysely<Database> | undefined;
let claimantB: Kysely<Database> | undefined;

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

async function waitUntilBothClaimantsAreBlocked() {
  if (!observer) throw new Error("integration observer is required");

  for (let attempt = 0; attempt < 250; attempt += 1) {
    const blocked = await sql<{ application_name: string }>`
      select application_name
      from pg_stat_activity
      where datname = current_database()
        and application_name in (${CLAIMANT_A}, ${CLAIMANT_B})
        and state = 'active'
        and wait_event_type = 'Lock'
    `.execute(observer);

    if (new Set(blocked.rows.map((row) => row.application_name)).size === 2) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error("both PostgreSQL claimant clients did not block on the row lock");
}

async function raceBehindTokenRowLock(claimA: Claim, claimB: Claim) {
  if (!coordinator) throw new Error("integration coordinator is required");
  let pendingClaims: Promise<[ClaimResult, ClaimResult]> | undefined;

  await coordinator.transaction().execute(async (transaction) => {
    await transaction
      .selectFrom("session_create_tokens")
      .select("id")
      .where("token", "=", TOKEN)
      .forUpdate()
      .executeTakeFirstOrThrow();

    pendingClaims = Promise.all([
      claimA(TOKEN, NOW),
      claimB(TOKEN, NOW),
    ]);

    await waitUntilBothClaimantsAreBlocked();
  });

  if (!pendingClaims) throw new Error("claimants were not started");
  return pendingClaims;
}

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;

  coordinator = createDatabase("hearloop-task3-coordinator");
  observer = createDatabase("hearloop-task3-observer");
  claimantA = createDatabase(CLAIMANT_A);
  claimantB = createDatabase(CLAIMANT_B);

  await sql`
    insert into partners (id, name)
    values (${PARTNER_ID}, 'Atomic claim integration Partner')
  `.execute(coordinator);
  await coordinator
    .insertInto("session_create_tokens")
    .values({
      partner_id: PARTNER_ID,
      token: TOKEN,
      expires_at: new Date("2026-08-24T12:10:00.000Z"),
      used_at: null,
    })
    .execute();
});

beforeEach(async () => {
  await coordinator
    ?.updateTable("session_create_tokens")
    .set({ used_at: null })
    .where("token", "=", TOKEN)
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
    claimantA?.destroy(),
    claimantB?.destroy(),
    observer?.destroy(),
    coordinator?.destroy(),
  ]);
});

integrationTest(
  "persists exactly one claim when two PostgreSQL clients contend on the token row",
  async () => {
    if (!coordinator || !claimantA || !claimantB) {
      throw new Error("TEST_DATABASE_URL is required");
    }

    const results = await raceBehindTokenRowLock(
      createSessionCreateTokenClaimer(claimantA),
      createSessionCreateTokenClaimer(claimantB)
    );

    const persisted = await coordinator
      .selectFrom("session_create_tokens")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("token", "=", TOKEN)
      .where("used_at", "is not", null)
      .executeTakeFirstOrThrow();

    expect(results.filter(Boolean)).toEqual([{ partnerId: PARTNER_ID }]);
    expect(Number(persisted.count)).toBe(1);
    await expect(
      sql<Date>`select used_at from session_create_tokens where token = ${TOKEN}`.execute(
        coordinator
      )
    ).resolves.toMatchObject({ rows: [{ used_at: NOW }] });
  }
);
