// hearloop/apps/api/src/lib/create-api-key.ts

import { createHash, randomBytes, randomUUID } from "crypto";
import type { Kysely } from "kysely";
import { db } from "./db";
import type { Database } from "./db";

export type ApiKeyType = "secret" | "public";

type ApiKeyInsertDatabase = Pick<Kysely<Database>, "insertInto">;

function createApiKeyMaterial(type: ApiKeyType) {
  const prefix = type === "secret" ? "sk-live_" : "pk-live_";
  const rawKey = `${prefix}${randomBytes(24).toString("hex")}`;
  return {
    rawKey,
    keyPrefix: rawKey.slice(0, 12),
    keyHash: createHash("sha256").update(rawKey).digest("hex"),
    keyId: randomUUID(),
  };
}

async function insertApiKey(
  database: ApiKeyInsertDatabase,
  partnerId: string,
  type: ApiKeyType
): Promise<{ rawKey: string; keyPrefix: string; keyId: string }> {
  const { rawKey, keyPrefix, keyHash, keyId } = createApiKeyMaterial(type);

  await database
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

export async function createApiKeyForPartner(
  partnerId: string,
  type: ApiKeyType
): Promise<{ rawKey: string; keyPrefix: string; keyId: string }> {
  return insertApiKey(db, partnerId, type);
}

export async function rotateApiKeyForPartner(
  partnerId: string,
  type: ApiKeyType
): Promise<{ rawKey: string; keyPrefix: string; keyId: string }> {
  return db.transaction().execute(async (trx) => {
    await trx
      .updateTable("api_keys")
      .set({ revoked_at: new Date() })
      .where("partner_id", "=", partnerId)
      .where("type", "=", type)
      .where("revoked_at", "is", null)
      .execute();

    return insertApiKey(trx, partnerId, type);
  });
}
