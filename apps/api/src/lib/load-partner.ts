// hearloop/apps/api/src/lib/load-partner.ts

import { db } from "./db";

export interface PartnerContext {
  id: string;
  name: string;
  webhookUrl: string | null;
  allowedOrigins: string | null;
  businessContext: string | null;
}

export async function loadPartnerById(
  partnerId: string
): Promise<PartnerContext | null> {
  const row = await db
    .selectFrom("partners")
    .select([
      "id",
      "name",
      "webhook_url",
      "allowed_origins",
      "business_context",
      "status",
    ])
    .where("id", "=", partnerId)
    .where("status", "=", "active")
    .executeTakeFirst();

  if (!row) return null;

  return {
    id: row.id,
    name: row.name,
    webhookUrl: row.webhook_url,
    allowedOrigins: row.allowed_origins,
    businessContext: row.business_context ?? null,
  };
}
