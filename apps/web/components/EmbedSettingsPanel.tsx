"use client";

import { useEffect, useState } from "react";

type PartnerProfile = {
  allowedOrigins: string | null;
  embedKeyPrefix: string | null;
  businessContext: string | null;
};

export function EmbedSettingsPanel() {
  const [profile, setProfile] = useState<PartnerProfile | null>(null);
  const [allowedOrigins, setAllowedOrigins] = useState("");
  const [businessContext, setBusinessContext] = useState("");
  const [embedKeyOnce, setEmbedKeyOnce] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  const load = () => {
    fetch("/api/partners/me")
      .then((r) => r.json())
      .then((data) => {
        setProfile(data);
        setAllowedOrigins(data.allowedOrigins ?? "");
        setBusinessContext(data.businessContext ?? "");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const saveSettings = async () => {
    setSaving(true);
    setError("");
    const res = await fetch("/api/partners/me/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allowedOrigins: allowedOrigins.trim() || null,
        businessContext: businessContext.trim() || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? data.message ?? "Save failed");
      return;
    }
    load();
  };

  const revealEmbedKey = async () => {
    setError("");
    const res = await fetch("/api/partners/me/embed/regenerate", {
      method: "POST",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Could not generate embed key");
      return;
    }
    setEmbedKeyOnce(data.embedKey);
    load();
  };

  const copyEmbed = () => {
    if (!embedKeyOnce) return;
    navigator.clipboard.writeText(embedKeyOnce);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="card">
        <div className="ch">
          <div className="ct">Widget embed</div>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="ch">
        <div className="ct">Widget embed</div>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
        Add your website URL and paste the widget embed key into{" "}
        <code style={{ fontSize: 12 }}>@hearloop/react</code>. End-user recordings
        will only work from listed origins.
      </p>

      <label style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)" }}>
        Allowed website origins (comma-separated)
      </label>
      <input
        style={{
          width: "100%",
          marginTop: 6,
          marginBottom: 14,
          padding: "10px 12px",
          borderRadius: 8,
          border: "0.5px solid var(--paper-3)",
          fontSize: 13,
        }}
        placeholder="https://quicklube-demo.vercel.app"
        value={allowedOrigins}
        onChange={(e) => setAllowedOrigins(e.target.value)}
      />

      <label style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)" }}>
        Business context (optional, improves AI topics)
      </label>
      <textarea
        style={{
          width: "100%",
          marginTop: 6,
          marginBottom: 14,
          minHeight: 90,
          padding: "10px 12px",
          borderRadius: 8,
          border: "0.5px solid var(--paper-3)",
          fontSize: 13,
        }}
        value={businessContext}
        onChange={(e) => setBusinessContext(e.target.value)}
      />

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--ink-3)", marginBottom: 6 }}>
          Widget embed key{" "}
          {profile?.embedKeyPrefix ? (
            <span style={{ fontFamily: "var(--font-mono)" }}>
              ({profile.embedKeyPrefix}…)
            </span>
          ) : (
            "(none)"
          )}
        </div>
        {embedKeyOnce ? (
          <div
            style={{
              background: "var(--paper-2)",
              padding: 12,
              borderRadius: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              wordBreak: "break-all",
            }}
          >
            {embedKeyOnce}
            <button
              type="button"
              className="btn-sm"
              style={{ marginLeft: 8 }}
              onClick={copyEmbed}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <button type="button" className="btn-primary" onClick={revealEmbedKey}>
            Reveal / regenerate embed key
          </button>
        )}
        <p style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 8 }}>
          Shown once. Regenerating revokes the previous key.
        </p>
      </div>

      <pre
        style={{
          background: "var(--paper-2)",
          padding: 12,
          borderRadius: 8,
          fontSize: 11,
          overflow: "auto",
          marginBottom: 14,
        }}
      >{`<HearloopWidget
  embedKey="pk-live_…"
  apiBaseUrl="https://18-223-189-193.nip.io/v1"
/>`}</pre>

      <button
        type="button"
        className="btn-primary"
        disabled={saving}
        onClick={saveSettings}
      >
        {saving ? "Saving…" : "Save embed settings"}
      </button>
      {error && (
        <p style={{ color: "var(--red)", fontSize: 12, marginTop: 10 }}>{error}</p>
      )}
    </div>
  );
}
