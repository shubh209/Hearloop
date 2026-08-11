// hearloop/apps/api/src/lib/import-job-status.ts
//
// Read BullMQ import job state for partner polling.

import { Job } from "bullmq";
import { withQueue } from "./queue";

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

export async function partnerHasActiveImport(partnerId: string): Promise<boolean> {
  return withQueue("import-business-context", async (queue) => {
    const jobs = await queue.getJobs(["active", "waiting", "delayed"]);
    return jobs.some((job) => job.data?.partnerId === partnerId);
  });
}

export async function getImportJobStatus(
  importId: string,
  partnerId: string
): Promise<ImportJobStatus | null> {
  return withQueue("import-business-context", async (queue) => {
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
