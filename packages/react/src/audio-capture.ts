"use client";

/**
 * audio-capture.ts — MediaRecorder lifecycle helpers
 *
 * Single responsibility: everything related to capturing audio from the
 * microphone via the MediaRecorder API. Not exported from the package entry
 * point — internal to the SDK only.
 */

/**
 * Ordered list of MIME types to try, from most-preferred to least-preferred.
 * Opus in WebM is the gold standard for voice; mp4 is the Safari fallback.
 */
const MIME_TYPE_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
] as const;

/**
 * Select the best supported audio MIME type for MediaRecorder.
 *
 * Accepts `isTypeSupported` as a parameter (rather than calling
 * `MediaRecorder.isTypeSupported` directly) so the function is pure and
 * testable without DOM mocking — Property 5 relies on this.
 *
 * @param isTypeSupported - A function with the same signature as
 *   `MediaRecorder.isTypeSupported`. Pass `MediaRecorder.isTypeSupported.bind(MediaRecorder)`
 *   in production; pass a stub in tests.
 * @returns The first supported MIME type string, or `""` if none are supported.
 */
export function selectMimeType(
  isTypeSupported: (mime: string) => boolean
): string {
  for (const mime of MIME_TYPE_CANDIDATES) {
    if (isTypeSupported(mime)) {
      return mime;
    }
  }
  return "";
}

/**
 * Construct a `MediaRecorder` for the given stream and MIME type.
 *
 * If construction throws (e.g. the browser lied about `isTypeSupported`),
 * retries once with `"audio/mp4"` as a last-resort fallback. If that also
 * throws, the error propagates to the caller.
 *
 * @param stream - The `MediaStream` obtained from `getUserMedia`.
 * @param mimeType - The MIME type string returned by `selectMimeType`.
 * @returns A configured `MediaRecorder` instance.
 */
export function createMediaRecorder(
  stream: MediaStream,
  mimeType: string
): MediaRecorder {
  try {
    return new MediaRecorder(stream, { mimeType });
  } catch {
    // Runtime failure despite isTypeSupported — fall back to audio/mp4
    return new MediaRecorder(stream, { mimeType: "audio/mp4" });
  }
}

/**
 * Request microphone access, start recording, and return a `stop` handle.
 *
 * Chunks are collected via `ondataavailable` (timeslice 100 ms). When the
 * recorder stops, the chunks are assembled into a single `Blob` and the
 * `onStop` callback is invoked with the blob and its MIME type.
 *
 * @param onStop - Called once when recording ends, with the assembled `Blob`
 *   and the MIME type string used to create it.
 * @returns A promise that resolves to `{ stop }` once the recorder has
 *   started. Call `stop()` to end the recording and trigger `onStop`.
 * @throws If microphone access is denied or `MediaRecorder` is unavailable.
 */
export async function startRecording(
  onStop: (blob: Blob, mimeType: string) => void
): Promise<{ stop: () => void }> {
  if (typeof MediaRecorder === "undefined") {
    throw new Error("MediaRecorder is not supported in this browser.");
  }

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    throw new Error(
      "Microphone access denied. Please allow mic access and try again."
    );
  }

  const mimeType = selectMimeType(
    MediaRecorder.isTypeSupported.bind(MediaRecorder)
  );
  const recorder = createMediaRecorder(stream, mimeType);
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data && event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
    // Release the mic stream tracks now that recording is complete
    stream.getTracks().forEach((track) => track.stop());
    onStop(blob, mimeType || "audio/webm");
  };

  recorder.start(100);

  return {
    stop: () => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    },
  };
}
