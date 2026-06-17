// hearloop/apps/api/src/lib/lookup-api-key.ts

import { db } from "./db";
import { hashApiKey } from "./hash-api-key";
import type { ApiKeyType } from "./create-api-key";

export interface PartnerFromKey {
  keyId: string;
  partnerId: string;
  name: string;
  webhookUrl: string | null;
  allowedOrigins: string | null;
  businessContext: string | null;
  keyType: ApiKeyType;
}

export async function lookupPartnerByApiKey(
  rawKey: string,
  options: { allowedTypes?: ApiKeyType[] } = {}
): Promise<PartnerFromKey | null> {
  const allowedTypes = options.allowedTypes ?? ["secret", "public"];
  const keyHash = hashApiKey(rawKey);

  const row = await db
    .selectFrom("api_keys")
    .innerJoin("partners", "partners.id", "api_keys.partner_id")
    .select([
      "api_keys.id as keyId",
      "api_keys.partner_id as partnerId",
      "api_keys.type as keyType",
      "partners.name",
      "partners.status",
      "partners.webhook_url",
      "partners.allowed_origins",
      "partners.business_context",
    ])
    .where("api_keys.key_hash", "=", keyHash)
    .where("api_keys.revoked_at", "is", null)
    .where("partners.status", "=", "active")
    .executeTakeFirst();

  if (!row) return null;

  const keyType = (row.keyType ?? "secret") as ApiKeyType;
  if (!allowedTypes.includes(keyType)) return null;

  await db
    .updateTable("api_keys")
    .set({ last_used_at: new Date() })
    .where("id", "=", row.keyId)
    .execute();

  return {
    keyId: row.keyId,
    partnerId: row.partnerId,
    name: row.name,
    webhookUrl: row.webhook_url,
    allowedOrigins: row.allowed_origins,
    businessContext: row.business_context ?? null,
    keyType,
  };
}

export function parseAllowedOrigins(allowedOrigins: string | null): string[] {
  if (!allowedOrigins) return [];
  return allowedOrigins
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
}

export function isOriginAllowed(
  allowedOrigins: string | null,
  requestOrigin: string | undefined
): boolean {
  const allowed = parseAllowedOrigins(allowedOrigins);
  if (allowed.length === 0) return false;
  if (!requestOrigin) return false;
  return allowed.includes(requestOrigin);
}
