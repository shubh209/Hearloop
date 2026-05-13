"use client";
// hearloop/apps/web/components/Recorder.tsx

import { useState, useRef, useCallback } from "react";

type RecorderState =
  | "idle"
  | "requesting_permission"
  | "ready"
  | "recording"
  | "preview"
  | "uploading"
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

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://18.223.189.193:3001/v1";

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
    const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
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
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const reRecord = useCallback(async () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    audioBlobRef.current = null;
    // Re-request mic
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      setState("ready");
    } catch {
      setError("Microphone access denied.");
      setState("error");
    }
  }, [audioUrl]);

  const submit = useCallback(async () => {
    if (!audioBlobRef.current) return;
    setState("uploading");

    try {
      const mimeType = audioBlobRef.current.type;

      // 1. Open session — must send explicit body to satisfy Fastify's JSON parser
      await fetch(`${API_BASE}/public/session/${sessionToken}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      // 2. Get signed upload URL via public route (no Bearer auth needed)
      const urlRes = await fetch(
        `${API_BASE}/public/session/${sessionToken}/upload-url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mimeType }),
        }
      );

      if (!urlRes.ok) throw new Error("Failed to get upload URL");
      const { uploadUrl, storageKey } = await urlRes.json();

      // 3. Upload directly to S3
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        body: audioBlobRef.current,
        headers: { "Content-Type": mimeType },
      });

      if (!uploadRes.ok) throw new Error("Audio upload failed");

      // 4. Finalize session
      const finalizeRes = await fetch(
        `${API_BASE}/public/session/${sessionToken}/finalize`,
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

  return (
    <>
      <style>{`
        .rec-wrap { display: flex; flex-direction: column; align-items: center; gap: 16px; width: 100%; }

        .rec-btn {
          width: 80px; height: 80px;
          border-radius: 50%;
          border: none;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          flex-direction: column;
          gap: 4px;
          transition: transform 0.15s, background 0.15s;
          position: relative;
        }

        .rec-btn:hover:not(:disabled) { transform: scale(1.06); }
        .rec-btn:disabled { opacity: 0.4; cursor: not-allowed; }

        .rec-btn.idle { background: #1D9E75; box-shadow: 0 4px 20px rgba(29,158,117,0.35); }
        .rec-btn.ready { background: #1D9E75; box-shadow: 0 4px 20px rgba(29,158,117,0.35); }
        .rec-btn.recording { background: #E24B4A; box-shadow: 0 4px 20px rgba(226,75,74,0.35); animation: recPulse 1.5s ease-in-out infinite; }

        @keyframes recPulse {
          0%, 100% { box-shadow: 0 4px 20px rgba(226,75,74,0.35); }
          50% { box-shadow: 0 4px 32px rgba(226,75,74,0.6); }
        }

        .rec-btn-label { font-size: 11px; font-weight: 500; color: #fff; font-family: 'DM Sans', sans-serif; }
        .rec-countdown { font-size: 22px; font-weight: 500; color: #fff; font-family: 'DM Mono', monospace; line-height: 1; }

        .rec-hint { font-size: 11px; color: #999; text-align: center; }

        .rec-audio { width: 100%; border-radius: 8px; height: 36px; }

        .rec-actions { display: flex; gap: 8px; width: 100%; }

        .rec-action-btn {
          flex: 1;
          padding: 10px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s, transform 0.1s;
          border: none;
        }

        .rec-action-btn:hover { transform: translateY(-1px); }

        .rec-action-btn.secondary {
          background: #EFECE4;
          color: #3A3A3A;
          border: 0.5px solid #E0DDD4;
        }

        .rec-action-btn.secondary:hover { background: #E5E1D6; }

        .rec-action-btn.primary {
          background: #1D9E75;
          color: #fff;
        }

        .rec-action-btn.primary:hover { background: #0F6E56; }

        .rec-spinner {
          width: 28px; height: 28px;
          border: 2px solid rgba(29,158,117,0.2);
          border-top-color: #1D9E75;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        .rec-uploading-text { font-size: 13px; color: #888; }

        .rec-success-icon {
          width: 56px; height: 56px;
          border-radius: 50%;
          background: #E1F5EE;
          display: flex; align-items: center; justify-content: center;
          font-size: 22px;
        }

        .rec-success-text { font-size: 14px; font-weight: 500; color: #085041; text-align: center; }
        .rec-success-sub { font-size: 12px; color: #999; text-align: center; }

        .rec-error-text { font-size: 12px; color: #E24B4A; text-align: center; background: #FCEBEB; border: 0.5px solid #F09595; border-radius: 8px; padding: 8px 12px; }

        .rec-permission-text { font-size: 13px; color: #888; display: flex; align-items: center; gap: 6px; }

        .rec-consent {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          font-size: 11px;
          color: #888;
          cursor: pointer;
          line-height: 1.5;
          width: 100%;
        }

        .rec-consent input { margin-top: 2px; accent-color: #1D9E75; }

        .waveform { display: flex; align-items: center; gap: 2px; height: 20px; }
        .wave-bar {
          width: 3px; border-radius: 99px; background: rgba(255,255,255,0.8);
          animation: wave 0.5s ease-in-out infinite;
        }
        .wave-bar:nth-child(1){animation-delay:0s;height:6px}
        .wave-bar:nth-child(2){animation-delay:.07s;height:14px}
        .wave-bar:nth-child(3){animation-delay:.14s;height:20px}
        .wave-bar:nth-child(4){animation-delay:.21s;height:16px}
        .wave-bar:nth-child(5){animation-delay:.14s;height:20px}
        .wave-bar:nth-child(6){animation-delay:.07s;height:12px}
        .wave-bar:nth-child(7){animation-delay:0s;height:6px}
        @keyframes wave { 0%,100%{transform:scaleY(0.4)} 50%{transform:scaleY(1)} }
      `}</style>

      <div className="rec-wrap">

        {/* IDLE */}
        {state === "idle" && (
          <>
            <button className="rec-btn idle" onClick={requestPermission}>
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 3C11 3 7.5 5.5 7.5 9.5V13C7.5 14.7 9.1 16 11 16C12.9 16 14.5 14.7 14.5 13V9.5C14.5 5.5 11 3 11 3Z" fill="white" opacity=".9"/>
                <path d="M7 14C7 16.2 8.8 18 11 18" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M11 18V20" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <span className="rec-btn-label">Tap to start</span>
            </button>
            <span className="rec-hint">Tap the button and speak for up to {maxDurationSec}s</span>
          </>
        )}

        {/* REQUESTING PERMISSION */}
        {state === "requesting_permission" && (
          <div className="rec-permission-text">
            <div className="rec-spinner" />
            Requesting microphone...
          </div>
        )}

        {/* READY */}
        {state === "ready" && (
          <>
            <button
              className="rec-btn ready"
              onClick={startRecording}
              disabled={!consentGiven}
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 3C11 3 7.5 5.5 7.5 9.5V13C7.5 14.7 9.1 16 11 16C12.9 16 14.5 14.7 14.5 13V9.5C14.5 5.5 11 3 11 3Z" fill="white" opacity=".9"/>
                <path d="M7 14C7 16.2 8.8 18 11 18" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                <path d="M11 18V20" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
              </svg>
              <span className="rec-btn-label">Record</span>
            </button>
            <span className="rec-hint">Ready — tap to start recording</span>
            {consentRequired && (
              <label className="rec-consent">
                <input
                  type="checkbox"
                  checked={consentGiven}
                  onChange={(e) => setConsentGiven(e.target.checked)}
                />
                <span>{consentText ?? "By recording, you consent to audio processing."}</span>
              </label>
            )}
          </>
        )}

        {/* RECORDING */}
        {state === "recording" && (
          <>
            <button className="rec-btn recording" onClick={stopRecording}>
              <span className="rec-countdown">{countdown}</span>
              <div className="waveform">
                {[1,2,3,4,5,6,7].map(i => <div key={i} className="wave-bar" />)}
              </div>
            </button>
            <span className="rec-hint">Tap to stop early</span>
          </>
        )}

        {/* PREVIEW */}
        {state === "preview" && audioUrl && (
          <>
            <audio src={audioUrl} controls className="rec-audio" />
            <div className="rec-actions">
              <button className="rec-action-btn secondary" onClick={reRecord}>
                Re-record
              </button>
              <button className="rec-action-btn primary" onClick={submit}>
                Send feedback
              </button>
            </div>
          </>
        )}

        {/* UPLOADING */}
        {state === "uploading" && (
          <>
            <div className="rec-spinner" style={{width:40,height:40,borderWidth:3}} />
            <span className="rec-uploading-text">Submitting your feedback...</span>
          </>
        )}

        {/* SUBMITTED */}
        {state === "submitted" && (
          <>
            <div className="rec-success-icon">✓</div>
            <div className="rec-success-text">Thank you for your feedback!</div>
            <div className="rec-success-sub">Your voice has been received and is being processed.</div>
          </>
        )}

        {/* ERROR */}
        {state === "error" && (
          <>
            <div className="rec-error-text">{error}</div>
            <button
              className="rec-action-btn secondary"
              onClick={() => { setError(null); setState("idle"); }}
              style={{width:"100%"}}
            >
              Try again
            </button>
          </>
        )}

      </div>
    </>
  );
}