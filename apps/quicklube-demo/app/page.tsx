import { HearloopWidgetEmbed } from "../components/HearloopWidgetEmbed";

const SERVICES = [
  {
    title: "Full synthetic oil change",
    detail: "Most vehicles · ~30 min",
    price: "From $49",
  },
  {
    title: "Tire rotation",
    detail: "Extend tread life",
    price: "From $29",
  },
  {
    title: "Brake inspection",
    detail: "Pads & rotors checked",
    price: "Free with service",
  },
];

const HOURS = [
  { day: "Mon – Fri", time: "7:00 AM – 7:00 PM" },
  { day: "Saturday", time: "8:00 AM – 5:00 PM" },
  { day: "Sunday", time: "9:00 AM – 4:00 PM" },
];

export default function HomePage() {
  return (
    <>
      <style>{`
        .ql-header {
          background: var(--ql-navy);
          color: var(--ql-white);
          padding: 14px 24px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .ql-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-weight: 700;
          font-size: 1.15rem;
          letter-spacing: -0.02em;
        }
        .ql-logo-mark {
          width: 36px;
          height: 36px;
          background: var(--ql-red);
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
        }
        .ql-nav {
          display: flex;
          gap: 20px;
          font-size: 0.9rem;
          opacity: 0.9;
        }
        .ql-nav a:hover { opacity: 1; text-decoration: underline; }
        .ql-hero {
          background: linear-gradient(135deg, var(--ql-navy) 0%, #2d3a4f 55%, var(--ql-red-dark) 100%);
          color: var(--ql-white);
          padding: 56px 24px 72px;
          text-align: center;
        }
        .ql-hero h1 {
          font-size: clamp(1.75rem, 4vw, 2.5rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          margin-bottom: 12px;
        }
        .ql-hero p {
          max-width: 520px;
          margin: 0 auto 24px;
          font-size: 1.05rem;
          line-height: 1.55;
          opacity: 0.92;
        }
        .ql-cta {
          display: inline-block;
          background: var(--ql-red);
          color: white;
          padding: 12px 28px;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.95rem;
        }
        .ql-cta:hover { background: var(--ql-red-dark); }
        .ql-hint {
          margin-top: 20px;
          font-size: 0.85rem;
          opacity: 0.75;
        }
        .ql-section {
          max-width: 960px;
          margin: 0 auto;
          padding: 48px 24px;
        }
        .ql-section h2 {
          font-size: 1.35rem;
          margin-bottom: 20px;
          color: var(--ql-navy);
        }
        .ql-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
          gap: 16px;
        }
        .ql-card {
          background: var(--ql-white);
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 12px rgba(26, 35, 50, 0.06);
          border: 1px solid rgba(26, 35, 50, 0.06);
        }
        .ql-card h3 { font-size: 1rem; margin-bottom: 6px; }
        .ql-card p { font-size: 0.88rem; color: var(--ql-slate); }
        .ql-price {
          margin-top: 12px;
          font-weight: 700;
          color: var(--ql-red);
          font-size: 0.95rem;
        }
        .ql-feedback-band {
          background: var(--ql-white);
          border-top: 1px solid rgba(26, 35, 50, 0.08);
          border-bottom: 1px solid rgba(26, 35, 50, 0.08);
          text-align: center;
          padding: 40px 24px;
        }
        .ql-feedback-band p {
          color: var(--ql-slate);
          font-size: 0.95rem;
          max-width: 480px;
          margin: 8px auto 0;
          line-height: 1.5;
        }
        .ql-footer {
          background: var(--ql-navy);
          color: rgba(255,255,255,0.75);
          padding: 32px 24px;
          font-size: 0.85rem;
          text-align: center;
        }
        .ql-footer a { color: #7ec8e3; }
        .ql-footer a:hover { text-decoration: underline; }
      `}</style>

      <header className="ql-header">
        <div className="ql-logo">
          <div className="ql-logo-mark" aria-hidden>
            ⚡
          </div>
          QuickLube Express
        </div>
        <nav className="ql-nav" aria-label="Main">
          <a href="#services">Services</a>
          <a href="#hours">Hours</a>
          <a href="#feedback">Feedback</a>
        </nav>
      </header>

      <section className="ql-hero">
        <h1>In and out in under an hour</h1>
        <p>
          Walk-in oil changes, tire rotations, and brake checks — no appointment
          needed at our North Avenue location.
        </p>
        <a className="ql-cta" href="#services">
          See services
        </a>
        <p className="ql-hint">
          Finished your visit? Tap the <strong>feedback button</strong> (bottom
          right) and tell us how we did — about 5 seconds.
        </p>
      </section>

      <section className="ql-section" id="services">
        <h2>Popular services</h2>
        <div className="ql-grid">
          {SERVICES.map((s) => (
            <article key={s.title} className="ql-card">
              <h3>{s.title}</h3>
              <p>{s.detail}</p>
              <div className="ql-price">{s.price}</div>
            </article>
          ))}
        </div>
      </section>

      <section className="ql-feedback-band" id="feedback">
        <h2>We listen</h2>
        <p>
          Your voice feedback goes straight to our team — powered by Hearloop.
          Use the widget on this page after your service.
        </p>
      </section>

      <section className="ql-section" id="hours">
        <h2>Store hours — North Avenue</h2>
        <div className="ql-grid">
          {HOURS.map((h) => (
            <div key={h.day} className="ql-card">
              <h3>{h.day}</h3>
              <p>{h.time}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="ql-footer">
        <p>© {new Date().getFullYear()} QuickLube Express (demo site)</p>
        <p style={{ marginTop: 8 }}>
          Partner dashboard:{" "}
          <a
            href="https://hearloop.vercel.app/login"
            target="_blank"
            rel="noopener noreferrer"
          >
            Hearloop login
          </a>
        </p>
      </footer>

      <HearloopWidgetEmbed />
    </>
  );
}
