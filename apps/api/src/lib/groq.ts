import Groq from "groq-sdk";
import { Readable } from "stream";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export interface TranscriptResult {
  text: string;
  detectedLanguage: string | null;
  durationMs: number | null;
  confidence: "high" | "low" | null;
}

export interface TranscribeOptions {
  languageHint?: string;   // ISO-639-1, e.g. "en"
  promptText?: string;     // partner's prompt text — helps Whisper context
  mimeType?: string;       // audio/webm, audio/mp4, etc.
}

export async function transcribeAudio(
  audioBuffer: Buffer,
  options: TranscribeOptions = {}
): Promise<TranscriptResult> {
  const { languageHint, promptText, mimeType = "audio/webm" } = options;

  const ext = mimeTypeToExt(mimeType);

  const file = new File([new Uint8Array(audioBuffer)], `recording.${ext}`, { type: mimeType });

  const response = await groq.audio.transcriptions.create({
    file,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    temperature: 0.0,
    ...(languageHint ? { language: languageHint } : {}),
    ...(promptText ? { prompt: promptText.slice(0, 224) } : {}),
  });

  const verboseResponse = response as any;
  const text = verboseResponse.text?.trim() ?? "";
  const detectedLanguage = verboseResponse.language ?? null;
  const segments = verboseResponse.segments ?? [];
  const avgLogprob =
    segments.length > 0
      ? segments.reduce((sum: number, s: any) => sum + (s.avg_logprob ?? 0), 0) /
        segments.length
      : null;

  const confidence =
    avgLogprob === null ? null : avgLogprob > -0.5 ? "high" : "low";

  // duration from segments if available
  const lastSegment = segments[segments.length - 1];
  const durationMs = lastSegment?.end ? Math.round(lastSegment.end * 1000) : null;

  return {
    text,
    detectedLanguage,
    durationMs,
    confidence,
  };
}

// --- helpers ---

function mimeTypeToExt(mimeType: string): string {
  const map: Record<string, string> = {
    "audio/webm": "webm",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/x-m4a": "m4a",
    "audio/m4a": "m4a",
  };
  return map[mimeType] ?? "webm";
}