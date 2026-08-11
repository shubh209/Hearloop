// hearloop/apps/api/src/routes/health.ts
//
// GET /health/detailed — public, no-auth endpoint for load balancer health
// checks, on-call dashboards, and portfolio observability demonstrations.
//
// All four checks run concurrently via Promise.allSettled with a 10s timeout.
// Always returns HTTP 200 — "healthy" when all pass, "degraded" otherwise.
//
// Free-tier protection: this endpoint touches Redis (PING + queue counts), so
// uptime monitors polling it every minute would otherwise burn ~30K Upstash
// commands/day. The computed snapshot is cached for HEALTH_CACHE_TTL_MS (60s
// default) so Redis is hit at most once per minute regardless of poll rate.
// Cache is disabled under tests (NODE_ENV=test) and tunable via env.

import { FastifyInstance } from 'fastify';
import IORedis from 'ioredis';
import { db } from '../lib/db';
import { sql } from 'kysely';
import { getWaitingJobCounts } from '../lib/queue';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CheckStatus = 'ok' | 'error';

export interface CheckResult {
  status: CheckStatus;
  latencyMs?: number;
  error?: string;
}

export interface QueueDepths {
  validate: number;
  transcribe: number;
  analyze: number;
  webhooks: number;
}

export interface PipelineStats extends CheckResult {
  completionRate24h?: number;
  avgLatencyMs?: number | null;
  failedLast24h?: number;
}

