import type { Kysely } from "kysely";
import { db } from "./db";
import type { Database } from "./db";

type SessionCreateTokenDatabase = Pick<Kysely<Database>, "updateTable">;

export function createSessionCreateTokenClaimer(
  database: SessionCreateTokenDatabase = db
) {
  return async (token: string, now: Date) => {
    const claimed = await database
      .updateTable("session_create_tokens")
      .set({ used_at: now })
      .where("token", "=", token)
      .where("used_at", "is", null)
      .where("expires_at", ">", now)
      .returning("partner_id")
      .executeTakeFirst();

    return claimed ? { partnerId: claimed.partner_id } : null;
  };
}

export const claimSessionCreateToken = createSessionCreateTokenClaimer();
