"use client";

import { useEffect, useState } from "react";

export function ApiSettingsPanel() {
  const [secretPrefix, setSecretPrefix] = useState<string | null>(null);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/partners/me")
      .then((r) => r.json())
      .then((data) => {
        setSecretPrefix(data.hasSecretKey ? data.secretKeyPrefix : null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const generate = async () => {
    const res = await fetch("/api/partners/me/secret-keys", { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setSecretOnce(data.secretKey);
      setSecretPrefix(data.keyPrefix);
    }
  };

  return (
    <div className="card">
      <div className="ch">
        <div className="ct">API access (optional)</div>
        <button type="button" className="btn-primary" onClick={generate}>
          {secretPrefix ? "Rotate secret key" : "Generate secret key"}
        </button>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 14, lineHeight: 1.5 }}>
        Secret keys are for server-side integrations and curl — not for your website
        widget. Dashboard login uses your email and password.
      </p>
      {loading ? (
        <p style={{ fontSize: 12, color: "var(--ink-3)" }}>Loading…</p>
      ) : (
        <>
          {secretPrefix && !secretOnce && (
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 12 }}>
              Active key: {secretPrefix}…
            </p>
          )}
          {secretOnce && (
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
              {secretOnce}
              <button
                type="button"
                className="btn-sm"
                style={{ marginLeft: 8 }}
                onClick={() => {
                  navigator.clipboard.writeText(secretOnce);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
