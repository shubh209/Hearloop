// hearloop/apps/api/src/jobs/transcribe.ts

import { transcribeAudio, TranscriptResult } from "../lib/groq";
import { db } from "../lib/db";
import { enqueueAnalyze } from "../lib/queue";
import { randomUUID } from "crypto";
import { jobLogger } from "../lib/logger";

const log = jobLogger("transcribe");

export interface TranscribeJobPayload {
  sessionId: string;
  storageKey: string;
  mimeType: string;
  languageHint?: string;
  promptText?: string;
}

export async function runTranscribeJob(
  payload: TranscribeJobPayload
): Promise<void> {
  const { sessionId, storageKey, mimeType, languageHint, promptText } = payload;

  await db
    .updateTable("sessions")
    .set({ status: "processing", processing_started_at: new Date(), updated_at: new Date() })
    .where("id", "=", sessionId)
    .execute();

  let transcript: TranscriptResult;

  try {
    const audioBuffer = await fetchAudioFromStorage(storageKey);
    log.info({ sessionId, sizeBytes: audioBuffer.byteLength }, "audio fetched from storage");
    transcript = await transcribeAudio(audioBuffer, {
      mimeType,
      languageHint,
      promptText,
    });
    log.info({ sessionId, lang: transcript.detectedLanguage, chars: transcript.text.length }, "transcription complete");
  } catch (err: any) {
    log.error({ sessionId, err: err.message }, "transcription error");
    await markFailed(sessionId, "transcription_error");
    throw err;
  }

  try {
    await db
      .insertInto("analyses")
      .values({
        id: randomUUID(),
        session_id: sessionId,
        transcript: transcript.text,
        detected_language: transcript.detectedLanguage,
        confidence: transcript.confidence,
        sentiment_label: null,
        sentiment_score: null,
        topics_json: null,
        moderation_json: null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column("session_id").doUpdateSet({
          transcript: transcript.text,
          detected_language: transcript.detectedLanguage,
          updated_at: new Date(),
        })
      )
      .execute();

    log.info({ sessionId }, "transcript stored, enqueuing analyze");

    await enqueueAnalyze({
      sessionId,
      transcript: transcript.text,
      languageHint: transcript.detectedLanguage ?? languageHint,
    });
  } catch (err: any) {
    log.error({ sessionId, err: err.message }, "post-transcription error");
    await markFailed(sessionId, "post_transcription_error");
    throw err;
  }
}

async function markFailed(sessionId: string, reason: string): Promise<void> {
  log.error({ sessionId, reason }, "session failed");
  await db
    .updateTable("sessions")
    .set({ status: "failed", failure_reason: reason, updated_at: new Date() })
    .where("id", "=", sessionId)
    .execute();
}

async function fetchAudioFromStorage(storageKey: string): Promise<Buffer> {
  const { getAudioBuffer } = await import("../lib/storage");
  return getAudioBuffer(storageKey);
}