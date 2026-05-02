// hearloop/apps/web/app/capture/[token]/page.tsx

import { notFound } from "next/navigation";
import Recorder from "../../../components/Recorder";

interface CapturePageProps {
  params: Promise<{ token: string }>;
}

async function getSessionConfig(token: string) {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/public/session/${token}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function CapturePage({ params }: CapturePageProps) {
  const { token } = await params;
  const session = await getSessionConfig(token);

  if (!session) notFound();

  if (session.status === "expired") {
    return <StatusScreen type="expired" />;
  }

  if (["submitted", "processing", "completed"].includes(session.status)) {
    return <StatusScreen type="submitted" />;
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --ink: #0E0E0E;
          --ink-2: #3A3A3A;
          --ink-3: #999;
          --paper: #F7F4EE;
          --paper-2: #EFECE4;
          --paper-3: #E0DDD4;
          --green: #1D9E75;
          --green-l: #E1F5EE;
        }

        html, body {
          height: 100%;
          font-family: 'DM Sans', sans-serif;
          background: var(--paper);
          color: var(--ink);
        }

        .page {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          position: relative;
          overflow: hidden;
        }

        .bg {
          position: fixed;
          inset: 0;
          background:
            radial-gradient(ellipse 70% 50% at 50% 0%, rgba(29,158,117,0.07) 0%, transparent 60%),
            radial-gradient(ellipse 50% 40% at 80% 100%, rgba(200,168,75,0.05) 0%, transparent 50%);
          pointer-events: none;
        }

        .card {
          background: #fff;
          border: 0.5px solid var(--paper-3);
          border-radius: 20px;
          padding: 36px 32px;
          width: 100%;
          max-width: 380px;
          position: relative;
          z-index: 1;
          box-shadow: 0 4px 40px rgba(0,0,0,0.06);
          animation: fadeUp 0.4s ease both;
        }

        .card-header { text-align: center; margin-bottom: 28px; }

        .logo {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          font-family: 'Instrument Serif', serif;
          font-size: 16px;
          color: var(--ink);
          margin-bottom: 24px;
          text-decoration: none;
        }

        .logo-drop {
          width: 24px; height: 24px;
          background: var(--green);
          border-radius: 50% 50% 50% 8px;
          display: flex; align-items: center; justify-content: center;
        }

        .divider {
          width: 40px;
          height: 0.5px;
          background: var(--paper-3);
          margin: 0 auto 20px;
        }

        .prompt {
          font-family: 'Instrument Serif', serif;
          font-size: 22px;
          color: var(--ink);
          line-height: 1.25;
          margin-bottom: 6px;
        }

        .duration {
          font-size: 12px;
          color: var(--ink-3);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        .footer {
          margin-top: 24px;
          text-align: center;
          font-size: 11px;
          color: var(--ink-3);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        .footer a {
          color: var(--green);
          text-decoration: none;
          font-weight: 500;
        }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div className="bg" />

      <div className="page">
        <div className="card">
          <div className="card-header">
            <a href="https://hearloop.vercel.app" className="logo">
              <div className="logo-drop">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1C6 1 3 3.5 3 6.5C3 8.2 4.3 9.5 6 9.5C7.7 9.5 9 8.2 9 6.5C9 3.5 6 1 6 1Z" fill="white" opacity=".9"/>
                  <circle cx="6" cy="6.5" r="1.3" fill="white" opacity=".5"/>
                </svg>
              </div>
              Hearloop
            </a>

            <div className="divider" />

            <div className="prompt">
              {session.promptText ?? "How was your experience today?"}
            </div>
            <div className="duration">
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1"/>
                <path d="M5.5 3V5.5L7 7" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/>
              </svg>
              Up to {session.maxDurationSec ?? 5} seconds
            </div>
          </div>

          <Recorder
            sessionToken={token}
            maxDurationSec={session.maxDurationSec ?? 5}
            promptText={session.promptText}
            consentRequired={session.consentRequired ?? false}
            consentText={session.consentText}
          />

          <div className="footer">
            Powered by{" "}
            <a href="https://hearloop.vercel.app">Hearloop</a>
          </div>
        </div>
      </div>
    </>
  );
}

function StatusScreen({ type }: { type: "expired" | "submitted" }) {
  const isExpired = type === "expired";
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --ink: #0E0E0E; --ink-3: #999; --paper: #F7F4EE; --paper-3: #E0DDD4; --green: #1D9E75; --red: #E24B4A; }
        html, body { height: 100%; font-family: 'DM Sans', sans-serif; background: var(--paper); color: var(--ink); }
        .page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .card { background: #fff; border: 0.5px solid var(--paper-3); border-radius: 20px; padding: 48px 32px; max-width: 340px; width: 100%; text-align: center; box-shadow: 0 4px 40px rgba(0,0,0,0.06); animation: fadeUp 0.4s ease both; }
        .icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 22px; }
        .title { font-family: 'Instrument Serif', serif; font-size: 22px; color: var(--ink); margin-bottom: 8px; }
        .sub { font-size: 13px; color: var(--ink-3); line-height: 1.5; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
      <div className="page">
        <div className="card">
          <div className="icon" style={{background: isExpired ? "#FCEBEB" : "#E1F5EE"}}>
            {isExpired ? "✕" : "✓"}
          </div>
          <div className="title">{isExpired ? "Link expired." : "Already received."}</div>
          <div className="sub">
            {isExpired
              ? "This feedback link is no longer valid. Please ask for a new one."
              : "Your feedback has been received. Thank you — it means a lot."}
          </div>
        </div>
      </div>
    </>
  );
}