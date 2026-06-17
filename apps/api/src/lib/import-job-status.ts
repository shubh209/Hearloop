// hearloop/apps/api/src/lib/import-job-status.ts
//
// Read BullMQ import job state for partner polling.

import { Job, Queue } from "bullmq";
import IORedis from "ioredis";
import { IMPORT_QUEUE_NAME } from "./queue";

const REDIS_URL = process.env.REDIS_URL!;

export interface ImportJobPayload {
  partnerId: string;
  websiteUrl: string;
}

export interface ImportJobStatus {
  importId: string;
  status: "pending" | "completed" | "failed";
  websiteUrl?: string;
  draftContext?: string;
  errorCode?: string;
}

export interface ImportJobResult {
  status: "completed" | "failed";
  websiteUrl: string;
  draftContext?: string;
  errorCode?: string;
}

async function withQueue<T>(fn: (queue: Queue) => Promise<T>): Promise<T> {
  const conn = new IORedis(REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  const queue = new Queue(IMPORT_QUEUE_NAME, { connection: conn });
  try {
    return await fn(queue);
  } finally {
    await queue.close();
    conn.disconnect();
  }
}

export async function partnerHasActiveImport(partnerId: string): Promise<boolean> {
  return withQueue(async (queue) => {
    const jobs = await queue.getJobs(["active", "waiting", "delayed"]);
    return jobs.some((job) => job.data?.partnerId === partnerId);
  });
}

export async function getImportJobStatus(
  importId: string,
  partnerId: string
): Promise<ImportJobStatus | null> {
  return withQueue(async (queue) => {
    const job = await Job.fromId(queue, importId);
    if (!job) return null;

    const data = job.data as ImportJobPayload;
    if (data.partnerId !== partnerId) return null;

    const state = await job.getState();
    const websiteUrl = data.websiteUrl;

    if (state === "completed") {
      const result = job.returnvalue as ImportJobResult | undefined;
      if (result?.status === "failed") {
        return {
          importId,
          status: "failed",
          websiteUrl,
          errorCode: result.errorCode ?? "scrape_error",
        };
      }
      return {
        importId,
        status: "completed",
        websiteUrl,
        draftContext: result?.draftContext,
      };
    }

    if (state === "failed") {
      return {
        importId,
        status: "failed",
        websiteUrl,
        errorCode: "scrape_error",
      };
    }

    return {
      importId,
      status: "pending",
      websiteUrl,
    };
  });
}