export interface HealthResponse {
  status: 'healthy' | 'degraded';
  checks: {
    database: CheckResult;
    redis: CheckResult;
    queueDepths: QueueDepths | { status: 'error'; error: string };
    pipeline: PipelineStats;
  };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const HEALTH_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// withTimeout helper
// ---------------------------------------------------------------------------

/**
 * Race a promise against a timeout. If the promise does not resolve within
 * `ms` milliseconds, `fallback` is returned instead.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

// ---------------------------------------------------------------------------
// checkDatabase
// ---------------------------------------------------------------------------

/**
 * Ping the database with SELECT 1. Measures round-trip latency in both
 * success and error cases.
 */
export async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await db.executeQuery(sql`SELECT 1`.compile(db));
    return { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    return {
      status: 'error',
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ---------------------------------------------------------------------------
// checkRedis
// ---------------------------------------------------------------------------

/**
 * Verify Redis connectivity via PING on a short-lived IORedis connection.
 * Re-issues PING once if latency rounds to zero (cold connection).
 * Always disconnects in finally (best-effort).
 */
export async function checkRedis(): Promise<CheckResult> {
  const conn = new IORedis(process.env.REDIS_URL!, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  try {
    let start = Date.now();
    let response = await conn.ping();
    let latencyMs = Date.now() - start;

    if (latencyMs === 0) {
      start = Date.now();
      response = await conn.ping();
      latencyMs = Date.now() - start;
    }

    if (response !== 'PONG') {
      return { status: 'error', error: `unexpected PING response: ${response}` };
    }

    return { status: 'ok', latencyMs };
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    try { conn.disconnect(); } catch { /* best-effort */ }
  }
}

// ---------------------------------------------------------------------------
// checkQueues
// ---------------------------------------------------------------------------

/**
 * Fetch the waiting job count for all four BullMQ queues via a single
 * short-lived IORedis connection.
 *
 * We pass the explicit "waiting" type to getJobCounts so BullMQ issues ONE
 * Redis command per queue (LLEN). Calling it with no args counts every job
 * state (~8 commands per queue) — wasteful on Upstash's per-command free tier.
 */
export async function checkQueues(): Promise<QueueDepths | { status: 'error'; error: string }> {
  try {
    return await getWaitingJobCounts();
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// checkPipeline
// ---------------------------------------------------------------------------

/**
 * Query sessions table for last 24h: completion rate, avg latency, failed count.
 */
export async function checkPipeline(): Promise<PipelineStats> {
  try {
    const row = await db
      .selectFrom('sessions')
      .select([
        sql<string>`COUNT(id)`.as('total'),
        sql<string>`COUNT(id) FILTER (WHERE status = 'completed')`.as('completed'),
        sql<string>`COUNT(id) FILTER (WHERE status = 'failed')`.as('failed'),
        sql<number | null>`AVG(
          EXTRACT(EPOCH FROM (processing_completed_at - processing_started_at)) * 1000
        ) FILTER (
          WHERE status = 'completed'
          AND processing_started_at IS NOT NULL
          AND processing_completed_at IS NOT NULL
        )`.as('avg_latency_ms'),
      ])
      .where(sql<boolean>`created_at >= NOW() - INTERVAL '24 hours'`)
      .executeTakeFirstOrThrow();

    const total = Number(row.total);
    const completed = Number(row.completed);
    const failed = Number(row.failed);

    return {
      status: 'ok',
      completionRate24h: total === 0 ? 1.0 : Math.round((completed / total) * 100) / 100,
      avgLatencyMs: row.avg_latency_ms != null ? Math.round(Number(row.avg_latency_ms)) : null,
      failedLast24h: failed,
    };
  } catch (err) {
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}

// ---------------------------------------------------------------------------
// healthRoutes — Fastify plugin
// ---------------------------------------------------------------------------

/**
 * Run all four checks and assemble the HealthResponse. This is the expensive
 * path (it touches Redis + the DB) — callers should cache the result.
 */
export async function buildHealthBody(): Promise<HealthResponse> {
  const timeoutResult: CheckResult = { status: 'error', error: 'timeout' };
  const allTimeoutFallback: PromiseSettledResult<
    CheckResult | QueueDepths | { status: 'error'; error: string } | PipelineStats
  >[] = [
    { status: 'fulfilled', value: timeoutResult },
    { status: 'fulfilled', value: timeoutResult },
    { status: 'fulfilled', value: timeoutResult },
    { status: 'fulfilled', value: timeoutResult },
  ];

  const [dbResult, redisResult, queuesResult, pipelineResult] = await withTimeout(
    Promise.allSettled([checkDatabase(), checkRedis(), checkQueues(), checkPipeline()]),
    HEALTH_TIMEOUT_MS,
    allTimeoutFallback
  );

  const unwrap = <T>(r: PromiseSettledResult<T>): T | { status: 'error'; error: string } =>
    r.status === 'fulfilled' ? r.value : { status: 'error' as const, error: String((r as PromiseRejectedResult).reason) };

  const database = unwrap(dbResult) as CheckResult;
  const redis = unwrap(redisResult) as CheckResult;
  const queueDepths = unwrap(queuesResult) as QueueDepths | { status: 'error'; error: string };
  const pipeline = unwrap(pipelineResult) as PipelineStats;

  const isHealthy =
    database.status === 'ok' &&
    redis.status === 'ok' &&
    !('status' in queueDepths) &&
    pipeline.status === 'ok';

  return {
    status: isHealthy ? 'healthy' : 'degraded',
    checks: { database, redis, queueDepths, pipeline },
  };
}

// Snapshot cache — caps Redis usage at ~once per TTL regardless of poll rate.
// 0 disables the cache (default under tests so each call recomputes).
const HEALTH_CACHE_TTL_MS = Number(
  process.env.HEALTH_CACHE_TTL_MS ?? (process.env.NODE_ENV === 'test' ? 0 : 60_000)
);

let healthCache: { at: number; body: HealthResponse } | null = null;

/**
 * Registers GET /health/detailed. Public — no preHandler.
 * Always returns HTTP 200. "healthy" when all checks pass, "degraded" otherwise.
 * Serves a cached snapshot for up to HEALTH_CACHE_TTL_MS to protect the Redis
 * free tier from frequent uptime-monitor polling.
 */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health/detailed', async (_req, reply) => {
    const now = Date.now();

    if (HEALTH_CACHE_TTL_MS > 0 && healthCache && now - healthCache.at < HEALTH_CACHE_TTL_MS) {
      return reply.code(200).send(healthCache.body);
    }

    const body = await buildHealthBody();
    healthCache = { at: now, body };

    return reply.code(200).send(body);
  });
}
