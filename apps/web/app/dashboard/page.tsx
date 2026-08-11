"use client";
// hearloop/apps/web/app/dashboard/page.tsx

import { useState, useEffect, Fragment } from "react";
import { useRouter } from "next/navigation";
import { EmbedSettingsPanel } from "../../components/EmbedSettingsPanel";
import { ApiSettingsPanel } from "../../components/ApiSettingsPanel";
import { CaptureLinksPanel } from "../../components/CaptureLinksPanel";

// ── Display helpers ─────────────────────────────────────────
const TOPIC_COLORS = ["#E24B4A", "#EF9F27", "#1D9E75", "#378ADD", "#888"];

function timeAgo(iso?: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function topicLabel(s: any): string {
  const t = s.topics?.[0];
  return t ? String(t).replace(/_/g, " ") : "—";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "HL";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

type NavItem = "dashboard" | "sessions" | "analytics" | "alerts" | "capture" | "embed" | "apikeys" | "webhooks";

export default function DashboardPage() {
  const router = useRouter();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState<"all" | "completed" | "urgent">("all");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [realData, setRealData] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [partnerName, setPartnerName] = useState("Partner");

  useEffect(() => {
    const s = localStorage.getItem("hl_session");
    if (!s) { router.push("/login"); return; }

    const session = JSON.parse(s);
    if (session.name) setPartnerName(session.name);

    if (!session.partnerId) {
      router.push("/login");
      return;
    }

    // API key is in the httpOnly cookie — the proxy injects it automatically.
    // No need to read it from localStorage or pass it in the Authorization header.
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const navParam = params.get("nav");
      if (navParam === "embed" || navParam === "sessions" || navParam === "alerts") {
        setNav(navParam);
      }
      const sessionParam = params.get("session");
      if (sessionParam) setExpandedSession(sessionParam);
    }

    const fetchDashboard = () =>
      fetch(`/api/partners/me/dashboard`)
        .then(r => {
          if (r.status === 401) {
            // Cookie expired or missing — redirect to login
            router.push("/login");
            return null;
          }
          return r.json();
        })
        .then(data => {
          if (data) { setRealData(data); }
          setDataLoading(false);
        })
        .catch(() => setDataLoading(false));

    fetchDashboard();
    const interval = setInterval(fetchDashboard, 30_000);
    return () => clearInterval(interval);
  }, [router]);

  // ── Derived data — real payload only, no mock fallback ──
  const sessions: any[] = realData?.sessions ?? [];
  const hasSessions = sessions.length > 0;

  const stats = realData?.stats;
  const sentimentCounts = stats?.sentiment ?? { positive: 0, neutral: 0, negative: 0, positiveRate: 0 };
  const sentimentTotal = sentimentCounts.positive + sentimentCounts.neutral + sentimentCounts.negative;

  const metrics: { label: string; val: string; delta: string; color?: string }[] = [
    { label: "Voice sessions", val: stats ? stats.total.toString() : "—", delta: "all time" },
    { label: "Positive sentiment", val: stats && sentimentTotal > 0 ? `${stats.sentiment.positiveRate}%` : "—", delta: "of completed", color: "var(--green)" },
    { label: "Urgent flags", val: stats ? stats.urgent.toString() : "—", delta: "need attention", color: "var(--red)" },
    { label: "Completion rate", val: stats && stats.total > 0 ? `${stats.completionRate}%` : "—", delta: "submitted vs created" },
  ];

  const topicData = (realData?.topics ?? []).slice(0, 5).map((t: any, i: number) => ({
    name: String(t.name).replace(/_/g, " "),
    pct: t.pct,
    color: TOPIC_COLORS[i] ?? "#888",
  }));

  const urgentSessions = sessions.filter((s: any) =>
    s.urgency === "urgent" || s.urgency === "follow_up"
  );
  const urgentOnlyCount = sessions.filter((s: any) => s.urgency === "urgent").length;

  const filteredSessions = sessions.filter((s: any) => {
    if (sessionFilter === "completed" && s.status !== "completed") return false;
    if (sessionFilter === "urgent" && s.urgency !== "urgent") return false;
    if (search) {
      const hay = `${s.id} ${(s.topics ?? []).join(" ")}`.toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // By-Target aggregation (Phase 1 — grouped client-side from session metadata).
  const targetGroups = (() => {
    const map = new Map<
      string,
      { label: string; total: number; positive: number; rated: number; urgent: number }
    >();
    for (const s of sessions) {
      const key = s.target?.key ?? "__unattributed";
      const label = s.target?.label ?? "Unattributed";
      let g = map.get(key);
      if (!g) {
        g = { label, total: 0, positive: 0, rated: 0, urgent: 0 };
        map.set(key, g);
      }
      g.total += 1;
      if (s.sentiment) {
        g.rated += 1;
        if (s.sentiment === "positive") g.positive += 1;
      }
      if (s.urgency === "urgent") g.urgent += 1;
    }
    return Array.from(map.values())
      .map((g) => ({
        ...g,
        positivePct: g.rated > 0 ? Math.round((g.positive / g.rated) * 100) : null,
      }))
      .sort((a, b) => b.total - a.total);
  })();

  const copyKey = () => {
    const s = localStorage.getItem("hl_session");
    const key = s ? JSON.parse(s).apiKey ?? "sk-live_••••••••" : "sk-live_••••••••";
    navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    localStorage.removeItem("hl_session");
    router.push("/login");
  };

  return (
    <>
      <style>{`
        /* page-specific overrides */
        html, body { height: 100%; }
        body { background: var(--paper-2); }

        .layout { display: grid; grid-template-columns: 200px 1fr; min-height: 100vh; }

        /* SIDEBAR */
        .sidebar {
          background: var(--paper);
          border-right: 0.5px solid var(--paper-3);
          padding: 0;
          display: flex;
          flex-direction: column;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
        }

        .sidebar-logo {
          padding: 20px 16px;
          border-bottom: 0.5px solid var(--paper-3);
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Instrument Serif', serif;
          font-size: 18px;
          color: var(--ink);
          text-decoration: none;
        }

        .logo-drop {
          width: 26px; height: 26px;
          background: var(--green);
          border-radius: 50% 50% 50% 8px;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
        }

        .sidebar-nav { padding: 12px 10px; flex: 1; display: flex; flex-direction: column; gap: 1px; }

        .ns {
          font-size: 10px;
          font-weight: 500;
          color: var(--ink-3);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          padding: 10px 8px 3px;
        }

        .ni {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 7px 8px;
          border-radius: 7px;
          font-size: 12px;
          color: var(--ink-2);
          cursor: pointer;
          transition: background 0.12s, color 0.12s;
          user-select: none;
        }

        .ni:hover { background: var(--paper-2); color: var(--ink); }
        .ni.active { background: var(--green-l); color: #085041; font-weight: 500; }

        .ni-badge {
          margin-left: auto;
          background: var(--red-l);
          color: var(--red);
          font-size: 10px;
          padding: 1px 6px;
          border-radius: 99px;
          font-weight: 500;
        }

        .sidebar-footer {
          padding: 12px 10px;
          border-top: 0.5px solid var(--paper-3);
        }

        .user-row {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px;
          border-radius: 7px;
          cursor: pointer;
        }

        .user-row:hover { background: var(--paper-2); }

        .av {
          width: 28px; height: 28px;
          border-radius: 50%;
          background: var(--green-l);
          display: flex; align-items: center; justify-content: center;
          font-size: 10px;
          font-weight: 500;
          color: #085041;
          flex-shrink: 0;
        }

        .user-name { font-size: 12px; color: var(--ink); font-weight: 500; }
        .user-role { font-size: 10px; color: var(--ink-3); }

        .signout-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          color: var(--ink-3);
          padding: 6px 8px;
          border-radius: 6px;
          cursor: pointer;
          border: none;
          background: transparent;
          width: 100%;
          margin-top: 4px;
          transition: background 0.12s, color 0.12s;
        }

        .signout-btn:hover { background: var(--red-l); color: var(--red); }

        /* MAIN */
        .main { display: flex; flex-direction: column; min-height: 100vh; }

        .topbar {
          background: var(--paper);
          border-bottom: 0.5px solid var(--paper-3);
          padding: 0 24px;
          height: 52px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 10;
        }

        .topbar-title { font-size: 14px; font-weight: 500; color: var(--ink); }
        .topbar-sub { font-size: 11px; color: var(--ink-3); }

        .topbar-right { display: flex; align-items: center; gap: 12px; }

        .search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: var(--paper-2);
          border: 0.5px solid var(--paper-3);
          border-radius: 7px;
          padding: 6px 10px;
          font-size: 12px;
          color: var(--ink-3);
          width: 200px;
        }

        .search input {
          background: transparent;
          border: none;
          outline: none;
          font-size: 12px;
          color: var(--ink);
          font-family: 'DM Sans', sans-serif;
          width: 100%;
        }

        .search input::placeholder { color: var(--ink-3); }

        /* MISSING KEY BANNER */
        .key-banner {
          background: #FAEEDA;
          border-bottom: 0.5px solid #F0C982;
          padding: 12px 24px;
          display: flex;
          align-items: center;
          gap: 12px;
          flex-wrap: wrap;
        }

        .key-banner-text {
          font-size: 13px;
          color: #633806;
          flex: 1;
          min-width: 200px;
        }

        .key-banner-text strong { font-weight: 500; }

        .key-banner-input-wrap {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-shrink: 0;
        }

        .key-banner-input {
          padding: 7px 12px;
          background: #fff;
          border: 0.5px solid #F0C982;
          border-radius: 7px;
          font-size: 12px;
          font-family: 'DM Mono', monospace;
          color: var(--ink);
          outline: none;
          width: 280px;
          transition: border-color 0.15s;
        }

        .key-banner-input:focus { border-color: #EF9F27; }
        .key-banner-input::placeholder { color: #c0a87a; font-family: 'DM Sans', sans-serif; }

        .key-banner-save {
          padding: 7px 14px;
          background: #EF9F27;
          color: #fff;
          border: none;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s;
          white-space: nowrap;
        }

        .key-banner-save:hover { background: #CF8010; }

        .key-banner-err {
          font-size: 11px;
          color: var(--red);
          width: 100%;
          padding-left: 26px;
        }

        .content { padding: 20px 24px; flex: 1; display: flex; flex-direction: column; gap: 16px; }

        /* METRICS */
        .metrics { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }

        .mc {
          background: var(--paper);
          border: 0.5px solid var(--paper-3);
          border-radius: var(--r);
          padding: 14px 16px;
        }

        .ml { font-size: 11px; color: var(--ink-3); margin-bottom: 6px; }
        .mv { font-size: 24px; font-weight: 500; color: var(--ink); line-height: 1; }
        .md { font-size: 11px; margin-top: 5px; display: flex; align-items: center; gap: 3px; }
        .up { color: var(--green); } .dn { color: var(--red); }

        /* GRID */
        .g2 { display: grid; grid-template-columns: 1fr 300px; gap: 14px; }
        .g3 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

        .card {
          background: var(--paper);
          border: 0.5px solid var(--paper-3);
          border-radius: var(--r);
          padding: 16px;
        }

        .ch { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .ct { font-size: 13px; font-weight: 500; color: var(--ink); }

        .sel {
          font-size: 11px;
          padding: 3px 7px;
          border-radius: 6px;
          border: 0.5px solid var(--paper-3);
          background: var(--paper-2);
          color: var(--ink-2);
          cursor: pointer;
        }

        /* PILL */
        .pill { display: inline-flex; align-items: center; padding: 2px 7px; border-radius: 99px; font-size: 10px; font-weight: 500; white-space: nowrap; }
        .pp { background: var(--green-l); color: #085041; }
        .pn { background: var(--red-l); color: #791F1F; }
        .pnu { background: var(--paper-2); color: var(--ink-3); }
        .pu { background: var(--amber-l); color: #633806; }
        .pf { background: var(--blue-l); color: #0C447C; }
        .pc { background: var(--green-l); color: #085041; }
        .ppr { background: var(--blue-l); color: #0C447C; }

        /* SESSIONS TABLE */
        .sess-filters { display: flex; gap: 6px; margin-bottom: 12px; }

        .filter-btn {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 99px;
          border: 0.5px solid var(--paper-3);
          background: transparent;
          color: var(--ink-2);
          cursor: pointer;
          transition: all 0.12s;
        }

        .filter-btn.active { background: var(--green-l); border-color: #9FE1CB; color: #085041; font-weight: 500; }

        .sess-table { width: 100%; border-collapse: collapse; }

        .sess-table th {
          font-size: 10px;
          font-weight: 500;
          color: var(--ink-3);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 0 0 8px;
          text-align: left;
          border-bottom: 0.5px solid var(--paper-3);
        }

        .sess-row { cursor: pointer; }

        .sess-row td {
          padding: 10px 0;
          font-size: 12px;
          border-bottom: 0.5px solid var(--paper-3);
          vertical-align: middle;
        }

        .sess-row:last-child td { border-bottom: none; }
        .sess-row:hover td { background: var(--paper-2); }

        .sess-id {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          color: var(--ink-2);
        }

        .sess-expand {
          background: var(--paper-2);
          border-radius: 6px;
          padding: 10px 12px;
          font-size: 11px;
          color: var(--ink-2);
          line-height: 1.5;
          margin: 0 0 8px;
          border-left: 2px solid var(--green);
          font-style: italic;
        }

        /* TOPIC BARS */
        .tbars { display: flex; flex-direction: column; gap: 10px; }
        .trow { display: flex; flex-direction: column; gap: 4px; }
        .tmeta { display: flex; justify-content: space-between; font-size: 11px; }
        .tn { color: var(--ink); } .tp { color: var(--ink-3); }
        .track { height: 5px; background: var(--paper-2); border-radius: 99px; overflow: hidden; }
        .fill { height: 100%; border-radius: 99px; transition: width 0.6s ease; }

        /* ALERTS */
        .alist { display: flex; flex-direction: column; gap: 8px; }

        .ai {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 10px 12px;
          border-radius: 8px;
          border: 0.5px solid var(--paper-3);
        }

        .ai.urg { border-color: #F09595; background: var(--red-l); }
        .ai.fol { border-color: #85B7EB; background: var(--blue-l); }

        .adot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; margin-top: 3px; }
        .du { background: var(--red); } .df { background: var(--blue); }

        .at { font-size: 11px; color: var(--ink); line-height: 1.45; }
        .am { font-size: 10px; color: var(--ink-3); margin-top: 2px; }

        /* LOCATIONS */
        .lrow {
          display: grid;
          grid-template-columns: minmax(0,1fr) 60px 60px 80px 70px;
          align-items: center;
          gap: 8px;
          padding: 9px 0;
          border-bottom: 0.5px solid var(--paper-3);
          font-size: 12px;
        }

        .lrow:last-child { border-bottom: none; }
        .lrow.lh { color: var(--ink-3); font-size: 10px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.06em; padding-bottom: 6px; }

        .bar-inline { display: flex; align-items: center; gap: 4px; font-size: 11px; }
        .bi { height: 4px; border-radius: 99px; }

        /* API KEYS */
        .key-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 0;
          border-bottom: 0.5px solid var(--paper-3);
          font-size: 12px;
          gap: 8px;
        }

        .key-row:last-child { border-bottom: none; }

        .key-code {
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          color: var(--ink-2);
          background: var(--paper-2);
          padding: 3px 8px;
          border-radius: 5px;
          cursor: pointer;
          transition: background 0.12s;
        }

        .key-code:hover { background: var(--paper-3); }

        .btn-sm {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 6px;
          border: 0.5px solid var(--paper-3);
          background: transparent;
          color: var(--ink-2);
          cursor: pointer;
          transition: background 0.12s;
        }

        .btn-sm:hover { background: var(--paper-2); }

        .btn-danger {
          font-size: 11px;
          padding: 4px 10px;
          border-radius: 6px;
          border: 0.5px solid #F09595;
          background: transparent;
          color: var(--red);
          cursor: pointer;
          transition: background 0.12s;
        }

        .btn-danger:hover { background: var(--red-l); }

        .btn-primary {
          background: var(--green);
          color: #fff;
          border: none;
          padding: 7px 14px;
          border-radius: 7px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 5px;
          transition: background 0.12s;
        }

        .btn-primary:hover { background: #0F6E56; }

        /* DONUT */
        .donut-wrap { display: flex; align-items: center; gap: 20px; }
        .donut-legend { display: flex; flex-direction: column; gap: 8px; }
        .leg { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--ink-2); }
        .legdot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
        .legval { font-weight: 500; color: var(--ink); margin-left: auto; padding-left: 12px; }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .content { animation: fadeIn 0.3s ease both; }
      `}</style>

      <div className="layout">
        {/* SIDEBAR */}
        <aside className="sidebar">
          <a href="/" className="sidebar-logo">
            <div className="logo-drop">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1.5C6.5 1.5 3 4 3 7C3 8.7 4.6 10 6.5 10C8.4 10 10 8.7 10 7C10 4 6.5 1.5 6.5 1.5Z" fill="white" opacity=".9"/>
                <circle cx="6.5" cy="7" r="1.5" fill="white" opacity=".5"/>
              </svg>
            </div>
            Hearloop
          </a>

          <div className="sidebar-nav">
            <div className="ns">Overview</div>
            {[
              { id: "dashboard", label: "Dashboard", icon: "M1 1h5v5H1zM8 1h5v5H8zM1 8h5v5H1zM8 8h5v5H8z" },
              { id: "analytics", label: "Analytics", icon: "M2 12L5 8L8 10L11 5.5L14 7" },
            ].map((item) => (
              <div
                key={item.id}
                className={`ni ${nav === item.id ? "active" : ""}`}
                onClick={() => setNav(item.id as NavItem)}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d={item.icon} stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                {item.label}
              </div>
            ))}

            <div className="ns">Feedback</div>
            <div className={`ni ${nav === "sessions" ? "active" : ""}`} onClick={() => setNav("sessions")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1"/><path d="M5 7L6.5 8.5L9.5 5.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Sessions
            </div>
            <div className={`ni ${nav === "alerts" ? "active" : ""}`} onClick={() => setNav("alerts")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V7.5L10 10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.1"/></svg>
              Urgent alerts
              {urgentOnlyCount > 0 && (
                <span className="ni-badge">{urgentOnlyCount}</span>
              )}
            </div>
            <div className={`ni ${nav === "capture" ? "active" : ""}`} onClick={() => setNav("capture")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="1.5" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.1"/><rect x="8.5" y="1.5" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.1"/><rect x="1.5" y="8.5" width="4" height="4" rx="0.8" stroke="currentColor" strokeWidth="1.1"/><path d="M8.5 8.5h2m2 0v2m-4 2h2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
              Capture links
            </div>

            <div className="ns">Settings</div>
            <div className={`ni ${nav === "embed" ? "active" : ""}`} onClick={() => setNav("embed")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 7h10M7 2v10" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round"/></svg>
              Widget embed
            </div>
            <div className={`ni ${nav === "apikeys" ? "active" : ""}`} onClick={() => setNav("apikeys")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="4.5" width="11" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1"/><path d="M4.5 4.5V3.2C4.5 2.4 5.6 1.8 7 1.8C8.4 1.8 9.5 2.4 9.5 3.2V4.5" stroke="currentColor" strokeWidth="1.1"/></svg>
              API access
            </div>
            <div className={`ni ${nav === "webhooks" ? "active" : ""}`} onClick={() => setNav("webhooks")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4.5L7 7.5L12 4.5M2 4.5V9.5C2 10.1 2.4 10.5 3 10.5H11C11.6 10.5 12 10.1 12 9.5V4.5M2 4.5L7 1.5L12 4.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
              Webhooks
            </div>
          </div>

          <div className="sidebar-footer">
            <div className="user-row">
              <div className="av">{initials(partnerName)}</div>
              <div>
              // In sidebar user row:
              <div className="user-name">{partnerName}</div>
                <div className="user-role">Partner account</div>
              </div>
            </div>
            <button className="signout-btn" onClick={signOut}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M8 2H10C10.6 2 11 2.4 11 3V9C11 9.6 10.6 10 10 10H8M5 8L8 6L5 4M8 6H1" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
              Sign out
            </button>
          </div>
        </aside>

        {/* MAIN */}
        <div className="main">
          <div className="topbar">
            <div>
              <div className="topbar-title">
                {nav === "dashboard" && "Dashboard"}
                {nav === "sessions" && "Sessions"}
                {nav === "analytics" && "Analytics"}
                {nav === "alerts" && "Urgent alerts"}
                {nav === "capture" && "Capture links"}
                {nav === "embed" && "Widget embed"}
                {nav === "apikeys" && "API access"}
                {nav === "webhooks" && "Webhooks"}
              </div>
              <div className="topbar-sub">{partnerName} · Last 30 days</div>
            </div>
            <div className="topbar-right">
              <div className="search">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1"/><path d="M8 8L11 11" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                <input placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="av">{initials(partnerName)}</div>
            </div>
          </div>

          <div className="content">
            {/* ── DASHBOARD ── */}
            {nav === "dashboard" && (
              <>
                <div className="metrics">
                  {metrics.map((m) => (
                    <div key={m.label} className="mc">
                      <div className="ml">{m.label}</div>
                      <div className="mv" style={{color: m.color}}>{m.val}</div>
                      <div className="md">{m.delta}</div>
                    </div>
                  ))}
                </div>

                <div className="g2">
                  <div className="card">
                    <div className="ch">
                      <div className="ct">Recent sessions</div>
                      <select className="sel" onChange={e => setSessionFilter(e.target.value as any)}>
                        <option value="all">All</option>
                        <option value="completed">Completed</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <table className="sess-table">
                      <thead>
                        <tr>
                          <th>Session</th>
                          <th>Sentiment</th>
                          <th>Topic</th>
                          <th>Urgency</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {!hasSessions && (
                          <tr>
                            <td colSpan={5} style={{textAlign:"center",color:"var(--ink-3)",fontSize:12,padding:"24px 0"}}>
                              {dataLoading ? "Loading…" : "No sessions yet. Share a capture link to collect your first voice feedback."}
                            </td>
                          </tr>
                        )}
                        {sessions.slice(0,5).map((s: any) => (
                          <Fragment key={s.id}>
                            <tr className="sess-row" onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}>
                              <td><span className="sess-id">{s.id}</span></td>
                              <td><span className={`pill ${s.sentiment === "positive" ? "pp" : s.sentiment === "negative" ? "pn" : "pnu"}`}>{s.sentiment ?? "—"}</span></td>
                              <td style={{fontSize:11,color:"var(--ink-3)"}}>{topicLabel(s)}</td>
                              <td><span className={`pill ${s.urgency === "urgent" ? "pu" : s.urgency === "follow_up" ? "pf" : "pnu"}`}>{s.urgency}</span></td>
                              <td><span className={`pill ${s.status === "completed" ? "pc" : "ppr"}`}>{s.status}</span></td>
                            </tr>
                            {expandedSession === s.id && s.transcript && (
                              <tr>
                                <td colSpan={5}>
                                  <div className="sess-expand">"{s.transcript}"</div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <div className="card">
                      <div className="ch"><div className="ct">Top topics</div></div>
                      <div className="tbars">
                        {topicData.length === 0 && (
                          <div style={{color:"var(--ink-3)",fontSize:12,padding:"8px 0"}}>
                            {dataLoading ? "Loading…" : "No topics yet."}
                          </div>
                        )}
                        {topicData.map((t: any) => (
                          <div key={t.name} className="trow">
                            <div className="tmeta"><span className="tn">{t.name}</span><span className="tp">{t.pct}%</span></div>
                            <div className="track"><div className="fill" style={{width:`${t.pct}%`,background:t.color}} /></div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card">
                      <div className="ch"><div className="ct">Sentiment</div>
                        {sentimentTotal > 0 && <span className="pill pp">{stats.sentiment.positiveRate}% positive</span>}
                      </div>
                      {sentimentTotal === 0 ? (
                        <div style={{color:"var(--ink-3)",fontSize:12,padding:"20px 0",textAlign:"center"}}>
                          {dataLoading ? "Loading…" : "No completed sessions yet."}
                        </div>
                      ) : (
                        <div className="donut-wrap">
                          {(() => {
                            const C = 220;
                            const pos = sentimentCounts.positive / sentimentTotal;
                            const neu = sentimentCounts.neutral / sentimentTotal;
                            const neg = sentimentCounts.negative / sentimentTotal;
                            return (
                              <svg width="90" height="90" viewBox="0 0 90 90" aria-label={`Sentiment donut: ${Math.round(pos*100)}% positive, ${Math.round(neu*100)}% neutral, ${Math.round(neg*100)}% negative`}>
                                <circle cx="45" cy="45" r="35" fill="none" stroke="var(--paper-2)" strokeWidth="14"/>
                                <circle cx="45" cy="45" r="35" fill="none" stroke="#1D9E75" strokeWidth="14"
                                  strokeDasharray={`${pos*C} ${C}`} strokeDashoffset="55" />
                                <circle cx="45" cy="45" r="35" fill="none" stroke="#888" strokeWidth="14"
                                  strokeDasharray={`${neu*C} ${C}`} strokeDashoffset={`${-(pos*C)+55}`} />
                                <circle cx="45" cy="45" r="35" fill="none" stroke="#E24B4A" strokeWidth="14"
                                  strokeDasharray={`${neg*C} ${C}`} strokeDashoffset={`${-((pos+neu)*C)+55}`} />
                              </svg>
                            );
                          })()}
                          <div className="donut-legend">
                            {[
                              {c:"#1D9E75",l:"Positive",v:`${Math.round((sentimentCounts.positive/sentimentTotal)*100)}%`},
                              {c:"#888",l:"Neutral",v:`${Math.round((sentimentCounts.neutral/sentimentTotal)*100)}%`},
                              {c:"#E24B4A",l:"Negative",v:`${Math.round((sentimentCounts.negative/sentimentTotal)*100)}%`},
                            ].map(i => (
                              <div key={i.l} className="leg">
                                <div className="legdot" style={{background:i.c}} />
                                {i.l}<span className="legval">{i.v}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* BY TARGET — grouped from capture-link attribution (location / service / product) */}
                <div className="card">
                  <div className="ch"><div className="ct">By target</div></div>
                  {targetGroups.length === 0 ? (
                    <div style={{color:"var(--ink-3)",fontSize:12,padding:"20px 0",textAlign:"center"}}>
                      {dataLoading
                        ? "Loading…"
                        : "No feedback yet. Create a capture link per location or service to see breakdowns here."}
                    </div>
                  ) : (
                    <table className="sess-table">
                      <thead>
                        <tr>
                          <th>Target</th>
                          <th>Sessions</th>
                          <th>Positive</th>
                          <th>Urgent</th>
                        </tr>
                      </thead>
                      <tbody>
                        {targetGroups.map((g) => (
                          <tr key={g.label}>
                            <td style={{fontWeight:500,color:"var(--ink)"}}>{g.label}</td>
                            <td style={{color:"var(--ink-3)"}}>{g.total}</td>
                            <td style={{fontWeight:500, color: g.positivePct === null ? "var(--ink-3)" : g.positivePct >= 60 ? "var(--green)" : g.positivePct >= 40 ? "var(--ink-2)" : "var(--red)"}}>
                              {g.positivePct === null ? "—" : `${g.positivePct}%`}
                            </td>
                            <td>
                              {g.urgent > 0
                                ? <span className="pill pu">{g.urgent} urgent</span>
                                : <span className="pill pnu">none</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}

            {/* ── SESSIONS ── */}
            {nav === "sessions" && (
              <div className="card">
                <div className="ch">
                  <div className="ct">All sessions</div>
                  <div style={{display:"flex",gap:6}}>
                    {(["all","completed","urgent"] as const).map((f) => (
                      <button key={f} className={`filter-btn ${sessionFilter === f ? "active" : ""}`} onClick={() => setSessionFilter(f)}>
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
                <table className="sess-table">
                  <thead>
                    <tr>
                      <th>Session ID</th>
                      <th>Sentiment</th>
                      <th>Score</th>
                      <th>Topic</th>
                      <th>Urgency</th>
                      <th>Status</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!hasSessions && (
                      <tr>
                        <td colSpan={7} style={{textAlign:"center",color:"var(--ink-3)",fontSize:12,padding:"24px 0"}}>
                          {dataLoading ? "Loading…" : "No sessions yet."}
                        </td>
                      </tr>
                    )}
                    {filteredSessions.map((s: any) => (
                      <Fragment key={s.id}>
                        <tr className="sess-row" onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}>
                          <td><span className="sess-id">{s.id}</span></td>
                          <td><span className={`pill ${s.sentiment === "positive" ? "pp" : s.sentiment === "negative" ? "pn" : "pnu"}`}>{s.sentiment ?? "—"}</span></td>
                          <td style={{fontSize:11,color:"var(--ink-3)",fontFamily:"var(--font-mono)"}}>{typeof s.sentimentScore === "number" ? s.sentimentScore.toFixed(2) : "—"}</td>
                          <td style={{fontSize:11,color:"var(--ink-3)"}}>{topicLabel(s)}</td>
                          <td><span className={`pill ${s.urgency === "urgent" ? "pu" : s.urgency === "follow_up" ? "pf" : "pnu"}`}>{s.urgency}</span></td>
                          <td><span className={`pill ${s.status === "completed" ? "pc" : "ppr"}`}>{s.status}</span></td>
                          <td style={{fontSize:11,color:"var(--ink-3)"}}>{timeAgo(s.createdAt)}</td>
                        </tr>
                        {expandedSession === s.id && s.transcript && (
                          <tr>
                            <td colSpan={7}>
                              <div className="sess-expand">"{s.transcript}"</div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── ALERTS ── */}
            {nav === "alerts" && (
              <div className="card">
                <div className="ch">
                  <div className="ct">Urgent & follow-up alerts</div>
                  <span className="pill pu">{urgentSessions.length} open</span>
                </div>
                <div className="alist">
                  {urgentSessions.length === 0 && (
                    <div style={{color:"var(--ink-3)",fontSize:12,padding:"12px 0"}}>
                      {dataLoading ? "Loading…" : "No urgent or follow-up alerts."}
                    </div>
                  )}
                  {urgentSessions.map((s: any) => (
                    <div key={s.id} className={`ai ${s.urgency === "urgent" ? "urg" : "fol"}`}>
                      <div className={`adot ${s.urgency === "urgent" ? "du" : "df"}`} />
                      <div>
                        <div className="at">"{s.transcript}"</div>
                        <div className="am">{s.id} · {timeAgo(s.createdAt)} · {topicLabel(s)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {nav === "capture" && <CaptureLinksPanel />}
            {nav === "embed" && <EmbedSettingsPanel />}
            {nav === "apikeys" && <ApiSettingsPanel />}

            {/* ── WEBHOOKS ── */}
            {nav === "webhooks" && (
              <div className="card">
                <div className="ch">
                  <div className="ct">Webhook endpoints</div>
                </div>
                <div style={{color:"var(--ink-3)",fontSize:12,padding:"8px 0",lineHeight:1.5}}>
                  Set your webhook URL in <strong style={{color:"var(--ink-2)"}}>API access</strong> settings.
                  Hearloop POSTs a signed <code style={{fontFamily:"var(--font-mono)"}}>session.completed</code> event
                  there when analysis finishes. Per-endpoint delivery history will appear here in a future update.
                </div>
              </div>
            )}

            {/* ── ANALYTICS ── */}
            {nav === "analytics" && (
              <div className="g3">
                <div className="card">
                  <div className="ch"><div className="ct">Sentiment over time</div><select className="sel"><option>30 days</option><option>7 days</option></select></div>
                  <div style={{padding:"20px 0",textAlign:"center",color:"var(--ink-3)",fontSize:12}}>
                    Chart rendered here — wire to real data in v2
                    <div style={{marginTop:16,display:"flex",alignItems:"flex-end",gap:4,height:100,justifyContent:"center"}}>
                      {[40,55,48,62,70,58,75,68,82,71,78,85,72,90,84].map((h,i) => (
                        <div key={i} style={{width:14,height:h,background:"var(--green)",borderRadius:"3px 3px 0 0",opacity:0.6+i*0.025}} />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="ch"><div className="ct">Topic distribution</div></div>
                  <div className="tbars" style={{marginTop:8}}>
                    {topicData.map((t: any) => (
                      <div key={t.name} className="trow">
                        <div className="tmeta"><span className="tn">{t.name}</span><span className="tp">{t.pct}%</span></div>
                        <div className="track"><div className="fill" style={{width:`${t.pct}%`,background:t.color}} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}