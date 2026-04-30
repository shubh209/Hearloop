// hearloop/apps/api/src/lib/queue.ts

import { Queue, Worker, Job } from "bullmq";
import IORedis from "ioredis";

export const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null,
});

// Dedicated queue per job type — no shared queue confusion
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
      console.log(`Processing ${jobName} job:`, job.id, job.data);
      await handler(job);
    },
    {
      connection,
      concurrency: jobName === "deliver-webhook" ? 20 : 5,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} (${jobName}) failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error(`Worker ${jobName} error:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} (${jobName}) completed`);
  });

  return worker;
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
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
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
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 },
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
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 1000 },
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
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 500 },
    }
  );
}