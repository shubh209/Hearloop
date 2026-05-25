"use client";

/**
 * The current phase of the Hearloop recording lifecycle.
 */
export type HearloopState =
  | "idle"
  | "recording"
  | "recorded"
  | "sending"
  | "success"
  | "error";

/**
 * Configuration options accepted by `useHearloop`.
 */
export interface UseHearloopOptions {
  /**
   * Pre-fetched server-side session-create token.
   * Preferred over `apiKey` for client-rendered apps — keeps the raw API key
   * out of the browser entirely.
   */
  sessionCreateToken?: string;

  /**
   * Raw API key. Only appropriate for server-side-rendered contexts.
   * If provided without `sessionCreateToken`, the SDK will call
   * `POST /v1/public/sessions/create-token` to exchange it for a short-lived token.
   */
  apiKey?: string;

  /**
   * Prompt shown to the user inside the widget.
   * @default "How was your experience today?"
   */
  promptText?: string;

  /**
   * Maximum recording duration in seconds. The countdown starts at this value
   * and the recording stops automatically when it reaches 0.
   * @default 5
   */
  maxDurationSec?: number;

  /**
   * Override the Hearloop REST API base URL.
   * @default "https://18-223-189-193.nip.io/v1"
   */
  apiBaseUrl?: string;
}

/**
 * The stable API surface returned by `useHearloop`.
 */
export interface UseHearloopReturn {
  /** Current phase of the recording lifecycle. */
  state: HearloopState;

  /** Request microphone access and start recording. */
  startRecording: () => Promise<void>;

  /** Stop the active recording and release the microphone stream. */
  stopRecording: () => void;

  /** Execute the 5-step API flow to submit the recorded audio. */
  send: () => Promise<void>;

  /** Return to `idle`, clear `audioBlob`, clear `error`, and reset the countdown. */
  reset: () => void;

  /** The recorded audio `Blob`, available after transitioning to `recorded`. `null` otherwise. */
  audioBlob: Blob | null;

  /** Countdown in seconds. Starts at `maxDurationSec` and decrements while recording. */
  secondsLeft: number;

  /** Error message when `state` is `"error"`. `null` otherwise. */
  error: string | null;
}

/**
 * Props accepted by `HearloopWidget`. Extends all `UseHearloopOptions` fields
 * with visual overrides for the default floating widget UI.
 */
export interface HearloopWidgetProps extends UseHearloopOptions {
  /**
   * Placement of the floating action button.
   * @default "bottom-right"
   */
  position?: "bottom-right" | "bottom-left";

  /**
   * Accent color applied to the FAB background, mic icon background, and send button.
   * @default "#1D9E75"
   */
  accentColor?: string;

  /**
   * Optional CSS class name applied to the root wrapper `<div>`.
   */
  className?: string;
}
