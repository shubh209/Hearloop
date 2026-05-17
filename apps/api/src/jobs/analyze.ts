// hearloop/apps/api/src/jobs/analyze.ts

import { analyzeTranscript, AnalysisResult } from "../lib/claude";
import { db } from "../lib/db";
import { jobLogger } from "../lib/logger";

const log = jobLogger("analyze");

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
    // 1. Run Bedrock classification
    analysis = await analyzeTranscript(transcript, {
      languageHint: languageHint ?? undefined,
    });
    log.info(
      {
        sessionId,
        model: analysis.modelUsed,
        inputTokens: analysis.inputTokens,
        outputTokens: analysis.outputTokens,
        sentiment: analysis.sentiment,
      },
      "analysis complete"
    );
  } catch (err: any) {
    log.error({ sessionId, err: err.message }, "analysis error");
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
        model_used: analysis.modelUsed ?? null,
        input_tokens: analysis.inputTokens ?? null,
        output_tokens: analysis.outputTokens ?? null,
      })
      .where("session_id", "=", sessionId)
      .execute();

    // 3. Mark session completed and record completion time for latency tracking
    await db
      .updateTable("sessions")
      .set({ status: "completed", processing_completed_at: new Date() })
      .where("id", "=", sessionId)
      .execute();

    log.info({ sessionId }, "session completed, enqueuing webhook");

    // 4. Enqueue webhook delivery
    await enqueueWebhookDelivery(sessionId);
  } catch (err: any) {
    log.error({ sessionId, err: err.message }, "post-analysis error");
    await markFailed(sessionId, "post_analysis_error");
    throw err;
  }
}

async function markFailed(sessionId: string, reason: string): Promise<void> {
  log.error({ sessionId, reason }, "session failed");
  await db
    .updateTable("sessions")
    .set({ status: "failed", failure_reason: reason })
    .where("id", "=", sessionId)
    .execute();
}

async function enqueueWebhookDelivery(sessionId: string): Promise<void> {
  const { enqueueWebhook } = await import("../lib/queue");
  
  // Get partner_id for this session
  const { db } = await import("../lib/db");
  const session = await db
    .selectFrom("sessions")
    .select("partner_id")
    .where("id", "=", sessionId)
    .executeTakeFirst();

  if (!session) return;

  await enqueueWebhook({
    sessionId,
    eventType: "session.completed",
    partnerId: session.partner_id,
  });
}