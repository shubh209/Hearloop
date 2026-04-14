// hearloop/apps/web/components/Recorder.tsx

"use client";

import { useState, useRef, useCallback } from "react";

type RecorderState =
  | "idle"
  | "requesting_permission"
  | "ready"
  | "recording"
  | "preview"
  | "uploading"cd hearloop/apps/web && npm install
  | "submitted"
  | "error";

interface RecorderProps {
  sessionToken: string;
  maxDurationSec?: number;
  promptText?: string;
  consentRequired?: boolean;
  consentText?: string;
  onSubmitted?: () => void;
}

export default function Recorder({
  sessionToken,
  maxDurationSec = 5,
  promptText,
  consentRequired = false,
  consentText,
  onSubmitted,
}: RecorderProps) {
  const [state, setState] = useState<RecorderState>("idle");
  const [countdown, setCountdown] = useState(maxDurationSec);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [consentGiven, setConsentGiven] = useState(!consentRequired);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioBlobRef = useRef<Blob | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const requestPermission = useCallback(async () => {
    setState("requesting_permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setState("ready");
    } catch {
      setError("Microphone access denied. Please allow microphone and try again.");
      setState("error");
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current) return;

    chunksRef.current = [];
    const mimeType = MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4";

    const mediaRecorder = new MediaRecorder(streamRef.current, { mimeType });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType });
      audioBlobRef.current = blob;
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setState("preview");
    };

    mediaRecorder.start(100);
    setState("recording");

    // Countdown timer
    let remaining = maxDurationSec;
    setCountdown(remaining);

    timerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) stopRecording();
    }, 1000);
  }, [maxDurationSec]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    mediaRecorderRef.current?.stop();
  }, []);

  const reRecord = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    audioBlobRef.current = null;
    setState("ready");
  }, [audioUrl]);

  const submit = useCallback(async () => {
    if (!audioBlobRef.current) return;
    setState("uploading");

    try {
      const mimeType = audioBlobRef.current.type;

      // 1. Get signed upload URL
      const urlRes = await fetch(
        `/api/public/session/${sessionToken}/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mimeType }),
        }
      );

      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, storageKey } = await urlRes.json();

      // 2. Upload directly to R2/S3
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: audioBlobRef.current,
        headers: { "Content-Type": mimeType },
      });

      if (!uploadRes.ok) throw new Error("Audio upload failed");

      // 3. Finalize session
      const finalizeRes = await fetch(
        `/api/public/session/${sessionToken}/finalize`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storageKey,
            mimeType,
            sizeBytes: audioBlobRef.current.size,
            consentGiven,
          }),
        }
      );

      if (!finalizeRes.ok) throw new Error("Finalize failed");

      setState("submitted");
      onSubmitted?.();
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setState("error");
    }
  }, [sessionToken, consentGiven, onSubmitted]);

  // Stop mic on unmount
  const cleanup = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return (
    <div className="flex flex-col items-center gap-6 p-8 max-w-sm mx-auto">
      {/* Prompt */}
      {promptText && (
        <p className="text-center text-sm text-gray-600">{promptText}</p>
      )}

      {/* State machine UI */}
      {state === "idle" && (
        <button
          onClick={requestPermission}
          className="w-24 h-24 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition"
        >
          Tap to start
        </button>
      )}

      {state === "requesting_permission" && (
        <p className="text-sm text-gray-500">Requesting microphone...</p>
      )}

      {state === "ready" && (
        <button
          onClick={startRecording}
          disabled={!consentGiven}
          className="w-24 h-24 rounded-full bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition"
        >
          Record
        </button>
      )}

      {state === "recording" && (
        <div className="flex flex-col items-center gap-4">
          <button
            onClick={stopRecording}
            className="w-24 h-24 rounded-full bg-red-500 text-white text-sm font-medium animate-pulse"
          >
            {countdown}s
          </button>
          <p className="text-xs text-gray-400">Tap to stop early</p>
        </div>
      )}

      {state === "preview" && audioUrl && (
        <div className="flex flex-col items-center gap-4 w-full">
          <audio src={audioUrl} controls className="w-full" />
          <div className="flex gap-3">
            <button
              onClick={reRecord}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm hover:bg-gray-50 transition"
            >
              Re-record
            </button>
            <button
              onClick={submit}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm hover:bg-blue-700 transition"
            >
              Submit
            </button>
          </div>
        </div>
      )}

      {state === "uploading" && (
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Submitting...</p>
        </div>
      )}

      {state === "submitted" && (
        <div className="flex flex-col items-center gap-2">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-2xl">
            ✓
          </div>
          <p className="text-sm font-medium text-green-700">
            Thank you for your feedback!
          </p>
        </div>
      )}

      {state === "error" && (
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-red-500 text-center">{error}</p>
          <button
            onClick={() => { setError(null); setState("idle"); }}
            className="px-4 py-2 rounded-lg bg-gray-100 text-sm hover:bg-gray-200 transition"
          >
            Try again
          </button>
        </div>
      )}

      {/* Consent */}
      {consentRequired && state === "ready" && (
        <label className="flex items-start gap-2 text-xs text-gray-500 cursor-pointer">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(e) => setConsentGiven(e.target.checked)}
            className="mt-0.5"
          />
          <span>{consentText ?? "By recording, you consent to audio processing."}</span>
        </label>
      )}
    </div>
  );
}