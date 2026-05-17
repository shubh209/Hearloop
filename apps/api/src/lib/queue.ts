// hearloop/apps/api/src/lib/queue.ts

import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";
import { jobLogger } from "./logger";

const log = jobLogger("queue");

export const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// Dedicated queue per job type — no shared queue confusion
export const validateQueue = new Queue("hearloop-validate", { connection });
export const transcribeQueue = new Queue("hearloop-transcribe", { connection });
export const analyzeQueue = new Queue("hearloop-analyze", { connection });
export const webhookQueue = new Queue("hearloop-webhooks", { connection });
export const expireQueue = new Queue("hearloop-expire-session", { connection });

export type JobName =
  | "validate-recording"
  | "transcribe"
  | "analyze"
  | "deliver-webhook"
  | "expire-session"
  | "delete-session-assets";

export function createWorker(
  jobName: JobName,
  handler: (job: Job) => Promise<void>
): Worker {
  const queueName = {
    "transcribe": "hearloop-transcribe",
    "analyze": "hearloop-analyze",
    "deliver-webhook": "hearloop-webhooks",
    "expire-session": "hearloop-expire-session",
    "validate-recording": "hearloop-validate",
    "delete-session-assets": "hearloop-delete",
  }[jobName];

  const worker = new Worker(
    queueName,
    async (job: Job) => {
      await handler(job);
    },
    {
      connection,
      concurrency: jobName === "deliver-webhook" ? 5 : 2,
      stalledInterval: 600_000,   // stalled job check every 10 min
      lockDuration:    120_000,   // job lock lasts 2 min
      // drainDelay controls the BZPOPMIN blocking timeout (seconds).
      // Default = 5s → 5 workers × 8 cmds × 12 cycles/min = 480 cmds/min = 691K/day.
      // At 300s: 480 → 8 cmds/min = ~11.5K/day — safely under 15K/day free-tier ceiling.
      drainDelay:      300,       // poll for new jobs every 5 min when idle
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

export async function enqueueValidate(payload: {
  sessionId: string;
  storageKey: string;
  mimeType: string;
  languageHint?: string;
  promptText?: string;
  maxDurationSec?: number;
}): Promise<void> {
  await validateQueue.add("validate-recording", payload, {
    jobId: `validate-${payload.sessionId}`,
    attempts: 2,
    backoff: { type: "exponential", delay: 1000 },
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  });
}

export async function enqueueTranscribe(payload: {
  sessionId: string;
  storageKey: string;
  mimeType: string;
  languageHint?: string;
  promptText?: string;
}): Promise<void> {
  await transcribeQueue.add("transcribe", payload, {
    jobId: `transcribe-${payload.sessionId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  });
}

export async function enqueueAnalyze(payload: {
  sessionId: string;
  transcript: string;
  languageHint?: string | null;
}): Promise<void> {
  await analyzeQueue.add("analyze", payload, {
    jobId: `analyze-${payload.sessionId}`,
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  });
}

export async function enqueueWebhook(payload: {
  sessionId: string;
  eventType: string;
  partnerId: string;
}): Promise<void> {
  await webhookQueue.add("deliver-webhook", payload, {
    jobId: `webhook-${payload.eventType}-${payload.sessionId}`,
    attempts: 7,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: { count: 50 },
  });
}

export async function enqueueExpireSession(
  sessionId: string,
  delayMs: number
): Promise<void> {
  await expireQueue.add(
    "expire-session",
    { sessionId },
    {
      jobId: `expire-${sessionId}`,
      delay: delayMs,
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: true,
      removeOnFail: { count: 50 },
    }
  );
}