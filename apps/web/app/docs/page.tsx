"use client";
// hearloop/apps/web/app/docs/page.tsx

import { useState } from "react";

type Section = "quickstart" | "widget" | "api" | "webhooks" | "errors" | "browsers";

const NAV: { id: Section; label: string; icon: string }[] = [
  { id: "quickstart", label: "Quickstart", icon: "M3 7H13M3 11H10M3 15H8" },
  { id: "widget", label: "JS Widget", icon: "M4 4H16M4 8H12M4 12H10" },
  { id: "api", label: "REST API", icon: "M2 6L8 3L14 6L8 9L2 6ZM2 6V12L8 15L14 12V6" },
  { id: "webhooks", label: "Webhooks", icon: "M2 4.5L7 7.5L12 4.5M2 4.5V9.5C2 10.1 2.4 10.5 3 10.5H11C11.6 10.5 12 10.1 12 9.5V4.5M2 4.5L7 1.5L12 4.5" },
  { id: "errors", label: "Error reference", icon: "M7 3V8M7 11V12M1.5 7C1.5 3.96 3.96 1.5 7 1.5C10.04 1.5 12.5 3.96 12.5 7C12.5 10.04 10.04 12.5 7 12.5C3.96 12.5 1.5 10.04 1.5 7Z" },
  { id: "browsers", label: "Browser support", icon: "M1.5 4H12.5V11H1.5V4ZM4 11V13M10 11V13M3 13H11" },
];

function Code({ children, lang = "" }: { children: string; lang?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div style={{ background: "#0E0E0E", borderRadius: 10, overflow: "hidden", margin: "16px 0" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "0.5px solid rgba(255,255,255,0.06)" }}>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "var(--mono)" }}>{lang}</span>
        <button
          onClick={() => { navigator.clipboard.writeText(children); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          style={{ fontSize: 11, padding: "3px 10px", background: "rgba(255,255,255,0.07)", border: "0.5px solid rgba(255,255,255,0.1)", borderRadius: 5, color: copied ? "#7EC8A4" : "rgba(255,255,255,0.5)", cursor: "pointer", fontFamily: "var(--mono)" }}
        >{copied ? "✓ Copied" : "Copy"}</button>
      </div>
      <pre style={{ padding: "16px", fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.7, color: "rgba(255,255,255,0.75)", overflowX: "auto", margin: 0 }}>{children}</pre>
    </div>
  );
}

function Endpoint({ method, path, desc }: { method: string; path: string; desc: string }) {
  const colors: Record<string, string> = { GET: "#378ADD", POST: "#1D9E75", DELETE: "#E24B4A" };
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 0", borderBottom: "0.5px solid var(--paper-3)" }}>
      <span style={{ background: colors[method] + "20", color: colors[method], fontSize: 10, fontWeight: 600, padding: "3px 7px", borderRadius: 4, fontFamily: "var(--mono)", flexShrink: 0, marginTop: 1 }}>{method}</span>
      <div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink)", marginBottom: 3 }}>{path}</div>
        <div style={{ fontSize: 12, color: "var(--ink-3)" }}>{desc}</div>
      </div>
    </div>
  );
}

function Badge({ children, color = "var(--green)" }: { children: string; color?: string }) {
  return <span style={{ background: color + "18", color, fontSize: 10, fontWeight: 500, padding: "2px 7px", borderRadius: 99, border: `0.5px solid ${color}40` }}>{children}</span>;
}

function H2({ children }: { children: string }) {
  return <h2 style={{ fontFamily: "var(--serif)", fontSize: 26, color: "var(--ink)", marginBottom: 8, marginTop: 36, lineHeight: 1.2 }}>{children}</h2>;
}

function H3({ children }: { children: string }) {
  return <h3 style={{ fontSize: 14, fontWeight: 500, color: "var(--ink)", marginBottom: 8, marginTop: 24 }}>{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.7, marginBottom: 12 }}>{children}</p>;
}

