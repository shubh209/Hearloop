// hearloop/apps/api/src/jobs/transcribe.ts

import { transcribeAudio, TranscriptResult } from "../lib/groq";
import { analyzeTranscript } from "../lib/claude";
import { db } from "../lib/db";

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

  // 1. Mark session as processing
  await db
    .updateTable("sessions")
    .set({ status: "processing" })
    .where("id", "=", sessionId)
    .execute();

  let transcript: TranscriptResult;

  try {
    // 2. Fetch audio from storage
    const audioBuffer = await fetchAudioFromStorage(storageKey);

    // 3. Transcribe
    transcript = await transcribeAudio(audioBuffer, {
      mimeType,
      languageHint,
      promptText,
    });
  } catch (err) {
    await markFailed(sessionId, "transcription_error");
    throw err;
  }

  try {
    // 4. Store transcript in analyses table
    await db
      .insertInto("analyses")
      .values({
        session_id: sessionId,
        transcript: transcript.text,
        detected_language: transcript.detectedLanguage,
        confidence: transcript.confidence,
        sentiment_label: null,
        sentiment_score: null,
        topics_json: null,
        moderation_json: null,
      })
      .execute();

    // 5. Enqueue analyze job
    await enqueueAnalyzeJob({
      sessionId,
      transcript: transcript.text,
      languageHint: transcript.detectedLanguage ?? languageHint,
    });
  } catch (err) {
    await markFailed(sessionId, "post_transcription_error");
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

// Placeholder — replace with real storage.ts call once built
async function fetchAudioFromStorage(storageKey: string): Promise<Buffer> {
  const { getAudioBuffer } = await import("../lib/storage");
  return getAudioBuffer(storageKey);
}

// Placeholder — replace with real queue.ts call once built
async function enqueueAnalyzeJob(payload: {
  sessionId: string;
  transcript: string;
  languageHint?: string | null;
}): Promise<void> {
  const { queue } = await import("../lib/queue");
  await queue.add("analyze", payload);
}