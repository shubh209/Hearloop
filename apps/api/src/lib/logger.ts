// hearloop/apps/api/src/lib/logger.ts
// Shared Pino logger for job workers (outside Fastify request context).
// Fastify's own logger handles HTTP request logs — this covers async pipeline jobs.

import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "hearloop-api" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function jobLogger(job: string) {
  return logger.child({ job });
}
