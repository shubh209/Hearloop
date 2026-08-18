import { sql } from "kysely";
import { db } from "./db";
import type { InsightsQueryFilters } from "./parse-insights-query";

export async function countInsightsSessions(
  partnerId: string,
  filters: InsightsQueryFilters
): Promise<number> {
  const row = await db
    .selectFrom("sessions")
    .select(sql<string>`count(sessions.id)`.as("count"))
    .where("sessions.partner_id", "=", partnerId)
    .where("sessions.status", "=", "completed")
    .where("sessions.upload_protocol", "=", "versioned-v1")
    .where("sessions.created_at", ">=", filters.from!)
    .where("sessions.created_at", "<", filters.to!)
    .$if(!!filters.sentiment, (qb) =>
      qb
        .leftJoin("analyses", "analyses.session_id", "sessions.id")
        .where("analyses.sentiment_label", "=", filters.sentiment!)
    )
    .$if(!!filters.targetKey, (qb) =>
      qb.where(
        sql`(sessions.metadata_json::jsonb -> 'target' ->> 'key')`,
        "=",
        filters.targetKey!
      )
    )
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}
