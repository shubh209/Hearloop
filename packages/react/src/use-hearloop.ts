"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import type { UseHearloopOptions, UseHearloopReturn, HearloopState } from "./types";
import { runApiFlow } from "./api-client";
import { startRecording as startAudioCapture } from "./audio-capture";

const DEFAULT_MAX_DURATION_SEC = 5;
const DEFAULT_API_BASE_URL = "https://18-223-189-193.nip.io/v1";
const DEFAULT_PROMPT_TEXT = "How was your experience today?";

export function useHearloop(options: UseHearloopOptions): UseHearloopReturn {
  const {
    sessionCreateToken,
    apiKey,
    promptText = DEFAULT_PROMPT_TEXT,
    maxDurationSec = DEFAULT_MAX_DURATION_SEC,
    apiBaseUrl = DEFAULT_API_BASE_URL,
  } = options;

  const [state, setState] = useState<HearloopState>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number>(maxDurationSec);

  // Refs for mutable values that shouldn't trigger re-renders
  const stopHandleRef = useRef<{ stop: () => void } | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Track the current state in a ref so callbacks can read it without stale closures
  const stateRef = useRef<HearloopState>("idle");

  // Keep stateRef in sync with state
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Keep secondsLeft in sync with maxDurationSec when idle (options change)
  useEffect(() => {
    if (stateRef.current === "idle") {
      setSecondsLeft(maxDurationSec);
    }
  }, [maxDurationSec]);

  const clearCountdown = useCallback(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  const stopRecording = useCallback(() => {
    clearCountdown();
    if (stopHandleRef.current) {
      stopHandleRef.current.stop();
      stopHandleRef.current = null;
    }
  }, [clearCountdown]);

  const startRecording = useCallback(async () => {
    // Reset countdown to current maxDurationSec before starting
    setSecondsLeft(maxDurationSec);
    setError(null);

    let handle: { stop: () => void };
    try {
      handle = await startAudioCapture((blob) => {
        setAudioBlob(blob);
        setState("recorded");
        stateRef.current = "recorded";
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      setError(message);
      setState("error");
      stateRef.current = "error";
      return;
    }

    stopHandleRef.current = handle;
    setState("recording");
    stateRef.current = "recording";

    // Start countdown
    let remaining = maxDurationSec;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        clearCountdown();
        // Trigger stop — onstop callback will transition to "recorded"
        if (stopHandleRef.current) {
          stopHandleRef.current.stop();
          stopHandleRef.current = null;
        }
      }
    }, 1000);
  }, [maxDurationSec, clearCountdown]);

  const send = useCallback(async () => {
    // Auth guard — check before any network call
    if (!sessionCreateToken && !apiKey) {
      setError(
        "No authentication provided. Pass sessionCreateToken or apiKey."
      );
      setState("error");
      stateRef.current = "error";
      return;
    }

    if (!audioBlob) {
      setError("No audio recorded. Please record audio before sending.");
      setState("error");
      stateRef.current = "error";
      return;
    }

    setState("sending");
    stateRef.current = "sending";

    // Capture blob reference before the async call so we can restore it on failure
    const blobSnapshot = audioBlob;

    try {
      await runApiFlow(
        apiBaseUrl,
        { sessionCreateToken, apiKey },
        blobSnapshot,
        blobSnapshot.type || "audio/webm",
        {
          promptText,
          maxDurationSec,
        }
      );
      setState("success");
      stateRef.current = "success";
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.";
      // audioBlob must NOT be cleared on failure — restore it explicitly
      setAudioBlob(blobSnapshot);
      setError(message);
      setState("error");
      stateRef.current = "error";
    }
  }, [sessionCreateToken, apiKey, apiBaseUrl, promptText, maxDurationSec, audioBlob]);

  const reset = useCallback(() => {
    clearCountdown();
    // Stop any active recording
    if (stopHandleRef.current) {
      stopHandleRef.current.stop();
      stopHandleRef.current = null;
    }
    setAudioBlob(null);
    setError(null);
    setSecondsLeft(maxDurationSec);
    setState("idle");
    stateRef.current = "idle";
  }, [maxDurationSec, clearCountdown]);

  // Cleanup on unmount — release mic and clear timers
  useEffect(() => {
    return () => {
      clearCountdown();
      if (stopHandleRef.current) {
        stopHandleRef.current.stop();
        stopHandleRef.current = null;
      }
    };
  }, [clearCountdown]);

  return {
    state,
    startRecording,
    stopRecording,
    send,
    reset,
    audioBlob,
    secondsLeft,
    error,
  };
}