function Callout({ type = "info", children }: { type?: "info" | "warn" | "tip"; children: React.ReactNode }) {
  const styles = {
    info: { bg: "#E6F1FB", border: "#85B7EB", icon: "ℹ", color: "#0C447C" },
    warn: { bg: "#FAEEDA", border: "#EF9F27", icon: "⚠", color: "#633806" },
    tip: { bg: "#E1F5EE", border: "#9FE1CB", icon: "✦", color: "#085041" },
  };
  const s = styles[type];
  return (
    <div style={{ background: s.bg, border: `0.5px solid ${s.border}`, borderRadius: 8, padding: "12px 14px", display: "flex", gap: 10, margin: "16px 0" }}>
      <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{s.icon}</span>
      <div style={{ fontSize: 13, color: s.color, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export default function DocsPage() {
  const [section, setSection] = useState<Section>("quickstart");

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --ink: #0E0E0E; --ink-2: #3A3A3A; --ink-3: #888;
          --paper: #F7F4EE; --paper-2: #EFECE4; --paper-3: #E0DDD4;
          --green: #1D9E75; --green-l: #E1F5EE;
          --serif: 'Instrument Serif', serif;
          --sans: 'DM Sans', sans-serif;
          --mono: 'DM Mono', monospace;
        }
        html, body { height: 100%; font-family: var(--sans); background: var(--paper); color: var(--ink); }
        .layout { display: grid; grid-template-columns: 220px 1fr; min-height: 100vh; }
        .sidebar { background: var(--paper); border-right: 0.5px solid var(--paper-3); position: sticky; top: 0; height: 100vh; overflow-y: auto; display: flex; flex-direction: column; }
        .sid-logo { padding: 20px 18px; border-bottom: 0.5px solid var(--paper-3); display: flex; align-items: center; gap: 8px; font-family: var(--serif); font-size: 18px; color: var(--ink); text-decoration: none; }
        .logo-drop { width: 24px; height: 24px; background: var(--green); border-radius: 50% 50% 50% 7px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .sid-nav { padding: 16px 12px; flex: 1; }
        .sid-section { font-size: 10px; font-weight: 500; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.08em; padding: 10px 6px 4px; }
        .sid-item { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-radius: 7px; font-size: 12px; color: var(--ink-2); cursor: pointer; transition: background 0.1s, color 0.1s; }
        .sid-item:hover { background: var(--paper-2); color: var(--ink); }
        .sid-item.active { background: var(--green-l); color: #085041; font-weight: 500; }
        .sid-footer { padding: 14px 12px; border-top: 0.5px solid var(--paper-3); }
        .sid-footer a { font-size: 12px; color: var(--ink-3); text-decoration: none; display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 6px; transition: background 0.1s; }
        .sid-footer a:hover { background: var(--paper-2); color: var(--ink); }
        .topbar { background: var(--paper); border-bottom: 0.5px solid var(--paper-3); padding: 0 40px; height: 52px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
        .topbar-title { font-size: 13px; font-weight: 500; color: var(--ink); }
        .topbar-right { display: flex; align-items: center; gap: 12px; }
        .topbar-link { font-size: 12px; color: var(--ink-3); text-decoration: none; transition: color 0.1s; }
        .topbar-link:hover { color: var(--green); }
        .topbar-btn { background: var(--green); color: #fff; border: none; padding: 7px 14px; border-radius: 7px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: var(--sans); text-decoration: none; }
        .main { display: flex; flex-direction: column; }
        .content { padding: 40px; max-width: 720px; }
        .page-title { font-family: var(--serif); font-size: 36px; color: var(--ink); margin-bottom: 6px; line-height: 1.1; }
        .page-sub { font-size: 15px; color: var(--ink-3); margin-bottom: 32px; font-weight: 300; }
        .steps { display: flex; flex-direction: column; gap: 0; counter-reset: step; }
        .step { display: flex; gap: 16px; padding-bottom: 28px; position: relative; }
        .step::before { content: counter(step); counter-increment: step; width: 26px; height: 26px; background: var(--ink); color: var(--paper); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 500; flex-shrink: 0; margin-top: 2px; font-family: var(--mono); }
        .step::after { content: ''; position: absolute; left: 13px; top: 32px; bottom: 0; width: 0.5px; background: var(--paper-3); }
        .step:last-child::after { display: none; }
        .step-body { flex: 1; }
        .step-title { font-size: 14px; font-weight: 500; color: var(--ink); margin-bottom: 6px; }
        .step-desc { font-size: 13px; color: var(--ink-2); line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 16px 0; }
        th { text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 500; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.06em; border-bottom: 0.5px solid var(--paper-3); }
        td { padding: 10px 12px; border-bottom: 0.5px solid var(--paper-3); color: var(--ink-2); vertical-align: top; line-height: 1.5; }
        td:first-child { font-family: var(--mono); font-size: 11px; color: var(--green); }
        tr:last-child td { border-bottom: none; }
        .tag { display: inline-block; background: var(--paper-2); border: 0.5px solid var(--paper-3); border-radius: 4px; padding: 1px 6px; font-family: var(--mono); font-size: 11px; color: var(--ink-2); }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .content { animation: fadeIn 0.25s ease both; }
      `}</style>

      <div className="layout">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <a href="/" className="sid-logo">
            <div className="logo-drop">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1C6 1 3 3.5 3 6.5C3 8.2 4.3 9.5 6 9.5C7.7 9.5 9 8.2 9 6.5C9 3.5 6 1 6 1Z" fill="white" opacity=".9"/>
                <circle cx="6" cy="6.5" r="1.2" fill="white" opacity=".5"/>
              </svg>
            </div>
            Hearloop
          </a>

          <div className="sid-nav">
            <div className="sid-section">Documentation</div>
            {NAV.map((item) => (
              <div
                key={item.id}
                className={`sid-item ${section === item.id ? "active" : ""}`}
                onClick={() => setSection(item.id)}
              >
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                  <path d={item.icon} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {item.label}
              </div>
            ))}
          </div>

          <div className="sid-footer">
            <a href="https://github.com/shubh209/Hearloop">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1C3.46 1 1 3.46 1 6.5C1 8.91 2.57 10.96 4.74 11.68C5.01 11.73 5.11 11.57 5.11 11.42V10.41C3.66 10.73 3.34 9.73 3.34 9.73C3.09 9.1 2.73 8.94 2.73 8.94C2.23 8.61 2.77 8.62 2.77 8.62C3.32 8.66 3.61 9.19 3.61 9.19C4.1 10.02 4.9 9.79 5.13 9.65C5.18 9.3 5.32 9.07 5.47 8.94C4.32 8.82 3.1 8.38 3.1 6.41C3.1 5.82 3.31 5.34 3.62 4.96C3.57 4.83 3.38 4.28 3.67 3.54C3.67 3.54 4.13 3.41 5.11 4.09C5.52 3.98 5.96 3.92 6.5 3.92C7.04 3.92 7.48 3.98 7.89 4.09C8.87 3.41 9.33 3.54 9.33 3.54C9.62 4.28 9.43 4.83 9.38 4.96C9.69 5.34 9.9 5.82 9.9 6.41C9.9 8.39 8.68 8.82 7.53 8.94C7.71 9.1 7.89 9.42 7.89 9.9V11.42C7.89 11.57 7.99 11.73 8.26 11.68C10.43 10.96 12 8.91 12 6.5C12 3.46 9.54 1 6.5 1Z" fill="currentColor"/></svg>
              GitHub
            </a>
            <a href="/dashboard">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="1" y="1" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/><rect x="7.5" y="1" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/><rect x="1" y="7.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/><rect x="7.5" y="7.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1"/></svg>
              Dashboard
            </a>
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          <div className="topbar">
            <div className="topbar-title">
              {NAV.find(n => n.id === section)?.label}
            </div>
            <div className="topbar-right">
              <a href="/" className="topbar-link">Home</a>
              <a href="/dashboard" className="topbar-btn">Get API key</a>
            </div>
          </div>

          <div className="content" key={section}>

            {/* ── QUICKSTART ── */}
            {section === "quickstart" && (
              <>
                <div className="page-title">Quickstart</div>
                <div className="page-sub">Get voice feedback running on your site in under 5 minutes.</div>

                <Callout type="tip">
                  You'll need an API key from your <a href="/dashboard" style={{color:"var(--green)"}}>Hearloop dashboard</a> before starting.
                </Callout>

                <div className="steps">
                  <div className="step">
                    <div className="step-body">
                      <div className="step-title">Get your API key</div>
                      <div className="step-desc">Sign in to your dashboard and navigate to API keys. Click "Generate key" and copy your <span className="tag">sk-live_</span> key.</div>
                    </div>
                  </div>
                  <div className="step">
                    <div className="step-body">
                      <div className="step-title">Add the widget script</div>
                      <div className="step-desc">Paste this before your closing <span className="tag">&lt;/body&gt;</span> tag:</div>
                      <Code lang="html">{`<script src="https://hearloop.vercel.app/widget.js"></script>
<script>
  Hearloop.init({
    apiKey: "sk-live_your_key_here",
    promptText: "How was your service today?",
    maxDurationSec: 5,
    position: "bottom-right"
  });
</script>`}</Code>
                    </div>
                  </div>
                  <div className="step">
                    <div className="step-body">
                      <div className="step-title">Set up your webhook</div>
                      <div className="step-desc">Add a webhook endpoint in your dashboard. Hearloop will POST structured JSON to your URL when feedback is processed.</div>
                      <Code lang="typescript">{`// Your webhook handler (Next.js example)
export async function POST(req: Request) {
  const sig = req.headers.get("x-hearloop-signature");
  const body = await req.text();

  // Verify signature
  const valid = verifySignature(body, sig, process.env.WEBHOOK_SECRET);
  if (!valid) return new Response("Unauthorized", { status: 401 });

  const event = JSON.parse(body);

  if (event.type === "session.completed") {
    const { transcript, sentiment, topics, urgency } = event.data.analysis;
    // Handle your feedback data here
    console.log({ transcript, sentiment, topics, urgency });
  }

  return new Response("OK");
}`}</Code>
                    </div>
                  </div>
                  <div className="step">
                    <div className="step-body">
                      <div className="step-title">You're live</div>
                      <div className="step-desc">The green Hearloop bubble will appear on your site. Customers tap, speak for up to 5 seconds, and you receive structured insights automatically.</div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ── WIDGET ── */}
            {section === "widget" && (
              <>
                <div className="page-title">JS Widget</div>
                <div className="page-sub">Embeddable voice capture widget — CDN or npm.</div>

                <H2>Installation</H2>
                <P>Add via CDN (recommended for most integrations):</P>
                <Code lang="html">{`<script src="https://hearloop.vercel.app/widget.js"></script>`}</Code>

                <H2>Configuration</H2>
                <Code lang="javascript">{`Hearloop.init({
  apiKey: "sk-live_your_key",      // Required
  promptText: "How was your experience?", // Default: "How was your experience today?"
  maxDurationSec: 5,               // 1–30, default: 5
  position: "bottom-right",        // "bottom-right" | "bottom-left"
  accentColor: "#1D9E75",          // Any hex color
  apiBaseUrl: "https://..."        // Optional: override API base URL
});`}</Code>

                <H2>Config options</H2>
                <table>
                  <thead><tr><th>Option</th><th>Type</th><th>Required</th><th>Description</th></tr></thead>
                  <tbody>
                    {[
                      ["apiKey", "string", "Yes", "Your sk-live_ partner API key"],
                      ["promptText", "string", "No", "Question shown to the customer in the widget"],
                      ["maxDurationSec", "number", "No", "Max recording length in seconds. Default: 5"],
                      ["position", "string", "No", `"bottom-right" or "bottom-left". Default: "bottom-right"`],
                      ["accentColor", "string", "No", "Hex color for the widget button and accents"],
                      ["apiBaseUrl", "string", "No", "Override the Hearloop API base URL"],
                    ].map(([opt, type, req, desc]) => (
                      <tr key={opt as string}><td>{opt}</td><td><span className="tag">{type}</span></td><td>{req}</td><td>{desc}</td></tr>
                    ))}
                  </tbody>
                </table>

                <H2>Widget states</H2>
                <P>The widget manages these UI states automatically:</P>
                <table>
                  <thead><tr><th>State</th><th>Description</th></tr></thead>
                  <tbody>
                    {[
                      ["idle", "Default — floating button visible"],
                      ["requesting_permission", "Requesting microphone access"],
                      ["recording", "Actively recording with countdown timer"],
                      ["recorded", "Recording complete — awaiting submit"],
                      ["sending", "Uploading audio + finalizing session"],
                      ["success", "Feedback received successfully"],
                      ["error", "Something went wrong — shows retry option"],
                    ].map(([s, d]) => (
                      <tr key={s as string}><td>{s}</td><td>{d}</td></tr>
                    ))}
                  </tbody>
                </table>

                <Callout type="warn">
                  The widget requires microphone permission. On iOS Safari, recording only works in the top-level browsing context — not inside iframes.
                </Callout>
              </>
            )}

            {/* ── API ── */}
            {section === "api" && (
              <>
                <div className="page-title">REST API</div>
                <div className="page-sub">Base URL: <span className="tag">http://18.223.189.193:3001/v1</span></div>

                <Callout type="info">
                  All partner API endpoints require a Bearer token: <span className="tag">Authorization: Bearer sk-live_your_key</span>
                </Callout>

                <H2>Authentication</H2>
                <Code lang="bash">{`curl -X POST http://18.223.189.193:3001/v1/sessions \\
  -H "Authorization: Bearer sk-live_your_key" \\
  -H "Content-Type: application/json" \\
  -d '{ "maxDurationSec": 5 }'`}</Code>

                <H2>Endpoints</H2>
                <Endpoint method="POST" path="/sessions" desc="Create a new feedback session. Returns sessionId, sessionToken, and captureUrl." />
                <Endpoint method="GET" path="/sessions/:id" desc="Fetch session status and metadata." />
                <Endpoint method="GET" path="/sessions/:id/result" desc="Fetch completed analysis — transcript, sentiment, topics, urgency." />
                <Endpoint method="POST" path="/sessions/:id/upload-url" desc="Get a short-lived signed S3 URL for direct audio upload." />
                <Endpoint method="POST" path="/sessions/:id/finalize" desc="Submit the session for processing after audio upload." />
                <Endpoint method="DELETE" path="/sessions/:id" desc="Delete session, audio, and analysis (privacy compliance)." />
                <Endpoint method="GET" path="/public/session/:token" desc="Resolve public session token → widget config. No auth required." />
                <Endpoint method="POST" path="/public/session/:token/open" desc="Mark session as opened. No auth required." />

                <H2>Create session — request body</H2>
                <Code lang="json">{`{
  "externalEventId": "job_456",      // Your internal reference ID
  "externalUserId": "user_123",      // Optional customer identifier
  "maxDurationSec": 5,               // 1–30
  "languageHint": "en",              // ISO 639-1 language code
  "promptText": "How was your service today?",
  "consentRequired": true,
  "consentText": "By recording, you consent to audio processing.",
  "metadata": { "locationId": "loc_1" }
}`}</Code>

                <H2>Session result — response</H2>
                <Code lang="json">{`{
  "sessionId": "sess_01HRXQZ7S9T0",
  "status": "completed",
  "recording": {
    "mimeType": "audio/webm",
    "durationMs": 4720
  },
  "analysis": {
    "transcript": "Staff was friendly, but I waited too long.",
    "detectedLanguage": "en",
    "sentiment": "negative",
    "sentimentScore": 0.78,
    "topics": ["staff_friendliness", "wait_time"],
    "urgency": "follow_up",
    "summary": "Customer praised staff but complained about wait time.",
    "qualityFlags": [],
    "moderationFlags": []
  }
}`}</Code>

                <H2>Rate limits</H2>
                <table>
                  <thead><tr><th>Route type</th><th>Limit</th><th>Key</th></tr></thead>
                  <tbody>
                    <tr><td>Partner API</td><td>100 req/min</td><td>API key prefix</td></tr>
                    <tr><td>Public widget</td><td>30 req/min</td><td>IP address</td></tr>
                    <tr><td>Health check</td><td>Unlimited</td><td>—</td></tr>
                  </tbody>
                </table>
              </>
            )}

            {/* ── WEBHOOKS ── */}
            {section === "webhooks" && (
              <>
                <div className="page-title">Webhooks</div>
                <div className="page-sub">Real-time event delivery to your endpoint.</div>

                <H2>Event types</H2>
                <table>
                  <thead><tr><th>Event</th><th>When</th></tr></thead>
                  <tbody>
                    {[
                      ["session.created", "A new session is created"],
                      ["session.opened", "Widget opened by customer"],
                      ["session.submitted", "Audio submitted for processing"],
                      ["session.processing", "AI pipeline started"],
                      ["session.completed", "Analysis complete — includes full result"],
                      ["session.failed", "Processing failed"],
                      ["session.expired", "Session expired before submission"],
                      ["session.deleted", "Session deleted by partner"],
                    ].map(([e, w]) => (
                      <tr key={e as string}><td>{e}</td><td>{w}</td></tr>
                    ))}
                  </tbody>
                </table>

                <H2>Signature verification</H2>
                <P>Every webhook includes an <span className="tag">X-Hearloop-Signature</span> header. Always verify it before processing.</P>
                <Code lang="typescript">{`import { createHmac } from "crypto";

function verifySignature(
  rawBody: string,
  signature: string,
  secret: string,
  timestamp: string
): boolean {
  const signed = \`\${timestamp}.\${rawBody}\`;
  const expected = "sha256=" + createHmac("sha256", secret)
    .update(signed)
    .digest("hex");
  return expected === signature;
}

// In your handler:
const sig = req.headers["x-hearloop-signature"];
const ts  = req.headers["x-hearloop-timestamp"];
const body = req.rawBody; // Must be raw string, not parsed JSON

if (!verifySignature(body, sig, process.env.WEBHOOK_SECRET, ts)) {
  return res.status(401).json({ error: "Invalid signature" });
}`}</Code>

                <Callout type="warn">
                  Always use the raw request body string for verification — not the parsed JSON object. Parsing changes whitespace and breaks the HMAC.
                </Callout>

                <H2>Retry policy</H2>
                <table>
                  <thead><tr><th>Attempt</th><th>Delay</th></tr></thead>
                  <tbody>
                    {[["1","Immediate"],["2","5s"],["3","10s"],["4","20s"],["5","40s"],["6","80s"],["7 (final)","160s — dead-letter after this"]].map(([a,d]) => (
                      <tr key={a as string}><td>{a}</td><td>{d}</td></tr>
                    ))}
                  </tbody>
                </table>

                <P>After 7 failed attempts the delivery is marked <span className="tag">dead</span>. Check your dashboard for dead-letter events.</P>

                <H2>Example payload (session.completed)</H2>
                <Code lang="json">{`{
  "id": "evt_01HRXQZ7S9T0",
  "type": "session.completed",
  "sessionId": "sess_01HRXQZ7S9T0",
  "createdAt": "2026-05-01T10:30:00.000Z",
  "data": {
    "status": "completed",
    "externalEventId": "job_456",
    "recording": { "mimeType": "audio/webm", "durationMs": 4720 },
    "analysis": {
      "transcript": "Staff was friendly but I waited too long.",
      "sentiment": "negative",
      "sentimentScore": 0.78,
      "topics": ["staff_friendliness", "wait_time"],
      "urgency": "follow_up",
      "summary": "Customer praised staff but complained about wait time."
    }
  }
}`}</Code>
              </>
            )}

            {/* ── ERRORS ── */}
            {section === "errors" && (
              <>
                <div className="page-title">Error reference</div>
                <div className="page-sub">All errors return JSON with <span className="tag">statusCode</span>, <span className="tag">error</span>, and <span className="tag">message</span>.</div>

                <table>
                  <thead><tr><th>Code</th><th>HTTP</th><th>Meaning</th></tr></thead>
                  <tbody>
                    {[
                      ["missing_auth", "401", "No Authorization header provided"],
                      ["invalid_api_key", "401", "API key not found or revoked"],
                      ["session_not_found", "404", "Session ID doesn't exist or belongs to another partner"],
                      ["session_expired", "410", "Session has passed its expiry time"],
                      ["session_already_submitted", "409", "Session was already submitted — cannot re-submit"],
                      ["invalid_session_state", "409", "Operation not valid for current session state"],
                      ["unsupported_mime_type", "400", "Audio format not supported"],
                      ["Too Many Requests", "429", "Rate limit exceeded — max 100 req/min per key"],
                      ["Internal Server Error", "500", "Unexpected server error — contact support"],
                    ].map(([code, http, meaning]) => (
                      <tr key={code as string}><td>{code}</td><td><Badge color={Number(http) >= 500 ? "#E24B4A" : Number(http) >= 400 ? "#EF9F27" : "#1D9E75"}>{http as string}</Badge></td><td>{meaning}</td></tr>
                    ))}
                  </tbody>
                </table>

                <H2>Session state machine</H2>
                <P>Sessions follow a strict state machine. Invalid transitions return <span className="tag">invalid_session_state</span>.</P>
                <Code lang="text">{`created → opened → recording → uploaded → submitted → processing → completed
                                                                              ↘ failed
Any pre-submit state → expired`}</Code>
              </>
            )}

            {/* ── BROWSERS ── */}
            {section === "browsers" && (
              <>
                <div className="page-title">Browser support</div>
                <div className="page-sub">Hearloop uses the Web Audio and MediaRecorder APIs.</div>

                <table>
                  <thead><tr><th>Browser</th><th>Recording</th><th>Notes</th></tr></thead>
                  <tbody>
                    {[
                      ["Chrome 74+", "✅ Full", "Preferred — best MediaRecorder support"],
                      ["Firefox 71+", "✅ Full", "Uses audio/ogg by default"],
                      ["Safari 14.1+", "✅ Full", "Uses audio/mp4 — requires top-level context"],
                      ["Edge 79+", "✅ Full", "Chromium-based — same as Chrome"],
                      ["iOS Safari 14.3+", "⚠️ Partial", "Works but cannot record inside iframes"],
                      ["Samsung Internet", "✅ Full", "Version 10+"],
                      ["IE 11", "❌ None", "Not supported — no MediaRecorder API"],
                    ].map(([b, r, n]) => (
                      <tr key={b as string}><td>{b}</td><td>{r}</td><td>{n}</td></tr>
                    ))}
                  </tbody>
                </table>

                <Callout type="warn">
                  Never embed the Hearloop widget or capture page inside an <span className="tag">&lt;iframe&gt;</span> on iOS. Microphone permissions are blocked in cross-origin iframes on Safari.
                </Callout>

                <H2>Supported audio formats</H2>
                <table>
                  <thead><tr><th>MIME type</th><th>Extension</th><th>Notes</th></tr></thead>
                  <tbody>
                    {[
                      ["audio/webm", ".webm", "Default on Chrome/Firefox"],
                      ["audio/mp4", ".mp4", "Default on Safari/iOS"],
                      ["audio/mpeg", ".mp3", "Supported"],
                      ["audio/ogg", ".ogg", "Firefox default"],
                      ["audio/wav", ".wav", "Supported — larger file size"],
                      ["audio/m4a", ".m4a", "Supported"],
                    ].map(([m, e, n]) => (
                      <tr key={m as string}><td>{m}</td><td>{e}</td><td>{n}</td></tr>
                    ))}
                  </tbody>
                </table>

                <H2>Consent note</H2>
                <P>
                  In regions covered by GDPR, CCPA, or similar privacy laws, enable <span className="tag">consentRequired: true</span> in your session config.
                  This shows a consent checkbox before recording begins.
                  You are responsible for determining whether consent is required in your jurisdiction.
                </P>
              </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}