"use client";
// hearloop/apps/web/app/dashboard/page.tsx

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ── Mock data ──────────────────────────────────────────────
const MOCK_SESSIONS = [
  { id: "sess_9aX2kL", sentiment: "positive", topic: "staff_friendliness", urgency: "none", status: "completed", ts: "2m ago", score: 0.82, transcript: "Staff was incredibly helpful and friendly, will definitely come back." },
  { id: "sess_7bQ1mP", sentiment: "negative", topic: "wait_time", urgency: "urgent", status: "completed", ts: "14m ago", score: 0.78, transcript: "Waited over an hour for an oil change. Completely unacceptable." },
  { id: "sess_3cR8nQ", sentiment: "neutral", topic: "price", urgency: "follow_up", status: "completed", ts: "28m ago", score: 0.51, transcript: "Price was higher than quoted online, need someone to explain the difference." },
  { id: "sess_1dM4oR", sentiment: "positive", topic: "service_quality", urgency: "none", status: "completed", ts: "41m ago", score: 0.91, transcript: "Excellent work on my brakes, very professional team." },
  { id: "sess_5eK7pS", sentiment: "negative", topic: "wait_time", urgency: "urgent", status: "completed", ts: "1h ago", score: 0.84, transcript: "Nobody told me it would take 3 hours. I missed a meeting." },
  { id: "sess_2fJ9qT", sentiment: "positive", topic: "ease_of_booking", urgency: "none", status: "completed", ts: "2h ago", score: 0.76, transcript: "Really easy to book online, smooth process from start to finish." },
  { id: "sess_8gH3rU", sentiment: "neutral", topic: "cleanliness", urgency: "none", status: "processing", ts: "2h ago", score: 0.5, transcript: "" },
];

const TOPIC_DATA = [
  { name: "Wait time", pct: 38, color: "#E24B4A" },
  { name: "Staff friendliness", pct: 24, color: "#EF9F27" },
  { name: "Service quality", pct: 19, color: "#1D9E75" },
  { name: "Price", pct: 12, color: "#378ADD" },
  { name: "Ease of booking", pct: 7, color: "#888" },
];

const LOCATIONS = [
  { name: "North Avenue", sessions: 847, positive: 74, waitMin: 24, urgency: 0, color: "#1D9E75" },
  { name: "Westside", sessions: 731, positive: 48, waitMin: 51, urgency: 12, color: "#E24B4A" },
  { name: "Downtown", sessions: 692, positive: 69, waitMin: 31, urgency: 3, color: "#EF9F27" },
  { name: "Eastpark", sessions: 604, positive: 71, waitMin: 27, urgency: 0, color: "#1D9E75" },
  { name: "Lakeside", sessions: 438, positive: 55, waitMin: 42, urgency: 8, color: "#EF9F27" },
];

// ── Types ──────────────────────────────────────────────────
type NavItem = "dashboard" | "sessions" | "analytics" | "alerts" | "apikeys" | "webhooks";

