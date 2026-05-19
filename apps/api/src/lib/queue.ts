// hearloop/apps/api/src/lib/queue.ts
//
// Redis connection strategy (free-tier safe):
//
// BullMQ requires SEPARATE IORedis instances for Queues vs Workers.
// Sharing one connection causes BullMQ to spawn extra internal connections
// that ignore drainDelay and generate background commands independently.
//
// Pattern used here:
//   - Workers get a dedicated `workerConnection` (one shared instance, blocking-command safe)
//   - Enqueue helpers create a short-lived Queue, add the job, then close it immediately
//     so no Queue instance stays alive between jobs
//
// Idle Redis command budget:
//   5 workers × drainDelay:600s × ~8 cmds/poll = ~5,760 cmds/day
//   Well under the 15K/day safe ceiling (Upstash 500K/month ÷ 30 − headroom)

import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { jobLogger } from "./logger";

const log = jobLogger("queue");

const REDIS_URL = process.env.REDIS_URL!;

// Shared connection for Workers only.
// maxRetriesPerRequest: null is required by BullMQ for blocking commands.
export const workerConnection = new IORedis(REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// Queue names
const QUEUE_NAMES = {
  "validate-recording": "hearloop-validate",
  "transcribe":         "hearloop-transcribe",
  "analyze":            "hearloop-analyze",
  "deliver-webhook":    "hearloop-webhooks",
  "expire-session":     "hearloop-expire-session",
  "delete-session-assets": "hearloop-delete",
} as const;

export type JobName = keyof typeof QUEUE_NAMES;

// Default job options applied to every queue.add() call
const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: true,
  removeOnFail: { count: 50 },
} as const;

// Worker options applied to every createWorker() call
const WORKER_OPTIONS = {
  stalledInterval: 600_000,  // stalled-job check every 10 min (default 30s = 29K cmds/day)
  lockDuration:    120_000,  // job lock lasts 2 min
  drainDelay:      600,      // idle poll every 10 min (default 5s = 691K cmds/day)
} as const;

/**
 * Add a job to a queue using a short-lived Queue instance.
 * The Queue is created, used, and closed immediately so no persistent
 * connection or background activity remains between enqueue calls.
 */
async function enqueue(
  jobName: JobName,
  jobData: Record<string, unknown>,
  options: {
    jobId?: string;
    attempts?: number;
    backoff?: { type: string; delay: number };
    delay?: number;
  } = {}
): Promise<void> {
  // Each Queue instance needs its own IORedis connection (not shared with workers).
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const queue = new Queue(QUEUE_NAMES[jobName], { connection: conn });

  try {
    await queue.add(jobName, jobData, {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
    });
  } finally {
    // Always close — even on error — so the connection doesn't linger
    await queue.close();
    conn.disconnect();
  }
}

/**
 * Create a BullMQ Worker using the shared workerConnection.
 * Workers are long-lived — one per job type, started at boot.
 */
export function createWorker(
  jobName: JobName,
  handler: (job: Job) => Promise<void>
): Worker {
  const worker = new Worker(
    QUEUE_NAMES[jobName],
    async (job: Job) => {
      await handler(job);
    },
    {
      connection: workerConnection,
      concurrency: jobName === "deliver-webhook" ? 5 : 2,
      ...WORKER_OPTIONS,
    }
  );

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, jobName, err: err.message }, "job failed");
  });

  worker.on("error", (err) => {
    log.error({ jobName, err: err.message }, "worker error");
  });

  worker.on("completed", (job) => {
    log.info({ jobId: job.id, jobName }, "job completed");
  });

  return worker;
}

// --- Enqueue helpers ---

export async function enqueueValidate(payload: {
  sessionId: string;
  storageKey: string;
  mimeType: string;
  languageHint?: string;
  promptText?: string;
  maxDurationSec?: number;
}): Promise<void> {
  await enqueue("validate-recording", payload as Record<string, unknown>, {
    jobId: `validate-${payload.sessionId}`,
    attempts: 2,
    backoff: { type: "exponential", delay: 1000 },
  });
}

export async function enqueueTranscribe(payload: {
  sessionId: string;
  storageKey: string;
  mimeType: string;
  languageHint?: string;
  promptText?: string;
}): Promise<void> {
  await enqueue("transcribe", payload as Record<string, unknown>, {
    jobId: `transcribe-${payload.sessionId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}

export async function enqueueAnalyze(payload: {
  sessionId: string;
  transcript: string;
  languageHint?: string | null;
}): Promise<void> {
  await enqueue("analyze", payload as Record<string, unknown>, {
    jobId: `analyze-${payload.sessionId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
  });
}

export async function enqueueWebhook(payload: {
  sessionId: string;
  eventType: string;
  partnerId: string;
}): Promise<void> {
  await enqueue("deliver-webhook", payload as Record<string, unknown>, {
    jobId: `webhook-${payload.eventType}-${payload.sessionId}`,
    attempts: 7,
    backoff: { type: "exponential", delay: 5000 },
  });
}

export async function enqueueExpireSession(
  sessionId: string,
  delayMs: number
): Promise<void> {
  await enqueue(
    "expire-session",
    { sessionId },
    {
      jobId: `expire-${sessionId}`,
      delay: delayMs,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
    }
  );
}
