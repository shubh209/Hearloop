import type { Kysely } from "kysely";
import type { Database } from "../db";
import { createSessionCreateTokenClaimer } from "../session-create-token";

const TOKEN = "a".repeat(64);
const NOW = new Date("2026-08-24T12:00:00.000Z");

type ClaimDatabase = Pick<Kysely<Database>, "updateTable">;

function createStatefulDatabase() {
  const row = {
    partner_id: "partner-a",
    token: TOKEN,
    expires_at: new Date("2026-08-24T12:10:00.000Z"),
    used_at: null as Date | null,
  };

  const database = {
    updateTable: jest.fn(() => {
      const conditions: Array<[string, string, unknown]> = [];
      const query = {
        set(values: { used_at: Date }) {
          query.values = values;
          return query;
        },
        where(column: string, operator: string, value: unknown) {
          conditions.push([column, operator, value]);
          return query;
        },
        returning() {
          return query;
        },
        async executeTakeFirst() {
          const matches = conditions.every(([column, operator, value]) => {
            if (column === "token" && operator === "=") {
              return row.token === value;
            }
            if (column === "used_at" && operator === "is") {
              return row.used_at === value;
            }
            if (column === "expires_at" && operator === ">") {
              return row.expires_at > (value as Date);
            }
            return false;
          });

          if (!matches) return undefined;

          row.used_at = query.values.used_at;
          return { partner_id: row.partner_id };
        },
        values: { used_at: NOW },
      };

      return query;
    }),
  } as unknown as ClaimDatabase;

  return { database, row };
}

describe("Session-create token claims", () => {
  it("allows exactly one winner when two requests race for the same token", async () => {
    const { database, row } = createStatefulDatabase();
    const claimSessionCreateToken = createSessionCreateTokenClaimer(database);

    const results = await Promise.all([
      claimSessionCreateToken(TOKEN, NOW),
      claimSessionCreateToken(TOKEN, NOW),
    ]);

    expect(results.filter(Boolean)).toEqual([{ partnerId: "partner-a" }]);
    expect(row.used_at).toEqual(NOW);
  });
});