export default function DashboardPage() {
  const router = useRouter();
  const [nav, setNav] = useState<NavItem>("dashboard");
  const [search, setSearch] = useState("");
  const [sessionFilter, setSessionFilter] = useState<"all" | "completed" | "urgent">("all");
  const [expandedSession, setExpandedSession] = useState<string | null>(null);
  const [apiKeyVisible, setApiKeyVisible] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Redirect if no session
    const s = localStorage.getItem("hl_session");
    if (!s) router.push("/login");
  }, [router]);

  const filteredSessions = MOCK_SESSIONS.filter((s) => {
    if (sessionFilter === "completed" && s.status !== "completed") return false;
    if (sessionFilter === "urgent" && s.urgency !== "urgent") return false;
    if (search && !s.id.includes(search) && !s.topic.includes(search)) return false;
    return true;
  });

  const urgentSessions = MOCK_SESSIONS.filter((s) => s.urgency === "urgent" || s.urgency === "follow_up");

  const copyKey = () => {
    navigator.clipboard.writeText("sk-live_••••••••3HO");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const signOut = () => {
    localStorage.removeItem("hl_session");
    router.push("/login");
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --ink: #0E0E0E;
          --ink-2: #3A3A3A;
          --ink-3: #888;
          --paper: #F7F4EE;
          --paper-2: #EFECE4;
          --paper-3: #E0DDD4;
          --green: #1D9E75;
          --green-l: #E1F5EE;
          --red: #E24B4A;
          --red-l: #FCEBEB;
          --amber: #EF9F27;
          --amber-l: #FAEEDA;
          --blue: #378ADD;
          --blue-l: #E6F1FB;
          --r: 10px;
        }

        html, body { height: 100%; }
        body { font-family: 'DM Sans', sans-serif; background: var(--paper-2); color: var(--ink); }

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
              <span className="ni-badge">
                {MOCK_SESSIONS.filter(s => s.urgency === "urgent").length}
              </span>
            </div>

            <div className="ns">Settings</div>
            <div className={`ni ${nav === "apikeys" ? "active" : ""}`} onClick={() => setNav("apikeys")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="4.5" width="11" height="6" rx="1.2" stroke="currentColor" strokeWidth="1.1"/><path d="M4.5 4.5V3.2C4.5 2.4 5.6 1.8 7 1.8C8.4 1.8 9.5 2.4 9.5 3.2V4.5" stroke="currentColor" strokeWidth="1.1"/></svg>
              API keys
            </div>
            <div className={`ni ${nav === "webhooks" ? "active" : ""}`} onClick={() => setNav("webhooks")}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4.5L7 7.5L12 4.5M2 4.5V9.5C2 10.1 2.4 10.5 3 10.5H11C11.6 10.5 12 10.1 12 9.5V4.5M2 4.5L7 1.5L12 4.5" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round"/></svg>
              Webhooks
            </div>
          </div>

          <div className="sidebar-footer">
            <div className="user-row">
              <div className="av">AC</div>
              <div>
                <div className="user-name">Acme Motors</div>
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
                {nav === "apikeys" && "API keys"}
                {nav === "webhooks" && "Webhooks"}
              </div>
              <div className="topbar-sub">Acme Motors · Last 30 days</div>
            </div>
            <div className="topbar-right">
              <div className="search">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1"/><path d="M8 8L11 11" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                <input placeholder="Search sessions..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="av">AC</div>
            </div>
          </div>

          <div className="content">
            {/* ── DASHBOARD ── */}
            {nav === "dashboard" && (
              <>
                <div className="metrics">
                  {[
                    { label: "Voice sessions", val: "4,312", delta: "+22%", up: true },
                    { label: "Avg sentiment", val: "61%", delta: "+4pts", up: true, color: "var(--green)" },
                    { label: "Urgent flags", val: "28", delta: "+8 this week", up: false, color: "var(--red)" },
                    { label: "Completion rate", val: "94%", delta: "+2pts", up: true },
                  ].map((m) => (
                    <div key={m.label} className="mc">
                      <div className="ml">{m.label}</div>
                      <div className="mv" style={{color: m.color}}>{m.val}</div>
                      <div className={`md ${m.up ? "up" : "dn"}`}>
                        {m.up ? "↑" : "↓"} {m.delta} vs last month
                      </div>
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
                        {MOCK_SESSIONS.slice(0,5).map((s) => (
                          <>
                            <tr key={s.id} className="sess-row" onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}>
                              <td><span className="sess-id">{s.id}</span></td>
                              <td><span className={`pill ${s.sentiment === "positive" ? "pp" : s.sentiment === "negative" ? "pn" : "pnu"}`}>{s.sentiment}</span></td>
                              <td style={{fontSize:11,color:"var(--ink-3)"}}>{s.topic}</td>
                              <td><span className={`pill ${s.urgency === "urgent" ? "pu" : s.urgency === "follow_up" ? "pf" : "pnu"}`}>{s.urgency}</span></td>
                              <td><span className={`pill ${s.status === "completed" ? "pc" : "ppr"}`}>{s.status}</span></td>
                            </tr>
                            {expandedSession === s.id && s.transcript && (
                              <tr key={`${s.id}-exp`}>
                                <td colSpan={5}>
                                  <div className="sess-expand">"{s.transcript}"</div>
                                </td>
                              </tr>
                            )}
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div style={{display:"flex",flexDirection:"column",gap:14}}>
                    <div className="card">
                      <div className="ch"><div className="ct">Top topics</div></div>
                      <div className="tbars">
                        {TOPIC_DATA.map((t) => (
                          <div key={t.name} className="trow">
                            <div className="tmeta"><span className="tn">{t.name}</span><span className="tp">{t.pct}%</span></div>
                            <div className="track"><div className="fill" style={{width:`${t.pct}%`,background:t.color}} /></div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="card">
                      <div className="ch"><div className="ct">Sentiment</div><span className="pill pp">61% positive</span></div>
                      <div className="donut-wrap">
                        <svg width="90" height="90" viewBox="0 0 90 90" aria-label="Donut chart: 61% positive, 25% neutral, 14% negative">
                          <circle cx="45" cy="45" r="35" fill="none" stroke="var(--paper-2)" strokeWidth="14"/>
                          <circle cx="45" cy="45" r="35" fill="none" stroke="#1D9E75" strokeWidth="14"
                            strokeDasharray={`${0.61*220} ${220}`} strokeDashoffset="55" strokeLinecap="round"/>
                          <circle cx="45" cy="45" r="35" fill="none" stroke="#888" strokeWidth="14"
                            strokeDasharray={`${0.25*220} ${220}`} strokeDashoffset={`${-(0.61*220)+55}`} />
                          <circle cx="45" cy="45" r="35" fill="none" stroke="#E24B4A" strokeWidth="14"
                            strokeDasharray={`${0.14*220} ${220}`} strokeDashoffset={`${-(0.86*220)+55}`} />
                        </svg>
                        <div className="donut-legend">
                          {[{c:"#1D9E75",l:"Positive",v:"61%"},{c:"#888",l:"Neutral",v:"25%"},{c:"#E24B4A",l:"Negative",v:"14%"}].map(i => (
                            <div key={i.l} className="leg">
                              <div className="legdot" style={{background:i.c}} />
                              {i.l}<span className="legval">{i.v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* LOCATIONS */}
                <div className="card">
                  <div className="ch"><div className="ct">Location performance</div><select className="sel"><option>By sentiment</option><option>By volume</option></select></div>
                  <div>
                    <div className="lrow lh"><span>Location</span><span>Sessions</span><span>Positive</span><span>Avg wait</span><span>Urgency</span></div>
                    {LOCATIONS.map((l) => (
                      <div key={l.name} className="lrow">
                        <span style={{fontWeight:500,fontSize:12,color:"var(--ink)"}}>{l.name}</span>
                        <span style={{color:"var(--ink-3)"}}>{l.sessions}</span>
                        <span style={{color:l.color,fontWeight:500}}>{l.positive}%</span>
                        <div className="bar-inline">
                          <div className="bi" style={{width:l.waitMin*0.8,background:l.color,maxWidth:60}} />
                          <span style={{color:"var(--ink-3)"}}>{l.waitMin}m</span>
                        </div>
                        <span>
                          {l.urgency > 0
                            ? <span className="pill pu">{l.urgency} urgent</span>
                            : <span className="pill pnu">none</span>
                          }
                        </span>
                      </div>
                    ))}
                  </div>
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
                    {filteredSessions.map((s) => (
                      <>
                        <tr key={s.id} className="sess-row" onClick={() => setExpandedSession(expandedSession === s.id ? null : s.id)}>
                          <td><span className="sess-id">{s.id}</span></td>
                          <td><span className={`pill ${s.sentiment === "positive" ? "pp" : s.sentiment === "negative" ? "pn" : "pnu"}`}>{s.sentiment}</span></td>
                          <td style={{fontSize:11,color:"var(--ink-3)",fontFamily:"var(--font-mono)"}}>{s.score.toFixed(2)}</td>
                          <td style={{fontSize:11,color:"var(--ink-3)"}}>{s.topic}</td>
                          <td><span className={`pill ${s.urgency === "urgent" ? "pu" : s.urgency === "follow_up" ? "pf" : "pnu"}`}>{s.urgency}</span></td>
                          <td><span className={`pill ${s.status === "completed" ? "pc" : "ppr"}`}>{s.status}</span></td>
                          <td style={{fontSize:11,color:"var(--ink-3)"}}>{s.ts}</td>
                        </tr>
                        {expandedSession === s.id && s.transcript && (
                          <tr key={`${s.id}-exp`}>
                            <td colSpan={7}>
                              <div className="sess-expand">"{s.transcript}"</div>
                            </td>
                          </tr>
                        )}
                      </>
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
                  {urgentSessions.map((s) => (
                    <div key={s.id} className={`ai ${s.urgency === "urgent" ? "urg" : "fol"}`}>
                      <div className={`adot ${s.urgency === "urgent" ? "du" : "df"}`} />
                      <div>
                        <div className="at">"{s.transcript}"</div>
                        <div className="am">{s.id} · {s.ts} · {s.topic}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── API KEYS ── */}
            {nav === "apikeys" && (
              <div className="card">
                <div className="ch">
                  <div className="ct">API keys</div>
                  <button className="btn-primary">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1.5V9.5M1.5 5.5H9.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    Generate key
                  </button>
                </div>
                <div style={{display:"flex",flexDirection:"column"}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 160px 100px 120px",gap:8,padding:"0 0 8px",fontSize:10,fontWeight:500,color:"var(--ink-3)",textTransform:"uppercase",letterSpacing:"0.06em",borderBottom:"0.5px solid var(--paper-3)"}}>
                    <span>Name</span><span>Key</span><span>Last used</span><span></span>
                  </div>
                  {[
                    { name: "Production", key: "sk-live_••••••••3HO", used: "2 min ago" },
                    { name: "Staging", key: "sk-live_••••••••7KX", used: "1 day ago" },
                    { name: "Dev / local", key: "sk-test_••••••••1234", used: "3 days ago" },
                  ].map((k) => (
                    <div key={k.name} className="key-row">
                      <span style={{fontWeight:500,fontSize:13}}>{k.name}</span>
                      <span
                        className="key-code"
                        onClick={() => { navigator.clipboard.writeText(k.key); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                      >{k.key}</span>
                      <span style={{fontSize:11,color:"var(--ink-3)"}}>{k.used}</span>
                      <div style={{display:"flex",gap:6}}>
                        <button className="btn-sm" onClick={copyKey}>{copied ? "✓" : "Copy"}</button>
                        <button className="btn-danger">Revoke</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── WEBHOOKS ── */}
            {nav === "webhooks" && (
              <div className="card">
                <div className="ch">
                  <div className="ct">Webhook endpoints</div>
                  <button className="btn-primary">
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1.5V9.5M1.5 5.5H9.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/></svg>
                    Add endpoint
                  </button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:12}}>
                  {[
                    { url: "https://acme-motors.com/webhook/hearloop", events: ["session.completed","session.failed"], status: "active", lastDelivery: "2 min ago", success: true },
                    { url: "https://acme-motors.com/webhook/alerts", events: ["session.completed"], status: "active", lastDelivery: "14 min ago", success: true },
                  ].map((w) => (
                    <div key={w.url} style={{background:"var(--paper-2)",border:"0.5px solid var(--paper-3)",borderRadius:8,padding:"12px 14px"}}>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"var(--ink-2)"}}>{w.url}</span>
                        <span className={`pill ${w.status === "active" ? "pc" : "pn"}`}>{w.status}</span>
                      </div>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
                        {w.events.map(e => <span key={e} style={{fontSize:10,background:"var(--paper)",border:"0.5px solid var(--paper-3)",borderRadius:4,padding:"2px 6px",color:"var(--ink-3)"}}>{e}</span>)}
                      </div>
                      <div style={{fontSize:11,color:"var(--ink-3)"}}>
                        Last delivery: {w.lastDelivery} · {w.success ? <span style={{color:"var(--green)"}}>✓ 200 OK</span> : <span style={{color:"var(--red)"}}>✗ Failed</span>}
                      </div>
                    </div>
                  ))}
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
                    {TOPIC_DATA.map((t) => (
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