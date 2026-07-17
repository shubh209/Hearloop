// hearloop/apps/api/src/lib/db-ssl.ts

import type { PoolConfig } from "pg";

// Neon presents a valid CA-signed cert, so production must verify it.
export function buildSslConfig(nodeEnv: string | undefined): PoolConfig["ssl"] {
  return nodeEnv === "production" ? { rejectUnauthorized: true } : false;
}
