"use client";

import { HearloopWidget } from "@hearloop/react";

const API_BASE =
  process.env.NEXT_PUBLIC_HEARLOOP_API_BASE_URL ??
  "https://18-223-189-193.nip.io/v1";

export function HearloopWidgetEmbed() {
  const embedKey = process.env.NEXT_PUBLIC_HEARLOOP_EMBED_KEY;

  if (!embedKey) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: 16,
          left: 16,
          right: 16,
          maxWidth: 360,
          padding: "12px 14px",
          background: "#fff3cd",
          border: "1px solid #ffc107",
          borderRadius: 10,
          fontSize: 12,
          lineHeight: 1.45,
          zIndex: 9998,
          boxShadow: "0 4px 20px rgba(0,0,0,0.12)",
        }}
      >
        <strong>Dev:</strong> Set{" "}
        <code style={{ fontSize: 11 }}>NEXT_PUBLIC_HEARLOOP_EMBED_KEY</code> in{" "}
        <code style={{ fontSize: 11 }}>.env.local</code> (from Hearloop → Widget
        embed).
      </div>
    );
  }

  return (
    <HearloopWidget
      embedKey={embedKey}
      apiBaseUrl={API_BASE}
      accentColor="#c41e3a"
      position="bottom-right"
      promptText="How was your visit today?"
      maxDurationSec={5}
    />
  );
}
