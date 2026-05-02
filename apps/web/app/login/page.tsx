"use client";
// hearloop/apps/web/app/login/page.tsx

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Placeholder auth — wire to real backend later
    await new Promise((r) => setTimeout(r, 900));

    if (email && password.length >= 6) {
      // Store mock session
      localStorage.setItem("hl_session", JSON.stringify({ email, ts: Date.now() }));
      router.push("/dashboard");
    } else {
      setError(password.length < 6 ? "Password must be at least 6 characters." : "Please enter a valid email.");
    }

    setLoading(false);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --ink: #0E0E0E;
          --ink-2: #3A3A3A;
          --ink-3: #888;
          --paper: #F7F4EE;
          --paper-2: #EFECE4;
          --paper-3: #E0DDD4;
          --green: #1D9E75;
          --green-light: #E1F5EE;
          --red: #E24B4A;
        }

        html, body { height: 100%; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: var(--paper);
          color: var(--ink);
          min-height: 100vh;
          display: flex;
        }

        .page {
          display: grid;
          grid-template-columns: 1fr 480px;
          min-height: 100vh;
          width: 100%;
        }

        /* LEFT PANEL */
        .left {
          background: var(--ink);
          padding: 48px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          position: relative;
          overflow: hidden;
        }

        .left-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 20% 80%, rgba(29,158,117,0.15) 0%, transparent 60%),
            radial-gradient(ellipse 60% 40% at 80% 20%, rgba(200,168,75,0.08) 0%, transparent 50%);
          pointer-events: none;
        }

        .left-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-family: 'Instrument Serif', serif;
          font-size: 22px;
          color: var(--paper);
          text-decoration: none;
          position: relative;
          z-index: 1;
        }

        .logo-drop {
          width: 32px; height: 32px;
          background: var(--green);
          border-radius: 50% 50% 50% 10px;
          display: flex; align-items: center; justify-content: center;
        }

        .left-content {
          position: relative;
          z-index: 1;
        }

        .left-tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: rgba(29,158,117,0.15);
          color: #7EC8A4;
          font-size: 11px;
          font-weight: 500;
          padding: 5px 12px;
          border-radius: 99px;
          margin-bottom: 24px;
          letter-spacing: 0.04em;
        }

        .left-h {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(32px, 3.5vw, 52px);
          color: var(--paper);
          line-height: 1.1;
          margin-bottom: 20px;
        }

        .left-h em { font-style: italic; color: var(--green); }

        .left-sub {
          font-size: 15px;
          color: rgba(247,244,238,0.5);
          line-height: 1.6;
          font-weight: 300;
          max-width: 400px;
        }

        .left-stats {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 1px;
          background: rgba(255,255,255,0.06);
          border-radius: 12px;
          overflow: hidden;
          position: relative;
          z-index: 1;
        }

        .left-stat {
          background: rgba(255,255,255,0.03);
          padding: 20px;
          text-align: center;
        }

        .stat-n {
          font-family: 'Instrument Serif', serif;
          font-size: 28px;
          color: var(--paper);
          line-height: 1;
          margin-bottom: 4px;
        }

        .stat-n span { color: var(--green); }
        .stat-l { font-size: 11px; color: rgba(247,244,238,0.4); }

        /* RIGHT PANEL */
        .right {
          background: var(--paper);
          padding: 48px 40px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          border-left: 0.5px solid var(--paper-3);
        }

        .right-inner { max-width: 340px; width: 100%; margin: 0 auto; }

        .form-header { margin-bottom: 32px; }

        .form-title {
          font-family: 'Instrument Serif', serif;
          font-size: 28px;
          color: var(--ink);
          margin-bottom: 6px;
        }

        .form-sub { font-size: 13px; color: var(--ink-3); }

        .form-sub a {
          color: var(--green);
          text-decoration: none;
          font-weight: 500;
          cursor: pointer;
        }

        .form { display: flex; flex-direction: column; gap: 14px; }

        .field { display: flex; flex-direction: column; gap: 5px; }

        .label {
          font-size: 12px;
          font-weight: 500;
          color: var(--ink-2);
          letter-spacing: 0.02em;
        }

        .input {
          padding: 10px 14px;
          background: var(--paper-2);
          border: 0.5px solid var(--paper-3);
          border-radius: 8px;
          font-size: 14px;
          color: var(--ink);
          font-family: 'DM Sans', sans-serif;
          transition: border-color 0.15s, background 0.15s;
          outline: none;
          width: 100%;
        }

        .input:focus {
          border-color: var(--green);
          background: var(--paper);
        }

        .input::placeholder { color: var(--ink-3); }

        .forgot {
          font-size: 12px;
          color: var(--ink-3);
          text-decoration: none;
          text-align: right;
          display: block;
          margin-top: -6px;
          transition: color 0.15s;
          cursor: pointer;
        }

        .forgot:hover { color: var(--green); }

        .error-msg {
          font-size: 12px;
          color: var(--red);
          background: #FCEBEB;
          border: 0.5px solid #F09595;
          border-radius: 8px;
          padding: 9px 12px;
        }

        .submit-btn {
          width: 100%;
          padding: 12px;
          background: var(--green);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s, transform 0.1s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 4px;
        }

        .submit-btn:hover:not(:disabled) { background: #0F6E56; transform: translateY(-1px); }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 4px 0;
        }

        .divider-line { flex: 1; height: 0.5px; background: var(--paper-3); }
        .divider-text { font-size: 11px; color: var(--ink-3); }

        .oauth-btn {
          width: 100%;
          padding: 10px;
          background: transparent;
          border: 0.5px solid var(--paper-3);
          border-radius: 8px;
          font-size: 13px;
          color: var(--ink-2);
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          transition: border-color 0.15s, background 0.15s;
        }

        .oauth-btn:hover { border-color: var(--ink-3); background: var(--paper-2); }

        .terms {
          font-size: 11px;
          color: var(--ink-3);
          text-align: center;
          margin-top: 16px;
          line-height: 1.5;
        }

        .terms a { color: var(--ink-2); text-decoration: underline; }

        .spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }

        @keyframes spin { to { transform: rotate(360deg); } }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .right-inner { animation: fadeIn 0.4s ease both; }
      `}</style>

      <div className="page">
        {/* LEFT */}
        <div className="left">
          <div className="left-bg" />
          <a href="/" className="left-logo">
            <div className="logo-drop">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2C8 2 4 5 4 9C4 11.2 5.8 13 8 13C10.2 13 12 11.2 12 9C12 5 8 2 8 2Z" fill="white" opacity=".9"/>
                <circle cx="8" cy="9" r="2" fill="white" opacity=".5"/>
              </svg>
            </div>
            Hearloop
          </a>

          <div className="left-content">
            <div className="left-tag">
              <svg width="6" height="6" viewBox="0 0 6 6" fill="none">
                <circle cx="3" cy="3" r="3" fill="#7EC8A4"/>
              </svg>
              Partner dashboard
            </div>
            <h2 className="left-h">
              Your customers<br />
              are <em>talking</em>.<br />
              Are you listening?
            </h2>
            <p className="left-sub">
              Hearloop turns 5-second voice clips into
              structured business insights — sentiment, topics,
              urgency — delivered instantly to your system.
            </p>
          </div>

          <div className="left-stats">
            <div className="left-stat">
              <div className="stat-n">94<span>%</span></div>
              <div className="stat-l">completion rate</div>
            </div>
            <div className="left-stat">
              <div className="stat-n"><span>&lt;</span>5s</div>
              <div className="stat-l">to capture</div>
            </div>
            <div className="left-stat">
              <div className="stat-n"><span>$</span>0</div>
              <div className="stat-l">to start</div>
            </div>
          </div>
        </div>

        {/* RIGHT */}
        <div className="right">
          <div className="right-inner">
            <div className="form-header">
              <div className="form-title">
                {mode === "login" ? "Welcome back." : "Create account."}
              </div>
              <div className="form-sub">
                {mode === "login" ? (
                  <>No account? <a onClick={() => { setMode("signup"); setError(""); }}>Sign up free</a></>
                ) : (
                  <>Already have an account? <a onClick={() => { setMode("login"); setError(""); }}>Sign in</a></>
                )}
              </div>
            </div>

            <form className="form" onSubmit={handleSubmit}>
              {mode === "signup" && (
                <div className="field">
                  <label className="label">Company name</label>
                  <input
                    className="input"
                    type="text"
                    placeholder="Acme Motors"
                    required
                  />
                </div>
              )}

              <div className="field">
                <label className="label">Email</label>
                <input
                  className="input"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label className="label">Password</label>
                <input
                  className="input"
                  type="password"
                  placeholder={mode === "login" ? "••••••••" : "Min. 6 characters"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {mode === "login" && (
                <a className="forgot">Forgot password?</a>
              )}

              {error && <div className="error-msg">{error}</div>}

              <button className="submit-btn" type="submit" disabled={loading}>
                {loading ? (
                  <><div className="spinner" /> {mode === "login" ? "Signing in..." : "Creating account..."}</>
                ) : (
                  mode === "login" ? "Sign in to dashboard" : "Create free account"
                )}
              </button>

              <div className="divider">
                <div className="divider-line" />
                <span className="divider-text">or continue with</span>
                <div className="divider-line" />
              </div>

              <button type="button" className="oauth-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M15.5 8.17C15.5 7.64 15.45 7.13 15.37 6.64H8V9.54H12.19C12 10.47 11.44 11.26 10.6 11.79V13.69H13.15C14.65 12.31 15.5 10.42 15.5 8.17Z" fill="#4285F4"/>
                  <path d="M8 15.5C10.11 15.5 11.89 14.8 13.15 13.69L10.6 11.79C9.9 12.25 9.02 12.52 8 12.52C5.96 12.52 4.22 11.12 3.6 9.24H0.97V11.19C2.22 13.67 4.92 15.5 8 15.5Z" fill="#34A853"/>
                  <path d="M3.6 9.24C3.44 8.78 3.35 8.29 3.35 7.78C3.35 7.27 3.44 6.78 3.6 6.32V4.37H0.97C0.36 5.58 0 6.94 0 8.37C0 9.8 0.36 11.16 0.97 12.37L3.6 10.42V9.24Z" fill="#FBBC05"/>
                  <path d="M8 3.04C9.12 3.04 10.13 3.43 10.92 4.19L13.21 1.9C11.89 0.68 10.11 0 8 0C4.92 0 2.22 1.83 0.97 4.37L3.6 6.32C4.22 4.44 5.96 3.04 8 3.04Z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </form>

            {mode === "signup" && (
              <p className="terms">
                By creating an account you agree to our{" "}
                <a href="#">Terms of Service</a> and{" "}
                <a href="#">Privacy Policy</a>.
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}