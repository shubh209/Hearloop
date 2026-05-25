"use client";

/**
 * widget.tsx — HearloopWidget default UI component
 *
 * Single responsibility: render the floating-action-button + collapsible panel
 * UI for the Hearloop voice-feedback flow. All state is owned by `useHearloop`;
 * this component is a thin consumer of the hook.
 *
 * Zero runtime dependencies — all styles are injected via a <style> tag,
 * matching the widget.js and Recorder.tsx inline-style patterns.
 */

import { useState, useEffect } from "react";
import { useHearloop } from "./use-hearloop";
import type { HearloopWidgetProps } from "./types";

// ─── SVG icons (inlined as JSX — no external icon library) ──────────────────

function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2C8 2 6 3.2 6 6V9.5C6 10.9 6.9 12 8 12C9.1 12 10 10.9 10 9.5V6C10 3.2 8 2 8 2Z"
        fill="white"
      />
      <path
        d="M5 10.5C5 12.4 6.3 14 8 14C9.7 14 11 12.4 11 10.5"
        stroke="white"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path d="M8 14V15.5" stroke="white" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M4 2.5L11 7L4 11.5V2.5Z" fill="white" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M4 10L8 14L16 6"
        stroke="#1D9E75"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LogoIcon({ color }: { color: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
      <path
        d="M11 3C11 3 5.5 7 5.5 12C5.5 14.5 8 16.5 11 16.5C14 16.5 16.5 14.5 16.5 12C16.5 7 11 3 11 3Z"
        fill="white"
        opacity=".92"
      />
      <circle cx="11" cy="12" r="2.2" fill="white" opacity=".55" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      aria-hidden="true"
      style={{ animation: "hlSpin 0.7s linear infinite" }}
    >
      <circle
        cx="9"
        cy="9"
        r="7"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="2"
      />
      <path
        d="M9 2A7 7 0 0 1 16 9"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Injected CSS (matches widget.js STYLES pattern) ────────────────────────

const WIDGET_STYLES = `
  .hl-r * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .hl-r-fab {
    position: fixed;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 999999;
    transition: transform 0.2s ease, background 0.2s ease;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  }
  .hl-r-fab:hover { transform: scale(1.08); }
  .hl-r-fab:active { transform: scale(0.96); }
  .hl-r-fab.bottom-right { bottom: 24px; right: 24px; }
  .hl-r-fab.bottom-left  { bottom: 24px; left: 24px; }
  .hl-r-panel {
    position: fixed;
    width: 260px;
    background: #ffffff;
    border: 0.5px solid rgba(0,0,0,0.12);
    border-radius: 16px;
    padding: 18px;
    z-index: 999998;
    display: flex;
    flex-direction: column;
    gap: 12px;
    transition: opacity 0.2s ease, transform 0.2s ease;
    opacity: 0;
    transform: translateY(8px) scale(0.98);
    pointer-events: none;
  }
  .hl-r-panel.bottom-right { bottom: 86px; right: 24px; }
  .hl-r-panel.bottom-left  { bottom: 86px; left: 24px; }
  .hl-r-panel.open { opacity: 1; transform: translateY(0) scale(1); pointer-events: auto; }
  .hl-r-title  { font-size: 13px; font-weight: 600; color: #111; }
  .hl-r-prompt { font-size: 11px; color: #888; line-height: 1.4; }
  .hl-r-mic-btn {
    width: 100%;
    height: 76px;
    border-radius: 10px;
    background: #f5f5f5;
    border: 0.5px solid rgba(0,0,0,0.1);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    transition: background 0.15s, border-color 0.15s;
  }
  .hl-r-mic-btn:hover { background: #edfaf4; border-color: rgba(29,158,117,0.3); }
  .hl-r-mic-btn.recording { background: #fff5f5; border-color: rgba(226,75,74,0.3); cursor: pointer; }
  .hl-r-mic-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.15s;
    flex-shrink: 0;
  }
  .hl-r-mic-label { font-size: 12px; color: #666; }
  .hl-r-mic-btn.recording .hl-r-mic-label { color: #a32d2d; }
  .hl-r-waveform { display: flex; align-items: center; gap: 2px; height: 22px; }
  .hl-r-bar {
    width: 3px;
    border-radius: 99px;
    background: #E24B4A;
    animation: hlPulse 0.55s ease-in-out infinite;
  }
  .hl-r-bar:nth-child(1){animation-delay:0s;height:6px}
  .hl-r-bar:nth-child(2){animation-delay:.08s;height:12px}
  .hl-r-bar:nth-child(3){animation-delay:.16s;height:18px}
  .hl-r-bar:nth-child(4){animation-delay:.24s;height:14px}
  .hl-r-bar:nth-child(5){animation-delay:.16s;height:20px}
  .hl-r-bar:nth-child(6){animation-delay:.08s;height:10px}
  .hl-r-bar:nth-child(7){animation-delay:0s;height:6px}
  @keyframes hlPulse { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
  @keyframes hlSpin   { to { transform: rotate(360deg); } }
  .hl-r-timer { font-size: 11px; color: #aaa; text-align: center; }
  .hl-r-error {
    font-size: 11px;
    color: #a32d2d;
    background: #fff5f5;
    border: 0.5px solid rgba(226,75,74,0.3);
    border-radius: 8px;
    padding: 8px 10px;
  }
  .hl-r-send {
    width: 100%;
    padding: 9px;
    border-radius: 10px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    transition: opacity 0.15s;
  }
  .hl-r-send:disabled { opacity: 0.4; cursor: not-allowed; }
  .hl-r-footer { font-size: 10px; color: #bbb; text-align: center; }
  .hl-r-success {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
  }
  .hl-r-check {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: #E1F5EE;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .hl-r-success-title { font-size: 13px; font-weight: 600; color: #111; }
  .hl-r-success-sub   { font-size: 11px; color: #888; text-align: center; line-height: 1.5; }
  .hl-r-reset-btn {
    margin-top: 4px;
    font-size: 11px;
    padding: 5px 12px;
    border-radius: 8px;
    border: 0.5px solid rgba(0,0,0,0.15);
    background: transparent;
    color: #888;
    cursor: pointer;
  }
  .hl-r-reset-btn:hover { background: #f5f5f5; }
`;

// ─── Component ───────────────────────────────────────────────────────────────

const DEFAULT_ACCENT = "#1D9E75";

export function HearloopWidget({
  position = "bottom-right",
  accentColor = DEFAULT_ACCENT,
  className,
  // UseHearloopOptions — forwarded unchanged
  sessionCreateToken,
  apiKey,
  promptText = "How was your experience today?",
  maxDurationSec,
  apiBaseUrl,
}: HearloopWidgetProps) {
  const [panelOpen, setPanelOpen] = useState(false);

  // Inject styles once on mount
  useEffect(() => {
    const id = "hl-r-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = WIDGET_STYLES;
    document.head.appendChild(style);
    return () => {
      // Leave styles in DOM — removing them would break other mounted widgets
    };
  }, []);

  // Forward all UseHearloopOptions fields unchanged
  const {
    state,
    startRecording,
    stopRecording,
    send,
    reset,
    secondsLeft,
    error,
  } = useHearloop({
    sessionCreateToken,
    apiKey,
    promptText,
    maxDurationSec,
    apiBaseUrl,
  });

  function handleFabClick() {
    setPanelOpen((prev) => !prev);
  }

  function handleMicClick() {
    if (state === "idle" || state === "recorded") {
      startRecording();
    } else if (state === "recording") {
      stopRecording();
    }
  }

  function handleSend() {
    send();
  }

  function handleReset() {
    reset();
    setPanelOpen(false);
  }

  // ── Mic button content ────────────────────────────────────────────────────

  const isRecording = state === "recording";
  const isRecorded = state === "recorded";

  const micIconBg = isRecording ? "#E24B4A" : accentColor;

  const micIconContent = isRecording ? (
    <div className="hl-r-waveform" aria-hidden="true">
      {[1, 2, 3, 4, 5, 6, 7].map((i) => (
        <span key={i} className="hl-r-bar" />
      ))}
    </div>
  ) : isRecorded ? (
    <PlayIcon />
  ) : (
    <MicIcon />
  );

  const micLabel = isRecording
    ? "Tap to stop"
    : isRecorded
    ? "Recorded — tap to re-record"
    : "Tap to record feedback";

  const micAriaLabel = isRecording
    ? "Stop recording"
    : isRecorded
    ? "Re-record feedback"
    : "Start recording feedback";

  // ── Send button content ───────────────────────────────────────────────────

  const isSending = state === "sending";
  const sendDisabled = state !== "recorded" && state !== "error";

  const sendLabel = isSending ? "Sending…" : state === "error" ? "Try again" : "Send feedback";

  // ── Main panel vs success screen ──────────────────────────────────────────

  const showSuccess = state === "success";

  return (
    <div className={className ?? undefined}>
      {/* Floating Action Button */}
      <button
        className={`hl-r-fab ${position}`}
        style={{ background: accentColor }}
        onClick={handleFabClick}
        aria-label={panelOpen ? "Close feedback widget" : "Open feedback widget"}
        aria-expanded={panelOpen}
        aria-haspopup="dialog"
      >
        <LogoIcon color={accentColor} />
      </button>

      {/* Collapsible Panel */}
      <div
        className={`hl-r-panel ${position}${panelOpen ? " open" : ""}`}
        role="dialog"
        aria-label="Hearloop feedback"
        aria-modal="false"
      >
        {showSuccess ? (
          /* ── Success screen ── */
          <div className="hl-r-success">
            <div className="hl-r-check">
              <CheckIcon />
            </div>
            <div className="hl-r-success-title">Feedback sent successfully</div>
            <div className="hl-r-success-sub">
              Thank you — your voice matters
              <br />
              and has been received.
            </div>
            <button
              className="hl-r-reset-btn"
              onClick={handleReset}
              aria-label="Give more feedback"
            >
              Give more feedback
            </button>
          </div>
        ) : (
          /* ── Main panel ── */
          <>
            <div className="hl-r-title">Share your feedback</div>
            <div className="hl-r-prompt">{promptText}</div>

            {/* Mic / record button */}
            <button
              className={`hl-r-mic-btn${isRecording ? " recording" : ""}`}
              onClick={handleMicClick}
              aria-label={micAriaLabel}
              disabled={state === "sending"}
            >
              <div
                className="hl-r-mic-icon"
                style={{ background: micIconBg }}
              >
                {micIconContent}
              </div>
              <span className="hl-r-mic-label">{micLabel}</span>
            </button>

            {/* Countdown timer — only visible while recording */}
            {isRecording && (
              <div className="hl-r-timer" aria-live="polite">
                Recording… {secondsLeft}s remaining
              </div>
            )}

            {/* Error banner — shown above send button */}
            {state === "error" && error && (
              <div className="hl-r-error" role="alert">
                {error}
              </div>
            )}

            {/* Send button */}
            <button
              className="hl-r-send"
              style={{ background: accentColor }}
              onClick={handleSend}
              disabled={sendDisabled}
              aria-label={sendLabel}
            >
              {isSending && <SpinnerIcon />}
              {sendLabel}
            </button>

            <div className="hl-r-footer">
              Powered by <strong>Hearloop</strong>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
