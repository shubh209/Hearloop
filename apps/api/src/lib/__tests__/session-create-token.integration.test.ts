import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import type { Database } from "../db";
import { createSessionCreateTokenClaimer } from "../session-create-token";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const PARTNER_ID = "00000000-0000-4000-8000-000000000031";
const TOKEN = "b".repeat(64);
const NOW = new Date("2026-08-24T12:00:00.000Z");

const integrationTest = TEST_DATABASE_URL ? test : test.skip;
let database: Kysely<Database> | undefined;

beforeAll(async () => {
  if (!TEST_DATABASE_URL) return;

  database = new Kysely<Database>({
    dialect: new PostgresDialect({
      pool: new Pool({ connectionString: TEST_DATABASE_URL, max: 4 }),
    }),
  });

  await database
    .insertInto("partners")
    .values({ id: PARTNER_ID, name: "Atomic claim integration Partner" })
    .execute();
  await database
    .insertInto("session_create_tokens")
    .values({
      partner_id: PARTNER_ID,
      token: TOKEN,
      expires_at: new Date("2026-08-24T12:10:00.000Z"),
      used_at: null,
    })
    .execute();
});

afterAll(async () => {
  if (!database) return;
  await database.deleteFrom("partners").where("id", "=", PARTNER_ID).execute();
  await database.destroy();
});

integrationTest(
  "persists exactly one claim when two PostgreSQL transactions race",
  async () => {
    if (!database) throw new Error("TEST_DATABASE_URL is required");
    const claimSessionCreateToken = createSessionCreateTokenClaimer(database);

    const results = await Promise.all([
      claimSessionCreateToken(TOKEN, NOW),
      claimSessionCreateToken(TOKEN, NOW),
    ]);

    const persisted = await database
      .selectFrom("session_create_tokens")
      .select(({ fn }) => fn.countAll<number>().as("count"))
      .where("token", "=", TOKEN)
      .where("used_at", "is not", null)
      .executeTakeFirstOrThrow();

    expect(results.filter(Boolean)).toEqual([{ partnerId: PARTNER_ID }]);
    expect(Number(persisted.count)).toBe(1);
    await expect(
      sql<Date>`select used_at from session_create_tokens where token = ${TOKEN}`.execute(
        database
      )
    ).resolves.toMatchObject({ rows: [{ used_at: NOW }] });
  }
);
