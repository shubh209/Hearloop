// hearloop/apps/api/src/jobs/validate-recording.ts

import { db } from "../lib/db";
import { getAudioBuffer } from "../lib/storage";
import { enqueueTranscribe } from "../lib/queue";

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
    await markFailed(sessionId, "unsupported_mime_type");
    return;
  }

  let audioBuffer: Buffer;

  try {
    audioBuffer = await getAudioBuffer(storageKey);
  } catch {
    await markFailed(sessionId, "storage_fetch_error");
    return;
  }

  // 2. Size checks
  if (audioBuffer.byteLength === 0) {
    await markFailed(sessionId, "empty_file");
    return;
  }

  if (audioBuffer.byteLength < MIN_FILE_SIZE_BYTES) {
    await markFailed(sessionId, "file_too_small");
    return;
  }

  if (audioBuffer.byteLength > MAX_FILE_SIZE_BYTES) {
    await markFailed(sessionId, "file_too_large");
    return;
  }

  // 3. Basic decode check — verify file has valid audio header bytes
  if (!hasValidAudioHeader(audioBuffer, mimeType)) {
    await markFailed(sessionId, "invalid_audio_header");
    return;
  }

  // 4. Update recording size in DB
  await db
    .updateTable("recordings")
    .set({ size_bytes: audioBuffer.byteLength })
    .where("session_id", "=", sessionId)
    .execute();

  // 5. Validation passed — enqueue transcription
  await enqueueTranscribe({
    sessionId,
    storageKey,
    mimeType,
    languageHint,
    promptText,
  });
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

async function markFailed(sessionId: string, reason: string): Promise<void> {
  await db
    .updateTable("sessions")
    .set({ status: "failed", failure_reason: reason, updated_at: new Date() })
    .where("id", "=", sessionId)
    .execute();
}