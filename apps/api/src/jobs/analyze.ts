// hearloop/apps/api/src/jobs/analyze.ts

import { analyzeTranscript, AnalysisResult } from "../lib/claude";
import { db } from "../lib/db";

export interface AnalyzeJobPayload {
  sessionId: string;
  transcript: string;
  languageHint?: string | null;
}

export async function runAnalyzeJob(
  payload: AnalyzeJobPayload
): Promise<void> {
  const { sessionId, transcript, languageHint } = payload;

  let analysis: AnalysisResult;

  try {
    // 1. Run Claude classification
    analysis = await analyzeTranscript(transcript, {
      languageHint: languageHint ?? undefined,
    });
  } catch (err) {
    await markFailed(sessionId, "analysis_error");
    throw err;
  }

  try {
    // 2. Update the existing analyses row (created by transcribe job)
    await db
      .updateTable("analyses")
      .set({
        sentiment_label: analysis.sentiment,
        sentiment_score: analysis.sentimentScore,
        topics_json: JSON.stringify(analysis.topics),
        moderation_json: JSON.stringify({
          urgency: analysis.urgency,
          qualityFlags: analysis.qualityFlags,
          moderationFlags: analysis.moderationFlags,
          summary: analysis.summary,
        }),
      })
      .where("session_id", "=", sessionId)
      .execute();

    // 3. Mark session completed
    await db
      .updateTable("sessions")
      .set({ status: "completed" })
      .where("id", "=", sessionId)
      .execute();

    // 4. Enqueue webhook delivery
    await enqueueWebhookDelivery(sessionId);
  } catch (err) {
    await markFailed(sessionId, "post_analysis_error");
    throw err;
  }
}

async function markFailed(sessionId: string, reason: string): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ status: "failed", failure_reason: reason })
    .where("id", "=", sessionId)
    .execute();
}

async function enqueueWebhookDelivery(sessionId: string): Promise<void> {
  const { queue } = await import("../lib/queue");
  await queue.add("deliver-webhook", { sessionId });
}