"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

type CaptureLink = {
  id: string;
  token: string;
  targetLabel: string | null;
  targetKey: string | null;
  path: string;
  createdAt: string;
};

export function CaptureLinksPanel() {
  const [links, setLinks] = useState<CaptureLink[]>([]);
  const [origin, setOrigin] = useState("");
  const [label, setLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/partners/me/capture-links")
      .then((r) => r.json())
      .then((data) => {
        setLinks(data.links ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    load();
  }, []);

  const createLink = async () => {
    setCreating(true);
    setError("");
    const res = await fetch("/api/partners/me/capture-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetLabel: label.trim() || undefined }),
    });
    setCreating(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Could not create link");
      return;
    }
    setLabel("");
    load();
  };

  const deactivate = async (id: string) => {
    await fetch(`/api/partners/me/capture-links/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div className="card">
      <div className="ch">
        <div className="ct">Capture links &amp; QR codes</div>
      </div>
      <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16, lineHeight: 1.5 }}>
        Print a QR code on a receipt, counter card, or service bay. A customer scans it,
        records 5 seconds, and the feedback lands here — attributed to the location or
        service you label. One link is reusable for every visitor.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        <input
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 8,
            border: "0.5px solid var(--paper-3)",
            fontSize: 13,
          }}
          placeholder="Target label (optional) — e.g. North Ave — Oil Change"
          value={label}
          maxLength={120}
          onChange={(e) => setLabel(e.target.value)}
        />
        <button
          type="button"
          className="btn-primary"
          disabled={creating}
          onClick={createLink}
        >
          {creating ? "Creating…" : "New link"}
        </button>
      </div>

      {error && (
        <p style={{ color: "var(--red)", fontSize: 12, marginBottom: 12 }}>{error}</p>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>Loading…</p>
      ) : links.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--ink-3)" }}>
          No capture links yet. Create one above to generate a scannable QR code.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {links.map((link) => (
            <CaptureLinkRow
              key={link.id}
              link={link}
              url={origin ? `${origin}${link.path}` : link.path}
              onDeactivate={() => deactivate(link.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CaptureLinkRow({
  link,
  url,
  onDeactivate,
}: {
  link: CaptureLink;
  url: string;
  onDeactivate: () => void;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 320, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  const copy = () => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const slug = (link.targetKey || "capture").replace(/[^a-z0-9]+/g, "-");

  return (
    <div
      style={{
        display: "flex",
        gap: 16,
        background: "var(--paper-2)",
        border: "0.5px solid var(--paper-3)",
        borderRadius: 10,
        padding: 14,
        alignItems: "center",
      }}
    >
      {qr ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={qr}
          alt={`QR code for ${link.targetLabel ?? "capture link"}`}
          width={88}
          height={88}
          style={{ borderRadius: 6, background: "#fff", flexShrink: 0 }}
        />
      ) : (
        <div style={{ width: 88, height: 88, flexShrink: 0 }} />
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)", marginBottom: 4 }}>
          {link.targetLabel ?? "General feedback"}
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ink-3)",
            wordBreak: "break-all",
            marginBottom: 10,
          }}
        >
          {url}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn-sm" onClick={copy}>
            {copied ? "Copied" : "Copy link"}
          </button>
          {qr && (
            <a className="btn-sm" href={qr} download={`hearloop-qr-${slug}.png`}>
              Download QR
            </a>
          )}
          <button
            type="button"
            className="btn-sm"
            style={{ color: "var(--red)" }}
            onClick={onDeactivate}
          >
            Deactivate
          </button>
        </div>
      </div>
    </div>
  );
}
