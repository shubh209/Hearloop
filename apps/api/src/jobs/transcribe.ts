// hearloop/apps/api/src/jobs/transcribe.ts

import { transcribeAudio, TranscriptResult } from "../lib/groq";
import { db } from "../lib/db";
import { enqueueAnalyze } from "../lib/queue";
import { randomUUID } from "crypto";

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
    .set({ status: "processing", updated_at: new Date() })
    .where("id", "=", sessionId)
    .execute();

  let transcript: TranscriptResult;

  try {
    const audioBuffer = await fetchAudioFromStorage(storageKey);
    console.log("Audio fetched, size:", audioBuffer.byteLength);
    transcript = await transcribeAudio(audioBuffer, {
      mimeType,
      languageHint,
      promptText,
    });
    console.log("Transcription done:", transcript.text.slice(0, 50));
  } catch (err: any) {
    console.error("Transcription error:", err.message);
    await markFailed(sessionId, "transcription_error");
    throw err;
  }

  try {
    console.log("Storing transcript for session:", sessionId);

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

    console.log("Transcript stored. Enqueuing analyze job for:", sessionId);

    await enqueueAnalyze({
      sessionId,
      transcript: transcript.text,
      languageHint: transcript.detectedLanguage ?? languageHint,
    });

    console.log("Analyze job enqueued for:", sessionId);
  } catch (err: any) {
    console.error("Post-transcription error:", err.message);
    await markFailed(sessionId, "post_transcription_error");
    throw err;
  }
}

async function markFailed(sessionId: string, reason: string): Promise<void> {
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