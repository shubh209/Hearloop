import { Job, Worker } from "bullmq";
import { runAnalyzeJob } from "../jobs/analyze";
import { runDeliverWebhookJob } from "../jobs/deliver-webhook";
import { runExpireSessionJob } from "../jobs/expire-session";
import { runTranscribeJob } from "../jobs/transcribe";
import { runValidateRecordingJob } from "../jobs/validate-recording";
import { createWorker } from "./queue";

type WorkerLog = {
  info: (context: Record<string, unknown>, message: string) => void;
};

export function startPipelineWorkers(workerLog: WorkerLog): Worker[] {
  return [
    createWorker("validate-recording", async (job: Job) => {
      workerLog.info(
        { jobId: job.id, sessionId: job.data.sessionId },
        "validate job started"
      );
      await runValidateRecordingJob(job.data);
    }),
    createWorker("transcribe", async (job: Job) => {
      workerLog.info(
        { jobId: job.id, sessionId: job.data.sessionId },
        "transcribe job started"
      );
      await runTranscribeJob(job.data);
    }),
    createWorker("analyze", async (job: Job) => {
      workerLog.info(
        { jobId: job.id, sessionId: job.data.sessionId },
        "analyze job started"
      );
      await runAnalyzeJob(job.data);
    }),
    createWorker("deliver-webhook", async (job: Job) => {
      workerLog.info(
        { jobId: job.id, sessionId: job.data.sessionId },
        "webhook job started"
      );
      await runDeliverWebhookJob(job.data);
    }),
    createWorker("expire-session", async (job: Job) => {
      workerLog.info(
        { jobId: job.id, sessionId: job.data.sessionId },
        "expire job started"
      );
      await runExpireSessionJob(job.data);
    }),
  ];
}
