"use client";
// hearloop/apps/web/app/page.tsx
// Drop this file into apps/web/app/page.tsx

import { useState, useEffect, useRef } from "react";

export default function LandingPage() {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"node" | "html">("node");
  const heroRef = useRef<HTMLDivElement>(null);

  const copySnippet = () => {
    navigator.clipboard.writeText(
      `<script src="https://hearloop.vercel.app/widget.js"></script>\n<script>\n  Hearloop.init({\n    apiKey: "sk-live_your_key",\n    promptText: "How was your service today?"\n  });\n</script>`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          --paper-3: #E5E1D6;
          --green: #1D9E75;
          --green-light: #E1F5EE;
          --red: #E24B4A;
          --gold: #C8A84B;
          --r: 12px;
        }

        html { scroll-behavior: smooth; }

        body {
          font-family: 'DM Sans', sans-serif;
          background: var(--paper);
          color: var(--ink);
          overflow-x: hidden;
        }

        /* ── NAV ── */
        nav {
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 100;
          padding: 16px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: rgba(247, 244, 238, 0.85);
          backdrop-filter: blur(12px);
          border-bottom: 0.5px solid var(--paper-3);
        }

        .nav-logo {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: 'Instrument Serif', serif;
          font-size: 20px;
          color: var(--ink);
          text-decoration: none;
        }

        .logo-drop {
          width: 28px; height: 28px;
          background: var(--green);
          border-radius: 50% 50% 50% 10px;
          display: flex; align-items: center; justify-content: center;
        }

        .nav-links {
          display: flex;
          align-items: center;
          gap: 32px;
          list-style: none;
        }

        .nav-links a {
          font-size: 13px;
          color: var(--ink-2);
          text-decoration: none;
          transition: color 0.15s;
        }

        .nav-links a:hover { color: var(--ink); }

        .nav-cta {
          background: var(--ink);
          color: var(--paper) !important;
          padding: 8px 18px;
          border-radius: 99px;
          font-size: 13px;
          font-weight: 500;
          transition: background 0.15s !important;
        }

        .nav-cta:hover { background: var(--ink-2) !important; }

        /* ── HERO ── */
        .hero {
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 120px 40px 80px;
          position: relative;
          overflow: hidden;
          text-align: center;
        }

        .hero-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 60% 50% at 50% 0%, rgba(29,158,117,0.08) 0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 80% 80%, rgba(200,168,75,0.06) 0%, transparent 60%);
          pointer-events: none;
        }

        .hero-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--green-light);
          color: var(--green);
          font-size: 12px;
          font-weight: 500;
          padding: 5px 12px;
          border-radius: 99px;
          margin-bottom: 24px;
          letter-spacing: 0.02em;
          animation: fadeUp 0.6s ease both;
        }

        .hero-h1 {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(48px, 8vw, 96px);
          line-height: 1.0;
          color: var(--ink);
          max-width: 900px;
          margin-bottom: 24px;
          animation: fadeUp 0.6s 0.1s ease both;
        }

        .hero-h1 em {
          font-style: italic;
          color: var(--green);
        }

        .hero-sub {
          font-size: 18px;
          color: var(--ink-2);
          max-width: 520px;
          line-height: 1.6;
          margin-bottom: 40px;
          animation: fadeUp 0.6s 0.2s ease both;
          font-weight: 300;
        }

        .hero-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          animation: fadeUp 0.6s 0.3s ease both;
        }

        .btn-primary {
          background: var(--green);
          color: #fff;
          padding: 13px 28px;
          border-radius: 99px;
          font-size: 14px;
          font-weight: 500;
          text-decoration: none;
          border: none;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .btn-primary:hover { background: #0F6E56; transform: translateY(-1px); }

        .btn-ghost {
          color: var(--ink-2);
          padding: 13px 24px;
          border-radius: 99px;
          font-size: 14px;
          text-decoration: none;
          border: 0.5px solid var(--paper-3);
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
          background: transparent;
        }

        .btn-ghost:hover { border-color: var(--ink-3); background: var(--paper-2); }

        .hero-demo {
          margin-top: 64px;
          width: 100%;
          max-width: 820px;
          background: var(--paper-2);
          border: 0.5px solid var(--paper-3);
          border-radius: 20px;
          overflow: hidden;
          animation: fadeUp 0.6s 0.4s ease both;
          box-shadow: 0 32px 80px rgba(0,0,0,0.08);
        }

        .demo-bar {
          background: var(--paper-3);
          padding: 12px 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .demo-dot {
          width: 10px; height: 10px;
          border-radius: 50%;
        }

        .demo-url {
          flex: 1;
          background: var(--paper-2);
          border-radius: 6px;
          padding: 4px 12px;
          font-family: 'DM Mono', monospace;
          font-size: 11px;
          color: var(--ink-3);
          text-align: center;
        }

        .demo-content {
          padding: 32px;
          display: flex;
          gap: 24px;
          align-items: flex-start;
          position: relative;
        }

        .demo-page-lines {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .demo-line {
          height: 10px;
          background: var(--paper-3);
          border-radius: 99px;
        }

        .demo-widget-bubble {
          position: absolute;
          bottom: 24px; right: 24px;
        }

        .widget-fab {
          width: 52px; height: 52px;
          background: var(--green);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(29,158,117,0.35);
          transition: transform 0.2s;
        }

        .widget-fab:hover { transform: scale(1.08); }

        .widget-panel {
          position: absolute;
          bottom: 62px; right: 0;
          width: 220px;
          background: #fff;
          border: 0.5px solid var(--paper-3);
          border-radius: 14px;
          padding: 16px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }

        .widget-title { font-size: 13px; font-weight: 500; color: var(--ink); margin-bottom: 4px; }
        .widget-sub { font-size: 11px; color: var(--ink-3); margin-bottom: 12px; }

        .widget-mic {
          width: 100%;
          height: 64px;
          background: var(--green-light);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          margin-bottom: 10px;
          cursor: pointer;
        }

        .mic-circle {
          width: 28px; height: 28px;
          background: var(--green);
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
        }

        .widget-send {
          width: 100%;
          padding: 8px;
          background: var(--green);
          color: #fff;
          border: none;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
        }

        /* ── STATS ── */
        .stats {
          padding: 60px 40px;
          display: flex;
          justify-content: center;
          gap: 0;
          border-top: 0.5px solid var(--paper-3);
          border-bottom: 0.5px solid var(--paper-3);
        }

        .stat {
          flex: 1;
          max-width: 220px;
          text-align: center;
          padding: 0 32px;
          border-right: 0.5px solid var(--paper-3);
        }

        .stat:last-child { border-right: none; }

        .stat-num {
          font-family: 'Instrument Serif', serif;
          font-size: 48px;
          color: var(--ink);
          line-height: 1;
          margin-bottom: 6px;
        }

        .stat-num span { color: var(--green); }
        .stat-label { font-size: 13px; color: var(--ink-3); }

        /* ── HOW IT WORKS ── */
        .section {
          padding: 100px 40px;
          max-width: 1100px;
          margin: 0 auto;
        }

        .section-eyebrow {
          font-size: 11px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: var(--green);
          margin-bottom: 12px;
        }

        .section-title {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(32px, 4vw, 52px);
          line-height: 1.1;
          color: var(--ink);
          margin-bottom: 16px;
        }

        .section-sub {
          font-size: 16px;
          color: var(--ink-2);
          max-width: 480px;
          line-height: 1.6;
          font-weight: 300;
          margin-bottom: 60px;
        }

        .steps {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 24px;
        }

        .step {
          background: var(--paper-2);
          border: 0.5px solid var(--paper-3);
          border-radius: var(--r);
          padding: 28px;
          position: relative;
        }

        .step-num {
          font-family: 'Instrument Serif', serif;
          font-size: 64px;
          color: var(--paper-3);
          line-height: 1;
          margin-bottom: 16px;
        }

        .step-icon {
          width: 40px; height: 40px;
          background: var(--green-light);
          border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
          margin-bottom: 16px;
        }

        .step-title { font-size: 16px; font-weight: 500; color: var(--ink); margin-bottom: 8px; }
        .step-body { font-size: 13px; color: var(--ink-2); line-height: 1.6; }

        /* ── CODE SNIPPET ── */
        .code-section {
          background: var(--ink);
          padding: 100px 40px;
        }

        .code-inner {
          max-width: 1100px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 60px;
          align-items: center;
        }

        .code-text .section-title { color: var(--paper); }
        .code-text .section-sub { color: rgba(247,244,238,0.6); }
        .code-text .section-eyebrow { color: var(--gold); }

        .code-block {
          background: rgba(255,255,255,0.04);
          border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: var(--r);
          overflow: hidden;
        }

        .code-tabs {
          display: flex;
          border-bottom: 0.5px solid rgba(255,255,255,0.08);
        }

        .code-tab {
          padding: 10px 16px;
          font-size: 12px;
          color: rgba(247,244,238,0.4);
          cursor: pointer;
          border: none;
          background: transparent;
          font-family: 'DM Mono', monospace;
          transition: color 0.15s;
        }

        .code-tab.active { color: var(--paper); border-bottom: 1px solid var(--green); }

        .code-body {
          padding: 20px;
          font-family: 'DM Mono', monospace;
          font-size: 12px;
          line-height: 1.8;
          color: rgba(247,244,238,0.7);
          overflow-x: auto;
        }

        .code-body .kw { color: #7EC8A4; }
        .code-body .str { color: #C8A84B; }
        .code-body .fn { color: #8BB8E8; }
        .code-body .cm { color: rgba(247,244,238,0.3); font-style: italic; }

        .code-copy {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 20px;
          border-top: 0.5px solid rgba(255,255,255,0.08);
        }

        .copy-hint { font-size: 11px; color: rgba(247,244,238,0.3); font-family: 'DM Mono', monospace; }

        .copy-btn {
          font-size: 11px;
          padding: 5px 12px;
          background: rgba(255,255,255,0.08);
          border: 0.5px solid rgba(255,255,255,0.12);
          border-radius: 6px;
          color: var(--paper);
          cursor: pointer;
          font-family: 'DM Mono', monospace;
          transition: background 0.15s;
        }

        .copy-btn:hover { background: rgba(255,255,255,0.14); }
        .copy-btn.copied { background: rgba(29,158,117,0.2); border-color: rgba(29,158,117,0.3); color: var(--green); }

        /* ── INDUSTRIES ── */
        .industries {
          padding: 100px 40px;
          max-width: 1100px;
          margin: 0 auto;
        }

        .industry-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
          margin-top: 48px;
        }

        .industry-card {
          background: var(--paper-2);
          border: 0.5px solid var(--paper-3);
          border-radius: var(--r);
          padding: 24px;
          transition: border-color 0.15s, transform 0.15s;
          cursor: default;
        }

        .industry-card:hover {
          border-color: var(--green);
          transform: translateY(-2px);
        }

        .industry-icon {
          font-size: 28px;
          margin-bottom: 12px;
          display: block;
        }

        .industry-name { font-size: 14px; font-weight: 500; color: var(--ink); margin-bottom: 6px; }
        .industry-desc { font-size: 12px; color: var(--ink-3); line-height: 1.5; }

        /* ── PIPELINE ── */
        .pipeline {
          background: var(--paper-2);
          border-top: 0.5px solid var(--paper-3);
          border-bottom: 0.5px solid var(--paper-3);
          padding: 100px 40px;
        }

        .pipeline-inner {
          max-width: 1100px;
          margin: 0 auto;
        }

        .pipeline-flow {
          display: flex;
          align-items: center;
          gap: 0;
          margin-top: 48px;
          overflow-x: auto;
          padding-bottom: 8px;
        }

        .pipeline-step {
          flex: 1;
          min-width: 130px;
          background: var(--paper);
          border: 0.5px solid var(--paper-3);
          border-radius: var(--r);
          padding: 16px;
          text-align: center;
        }

        .pipeline-icon {
          width: 36px; height: 36px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 10px;
        }

        .pipeline-label { font-size: 12px; font-weight: 500; color: var(--ink); }
        .pipeline-sub { font-size: 10px; color: var(--ink-3); margin-top: 3px; }

        .pipeline-arrow {
          width: 32px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ink-3);
          font-size: 18px;
        }

        /* ── PRICING ── */
        .pricing {
          padding: 100px 40px;
          max-width: 1100px;
          margin: 0 auto;
          text-align: center;
        }

        .pricing-cards {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
          margin-top: 48px;
          text-align: left;
        }

        .pricing-card {
          background: var(--paper-2);
          border: 0.5px solid var(--paper-3);
          border-radius: var(--r);
          padding: 28px;
        }

        .pricing-card.featured {
          background: var(--ink);
          border-color: var(--ink);
          color: var(--paper);
        }

        .pricing-plan { font-size: 12px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-3); margin-bottom: 12px; }
        .pricing-card.featured .pricing-plan { color: rgba(247,244,238,0.5); }

        .pricing-price {
          font-family: 'Instrument Serif', serif;
          font-size: 40px;
          color: var(--ink);
          line-height: 1;
          margin-bottom: 4px;
        }

        .pricing-card.featured .pricing-price { color: var(--paper); }

        .pricing-period { font-size: 13px; color: var(--ink-3); margin-bottom: 20px; }
        .pricing-card.featured .pricing-period { color: rgba(247,244,238,0.5); }

        .pricing-features { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px; }

        .pricing-features li {
          font-size: 13px;
          color: var(--ink-2);
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .pricing-card.featured .pricing-features li { color: rgba(247,244,238,0.7); }

        .check { color: var(--green); font-size: 14px; }

        .pricing-btn {
          display: block;
          width: 100%;
          padding: 10px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 500;
          text-align: center;
          cursor: pointer;
          border: 0.5px solid var(--paper-3);
          background: transparent;
          color: var(--ink);
          text-decoration: none;
          transition: background 0.15s;
        }

        .pricing-btn:hover { background: var(--paper-3); }

        .pricing-card.featured .pricing-btn {
          background: var(--green);
          border-color: var(--green);
          color: #fff;
        }

        .pricing-card.featured .pricing-btn:hover { background: #0F6E56; }

        /* ── CTA ── */
        .cta-section {
          background: var(--green);
          padding: 100px 40px;
          text-align: center;
        }

        .cta-title {
          font-family: 'Instrument Serif', serif;
          font-size: clamp(36px, 5vw, 64px);
          color: #fff;
          margin-bottom: 16px;
          line-height: 1.1;
        }

        .cta-sub {
          font-size: 17px;
          color: rgba(255,255,255,0.75);
          margin-bottom: 36px;
          font-weight: 300;
        }

        .btn-white {
          background: #fff;
          color: var(--green);
          padding: 14px 32px;
          border-radius: 99px;
          font-size: 15px;
          font-weight: 500;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          transition: transform 0.15s, box-shadow 0.15s;
        }

        .btn-white:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }

        /* ── FOOTER ── */
        footer {
          background: var(--ink);
          padding: 48px 40px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .footer-logo {
          font-family: 'Instrument Serif', serif;
          font-size: 18px;
          color: var(--paper);
          display: flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
        }

        .footer-links {
          display: flex;
          gap: 24px;
          list-style: none;
        }

        .footer-links a {
          font-size: 12px;
          color: rgba(247,244,238,0.4);
          text-decoration: none;
          transition: color 0.15s;
        }

        .footer-links a:hover { color: rgba(247,244,238,0.8); }

        .footer-copy { font-size: 12px; color: rgba(247,244,238,0.3); }

        /* ── ANIMATIONS ── */
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes ripple {
          0% { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.5); opacity: 0; }
        }

        .ripple-ring {
          position: absolute;
          width: 52px; height: 52px;
          border-radius: 50%;
          border: 1.5px solid rgba(29,158,117,0.4);
          animation: ripple 2s ease-out infinite;
        }

        .ripple-ring:nth-child(2) { animation-delay: 0.7s; }
        .ripple-ring:nth-child(3) { animation-delay: 1.4s; }
      `}</style>

      {/* NAV */}
      <nav>
        <a href="#" className="nav-logo">
          <div className="logo-drop">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1.5C7 1.5 3.5 4.5 3.5 8C3.5 9.9 5.1 11.5 7 11.5C8.9 11.5 10.5 9.9 10.5 8C10.5 4.5 7 1.5 7 1.5Z" fill="white" opacity=".9"/>
              <circle cx="7" cy="8" r="1.5" fill="white" opacity=".5"/>
            </svg>
          </div>
          Hearloop
        </a>
        <ul className="nav-links">
          <li><a href="#how">How it works</a></li>
          <li><a href="#industries">Industries</a></li>
          <li><a href="#pricing">Pricing</a></li>
          <li><a href="/docs">Docs</a></li>
          <li><a href="/dashboard" className="nav-cta">Get started</a></li>
        </ul>
      </nav>

      {/* HERO */}
      <section className="hero" ref={heroRef}>
        <div className="hero-bg" />
        <div className="hero-eyebrow">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <circle cx="5" cy="5" r="4" fill="#1D9E75"/>
          </svg>
          Voice feedback infrastructure for businesses
        </div>
        <h1 className="hero-h1">
          Customers speak.<br />
          You <em>listen</em> at scale.
        </h1>
        <p className="hero-sub">
          Replace survey forms with a 5-second voice tap.
          Hearloop captures, transcribes, and classifies customer feedback —
          delivered to your system via webhook.
        </p>
        <div className="hero-actions">
          <a href="/dashboard" className="btn-primary">
            Start for free
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 7H11M8 4L11 7L8 10" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
          <a href="#how" className="btn-ghost">See how it works</a>
        </div>

        {/* Browser mockup */}
        <div className="hero-demo">
          <div className="demo-bar">
            <div className="demo-dot" style={{background:"#E24B4A"}} />
            <div className="demo-dot" style={{background:"#EF9F27"}} />
            <div className="demo-dot" style={{background:"#1D9E75"}} />
            <div className="demo-url">acme-motors.com/service</div>
          </div>
          <div className="demo-content" style={{minHeight: 180}}>
            <div className="demo-page-lines" style={{paddingTop:8}}>
              <div className="demo-line" style={{width:"55%"}} />
              <div className="demo-line" style={{width:"80%"}} />
              <div className="demo-line" style={{width:"65%"}} />
              <div className="demo-line" style={{width:"72%", marginTop:12}} />
              <div className="demo-line" style={{width:"58%"}} />
              <div className="demo-line" style={{width:"80%"}} />
            </div>
            <div className="demo-widget-bubble">
              <div className="widget-panel">
                <div className="widget-title">Share your feedback</div>
                <div className="widget-sub">Tap the mic — 5 seconds</div>
                <div className="widget-mic">
                  <div className="mic-circle">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M6 1.5C6 1.5 4.5 2.5 4.5 4.5V7C4.5 7.8 5.2 8.5 6 8.5C6.8 8.5 7.5 7.8 7.5 7V4.5C7.5 2.5 6 1.5 6 1.5Z" fill="white"/>
                      <path d="M3.5 7.5C3.5 9 4.6 10 6 10" stroke="white" strokeWidth="1" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <span style={{fontSize:11, color:"#0F6E56"}}>Recording... 3s</span>
                  <div style={{display:"flex",gap:2,alignItems:"center"}}>
                    {[14,20,10,18,12].map((h,i) => (
                      <div key={i} style={{width:3,height:h,background:"#1D9E75",borderRadius:99,opacity:0.7}} />
                    ))}
                  </div>
                </div>
                <button className="widget-send">Send feedback</button>
              </div>
              <div style={{position:"relative",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <div className="ripple-ring" />
                <div className="ripple-ring" />
                <div className="ripple-ring" />
                <div className="widget-fab">
                  <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                    <path d="M11 2C11 2 5 6.5 5 11.5C5 14.2 7.7 16.5 11 16.5C14.3 16.5 17 14.2 17 11.5C17 6.5 11 2 11 2Z" fill="white" opacity=".9"/>
                    <circle cx="11" cy="11.5" r="2" fill="white" opacity=".5"/>
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="stats">
        <div className="stat">
          <div className="stat-num"><span>&lt;5%</span></div>
          <div className="stat-label">avg. survey completion rate</div>
        </div>
        <div className="stat">
          <div className="stat-num">94<span>%</span></div>
          <div className="stat-label">voice capture completion rate</div>
        </div>
        <div className="stat">
          <div className="stat-num">5<span>s</span></div>
          <div className="stat-label">all it takes to capture feedback</div>
        </div>
        <div className="stat">
          <div className="stat-num"><span>$</span>0.0001</div>
          <div className="stat-label">per analysis with Nova Lite</div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section className="section" id="how">
        <div className="section-eyebrow">How it works</div>
        <h2 className="section-title">Three steps.<br />Zero friction.</h2>
        <p className="section-sub">
          Embed once. Customers tap and speak.
          You get structured insights via webhook — automatically.
        </p>
        <div className="steps">
          <div className="step">
            <div className="step-num">01</div>
            <div className="step-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 4H16M4 8H12M4 12H10" stroke="#1D9E75" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="step-title">Embed the widget</div>
            <div className="step-body">Drop two lines of JavaScript into your site or app. The floating button appears instantly — no backend work on your end.</div>
          </div>
          <div className="step">
            <div className="step-num">02</div>
            <div className="step-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 4C10 4 7 6.5 7 9.5C7 11.2 8.3 12.5 10 12.5C11.7 12.5 13 11.2 13 9.5C13 6.5 10 4 10 4Z" fill="#1D9E75" opacity=".8"/>
                <path d="M7 11.5C7 13.2 8.3 15 10 15" stroke="#1D9E75" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            <div className="step-title">Customer speaks</div>
            <div className="step-body">One tap. Up to 5 seconds. No forms, no typing, no patience required. Audio uploads directly to secure storage.</div>
          </div>
          <div className="step">
            <div className="step-num">03</div>
            <div className="step-icon">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M4 10L8 14L16 6" stroke="#1D9E75" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="step-title">You receive insights</div>
            <div className="step-body">Transcript, sentiment score, topic tags, and urgency level — delivered to your webhook in seconds. No polling required.</div>
          </div>
        </div>
      </section>

      {/* CODE */}
      <div className="code-section">
        <div className="code-inner">
          <div className="code-text">
            <div className="section-eyebrow">Developer first</div>
            <h2 className="section-title" style={{color:"var(--paper)"}}>
              Integrate in<br />under 5 minutes.
            </h2>
            <p className="section-sub">
              Two lines of JS for the widget.
              A REST API for advanced flows.
              Webhooks for real-time delivery.
            </p>
            <a href="/docs" className="btn-primary">Read the docs →</a>
          </div>
          <div className="code-block">
            <div className="code-tabs">
              <button
                className={`code-tab ${activeTab === "html" ? "active" : ""}`}
                onClick={() => setActiveTab("html")}
              >HTML embed</button>
              <button
                className={`code-tab ${activeTab === "node" ? "active" : ""}`}
                onClick={() => setActiveTab("node")}
              >Node.js</button>
            </div>
            <div className="code-body">
              {activeTab === "html" ? (
              <pre dangerouslySetInnerHTML={{__html: `<span class="kw">&lt;script</span> src=<span class="str">"https://hearloop.shubh209.workers.dev/widget.js"</span><span class="kw">&gt;&lt;/script&gt;</span>
              <span class="kw">&lt;script&gt;</span>
                <span class="fn">Hearloop</span>.init({
                  <span class="str">apiKey</span>: <span class="str">"sk-live_your_key"</span>,
                  <span class="str">promptText</span>: <span class="str">"How was your service today?"</span>,
                  <span class="str">maxDurationSec</span>: <span class="str">5</span>,
                  <span class="str">position</span>: <span class="str">"bottom-right"</span>
                });
              <span class="kw">&lt;/script&gt;</span>`}} />
                ) : (
                  <pre dangerouslySetInnerHTML={{__html: `<span class="cm">// Create a feedback session</span>
                  <span class="kw">const</span> session = <span class="kw">await</span> <span class="fn">fetch</span>(<span class="str">"/v1/sessions"</span>, {
                    method: <span class="str">"POST"</span>,
                    headers: {
                      <span class="str">"Authorization"</span>: <span class="str">"Bearer sk-live_..."</span>,
                      <span class="str">"Content-Type"</span>: <span class="str">"application/json"</span>,
                    },        
                    body: <span class="fn">JSON.stringify</span>({
                    promptText: <span class="str">"How was your visit?"</span>,
                    maxDurationSec: <span class="str">5</span>,
                    }),
                  });
                });

                  <span class="cm">// Receive insights via webhook</span>
                  <span class="cm">// POST https://your-domain.com/webhook</span>
                  <span class="cm">// { transcript, sentiment, topics, urgency }</span>`}} />
                )}
            </div>    
            <div className="code-copy">
              <span className="copy-hint">paste before &lt;/body&gt;</span>
              <button className={`copy-btn ${copied ? "copied" : ""}`} onClick={copySnippet}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* INDUSTRIES */}
      <section className="industries" id="industries">
        <div className="section-eyebrow">Industries</div>
        <h2 className="section-title">Built for high-touch businesses.</h2>
        <p className="section-sub">Anywhere customers interact in person — Hearloop captures what they actually think.</p>
        <div className="industry-grid">
          {[
            { icon: "🚗", name: "Automotive service", desc: "Oil change wait times, staff ratings, service quality — per location." },
            { icon: "🏥", name: "Healthcare", desc: "Post-visit patient feedback. Hands-free, compliant, actionable." },
            { icon: "🍽️", name: "Hospitality", desc: "Food quality, staff, cleanliness. Real-time guest sentiment." },
            { icon: "🛍️", name: "Retail", desc: "Checkout experience, product help, staff interaction — at scale." },
          ].map((ind) => (
            <div key={ind.name} className="industry-card">
              <span className="industry-icon">{ind.icon}</span>
              <div className="industry-name">{ind.name}</div>
              <div className="industry-desc">{ind.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* PIPELINE */}
      <div className="pipeline">
        <div className="pipeline-inner">
          <div className="section-eyebrow">Under the hood</div>
          <h2 className="section-title">End-to-end AI pipeline.</h2>
          <div className="pipeline-flow">
            {[
              { icon: "🎙️", bg: "#E1F5EE", label: "Voice capture", sub: "MediaRecorder API" },
              { icon: "☁️", bg: "#E6F1FB", label: "S3 upload", sub: "Signed URL" },
              { icon: "⚡", bg: "#FFF5E6", label: "Groq Whisper", sub: "STT transcription" },
              { icon: "🧠", bg: "#F3F0FF", label: "Nova Lite", sub: "Classification" },
              { icon: "🔔", bg: "#FAEEDA", label: "Webhook", sub: "Your endpoint" },
            ].map((step, i, arr) => (
              <>
                <div key={step.label} className="pipeline-step">
                  <div className="pipeline-icon" style={{background: step.bg}}>
                    <span style={{fontSize:18}}>{step.icon}</span>
                  </div>
                  <div className="pipeline-label">{step.label}</div>
                  <div className="pipeline-sub">{step.sub}</div>
                </div>
                {i < arr.length - 1 && (
                  <div key={`arr-${i}`} className="pipeline-arrow">→</div>
                )}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* PRICING */}
      <section className="pricing" id="pricing">
        <div className="section-eyebrow">Pricing</div>
        <h2 className="section-title">Simple. Usage-based.</h2>
        <p className="section-sub" style={{margin: "0 auto 0"}}>
          Pay only for what you use. No seat fees. No platform tax.
        </p>
        <div className="pricing-cards">
          {[
            {
              plan: "Starter",
              price: "$0",
              period: "up to 500 sessions/mo",
              features: ["500 voice sessions", "Transcript + sentiment", "1 webhook endpoint", "JS widget", "Email support"],
              cta: "Start free",
              featured: false,
            },
            {
              plan: "Growth",
              price: "$49",
              period: "per month + usage",
              features: ["10,000 sessions included", "All analysis features", "5 webhook endpoints", "API access", "Priority support"],
              cta: "Get started",
              featured: true,
            },
            {
              plan: "Enterprise",
              price: "Custom",
              period: "volume pricing",
              features: ["Unlimited sessions", "SLA guarantee", "Custom taxonomy", "Dedicated support", "SSO + audit logs"],
              cta: "Contact us",
              featured: false,
            },
          ].map((p) => (
            <div key={p.plan} className={`pricing-card ${p.featured ? "featured" : ""}`}>
              <div className="pricing-plan">{p.plan}</div>
              <div className="pricing-price">{p.price}</div>
              <div className="pricing-period">{p.period}</div>
              <ul className="pricing-features">
                {p.features.map((f) => (
                  <li key={f}><span className="check">✓</span> {f}</li>
                ))}
              </ul>
              <a href="/dashboard" className="pricing-btn">{p.cta}</a>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div className="cta-section">
        <h2 className="cta-title">
          Stop losing feedback<br />to survey fatigue.
        </h2>
        <p className="cta-sub">
          Embed in 5 minutes. No backend work required.
        </p>
        <a href="/dashboard" className="btn-white">
          Get your API key free
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8H13M10 5L13 8L10 11" stroke="#1D9E75" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>
      </div>

      {/* FOOTER */}
      <footer>
        <a href="#" className="footer-logo">
          <div className="logo-drop">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M6 1C6 1 2.5 3.5 2.5 6.5C2.5 8.2 4.1 9.5 6 9.5C7.9 9.5 9.5 8.2 9.5 6.5C9.5 3.5 6 1 6 1Z" fill="white" opacity=".9"/>
            </svg>
          </div>
          Hearloop
        </a>
        <ul className="footer-links">
          <li><a href="/docs">Docs</a></li>
          <li><a href="/dashboard">Dashboard</a></li>
          <li><a href="https://github.com/shubh209/Hearloop">GitHub</a></li>
          <li><a href="#">Privacy</a></li>
        </ul>
        <div className="footer-copy">© 2026 Hearloop</div>
      </footer>
    </>
  );
}