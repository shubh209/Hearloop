// hearloop/apps/api/src/lib/hash-api-key.ts

import { createHash } from "crypto";

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey).digest("hex");
}
