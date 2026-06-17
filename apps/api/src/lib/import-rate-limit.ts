// hearloop/apps/api/src/lib/import-rate-limit.ts
//
// Redis-backed rate limit for business-context import (3 per partner per hour).

import IORedis from "ioredis";

const REDIS_URL = process.env.REDIS_URL!;
const MAX_IMPORTS_PER_HOUR = Number(process.env.IMPORT_RATE_MAX_PER_HOUR ?? 3);
const WINDOW_SEC = 3600;

export class ImportRateLimitedError extends Error {
  readonly code = "rate_limited";

  constructor() {
    super("import rate limit exceeded");
    this.name = "ImportRateLimitedError";
  }
}

export async function assertImportRateLimit(partnerId: string): Promise<void> {
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const key = `hearloop:import-rate:${partnerId}`;

  try {
    const count = await conn.incr(key);
    if (count === 1) {
      await conn.expire(key, WINDOW_SEC);
    }
    if (count > MAX_IMPORTS_PER_HOUR) {
      throw new ImportRateLimitedError();
    }
  } finally {
    conn.disconnect();
  }
}
