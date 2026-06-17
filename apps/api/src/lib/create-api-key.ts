// hearloop/apps/api/src/lib/create-api-key.ts

import { createHash, randomBytes, randomUUID } from "crypto";
import { db } from "./db";

export type ApiKeyType = "secret" | "public";

export async function createApiKeyForPartner(
  partnerId: string,
  type: ApiKeyType
): Promise<{ rawKey: string; keyPrefix: string; keyId: string }> {
  const prefix = type === "secret" ? "sk-live_" : "pk-live_";
  const rawKey = `${prefix}${randomBytes(24).toString("hex")}`;
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 12);
  const keyId = randomUUID();

  await db
    .insertInto("api_keys")
    .values({
      id: keyId,
      partner_id: partnerId,
      type,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      last_used_at: null,
      revoked_at: null,
      created_at: new Date(),
    })
    .execute();

  return { rawKey, keyPrefix, keyId };
}
