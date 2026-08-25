// hearloop/apps/api/src/jobs/validate-recording.ts

import { db } from "../lib/db";
import { getAudioBuffer } from "../lib/storage";
import { enqueueTranscribe } from "../lib/queue";
import { jobLogger } from "../lib/logger";
import { markFailed } from "./helpers/mark-failed";
import { acknowledgeLegacyValidationHandoff } from "../lib/legacy-finalize-handoff";

const log = jobLogger("validate-recording");

const SUPPORTED_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/m4a",
];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — 5s audio is ~500KB max
const MIN_FILE_SIZE_BYTES = 1000;              // 1KB — silent/empty guard

export interface ValidateJobPayload {
  sessionId: string;
  storageKey: string;
  mimeType: string;
  languageHint?: string;
  promptText?: string;
  maxDurationSec?: number;
}

export async function runValidateRecordingJob(
  payload: ValidateJobPayload
): Promise<void> {
  const {
    sessionId,
    storageKey,
    mimeType,
    languageHint,
    promptText,
    maxDurationSec = 5,
  } = payload;

  // 1. Mime type check
  if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
    log.warn({ sessionId, mimeType }, "unsupported mime type");
    await markFailed(sessionId, "unsupported_mime_type", log);
    throw new Error("unsupported_mime_type");
  }

  let audioBuffer: Buffer;

  try {
    audioBuffer = await getAudioBuffer(storageKey);
  } catch (err: any) {
    log.error({ sessionId, storageKey, err: err.message }, "storage fetch error");
    await markFailed(sessionId, "storage_fetch_error", log);
    throw err;
  }

  // 2. Size checks
  if (audioBuffer.byteLength === 0) {
    log.warn({ sessionId }, "empty file");
    await markFailed(sessionId, "empty_file", log);
    throw new Error("empty_file");
  }

  if (audioBuffer.byteLength < MIN_FILE_SIZE_BYTES) {
    log.warn({ sessionId, sizeBytes: audioBuffer.byteLength }, "file too small");
    await markFailed(sessionId, "file_too_small", log);
    throw new Error("file_too_small");
  }

  if (audioBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    log.warn({ sessionId, sizeBytes: audioBuffer.byteLength }, "file too large");
    await markFailed(sessionId, "file_too_large", log);
    throw new Error("file_too_large");
  }

  // 3. Basic decode check — verify file has valid audio header bytes
  if (!hasValidAudioHeader(audioBuffer, mimeType)) {
    log.warn({ sessionId, mimeType }, "invalid audio header");
    await markFailed(sessionId, "invalid_audio_header", log);
    throw new Error("invalid_audio_header");
  }

  // 4. Persist the validated size. Unexpected database failures must agree
  // with a terminal Session state before BullMQ can exhaust this job.
  try {
    await db
      .updateTable("recordings")
      .set({ size_bytes: audioBuffer.byteLength })
      .where("session_id", "=", sessionId)
      .execute();
  } catch (error) {
    await markFailed(sessionId, "recording_update_error", log);
    throw error;
  }

  // Repair a dispatcher acknowledgement loss before this bounded BullMQ job
  // can complete and remove its deterministic id. Non-legacy Sessions no-op.
  await acknowledgeLegacyValidationHandoff(sessionId);

  log.info({ sessionId, sizeBytes: audioBuffer.byteLength, mimeType }, "validation passed, enqueuing transcribe");

  // 5. Validation passed — enqueue transcription
  try {
    await enqueueTranscribe({
      sessionId,
      storageKey,
      mimeType,
      languageHint,
      promptText,
    });
  } catch (error) {
    await markFailed(sessionId, "transcription_enqueue_error", log);
    throw error;
  }
}

// --- helpers ---

function hasValidAudioHeader(buffer: Buffer, mimeType: string): boolean {
  if (buffer.byteLength < 4) return false;

  const header = buffer.slice(0, 12);

  switch (mimeType) {
    case "audio/webm":
      // EBML header: 0x1A 0x45 0xDF 0xA3
      return header[0] === 0x1a && header[1] === 0x45;

    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a":
      // ftyp box: bytes 4-7 = "ftyp"
      return (
        header[4] === 0x66 && // f
        header[5] === 0x74 && // t
        header[6] === 0x79 && // y
        header[7] === 0x70    // p
      );

    case "audio/mpeg":
      // MP3: ID3 header or sync word 0xFF 0xFB
      return (
        (header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33) || // ID3
        (header[0] === 0xff && (header[1] & 0xe0) === 0xe0)                 // sync
      );

    case "audio/ogg":
      // OggS capture pattern
      return (
        header[0] === 0x4f && // O
        header[1] === 0x67 && // g
        header[2] === 0x67 && // g
        header[3] === 0x53    // S
      );

    case "audio/wav":
      // RIFF header
      return (
        header[0] === 0x52 && // R
        header[1] === 0x49 && // I
        header[2] === 0x46 && // F
        header[3] === 0x46    // F
      );

    default:
      return false;
  }
}
