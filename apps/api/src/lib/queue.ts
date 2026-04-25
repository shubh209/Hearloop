// hearloop/apps/api/src/lib/queue.ts

import { Queue, Worker, Job, QueueEvents } from "bullmq";
import IORedis from "ioredis";

const connection = new IORedis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: null, // required by BullMQ
});

// --- Queues ---

export const queue = new Queue("hearloop-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 2000, // 2s, 4s, 8s
    },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 500 }, // keep failed jobs for debugging
  },
});

export const webhookQueue = new Queue("hearloop-webhooks", {
  connection,
  defaultJobOptions: {
    attempts: 7, // spec: at-least-once, exponential backoff
    backoff: {
      type: "exponential",
      delay: 5000, // 5s, 10s, 20s ... ~10 min max
    },
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 1000 }, // dead-letter — keep all
  },
});

// --- Job type map ---

export type JobName =
  | "validate-recording"
  | "transcribe"
  | "analyze"
  | "deliver-webhook"
  | "expire-session"
  | "delete-session-assets";

// --- Worker factory ---

export function createWorker(
  jobName: JobName,
  handler: (job: Job) => Promise<void>
): Worker {
  const worker = new Worker(
    jobName === "deliver-webhook" ? "hearloop-webhooks" : "hearloop-jobs",
    async (job: Job) => {
      if (job.name !== jobName) return;
      await handler(job);
    },
    {
      connection,
      concurrency: jobName === "deliver-webhook" ? 20 : 5,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error(`Worker ${jobName} error:`, err.message);
  });

  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  return worker;
}

// --- Enqueue helpers ---

export async function enqueueTranscribe(payload: {
  sessionId: string;
  storageKey: string;
  mimeType: string;
  languageHint?: string;
  promptText?: string;
}): Promise<void> {
  await queue.add("transcribe", payload, {
    jobId: `transcribe-${payload.sessionId}`, // deduplication
  });
}

export async function enqueueAnalyze(payload: {
  sessionId: string;
  transcript: string;
  languageHint?: string | null;
}): Promise<void> {
  await queue.add("analyze", payload, {
    jobId: `analyze-${payload.sessionId}`,
  });
}

export async function enqueueWebhook(payload: {
  sessionId: string;
  eventType: string;
  partnerId: string;
}): Promise<void> {
  await webhookQueue.add("deliver-webhook", payload, {
    jobId: `webhook-${payload.eventType}:${payload.sessionId}`,
  });
}

export async function enqueueExpireSession(
  sessionId: string,
  delayMs: number
): Promise<void> {
  await queue.add(
    "expire-session",
    { sessionId },
    {
      jobId: `expire-${sessionId}`,
      delay: delayMs,
    }
  );
}