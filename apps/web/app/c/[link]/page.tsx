// hearloop/apps/web/app/c/[link]/page.tsx
//
// Public entry point for a durable capture link (the target of a printed QR code
// or SMS link). It mints a fresh session from the link token, then forwards the
// customer to the existing hosted capture page. The link itself is reusable; each
// scan produces a new session attributed to the link's Target.

import { redirect } from "next/navigation";
import { serverApiBase } from "../../../lib/server-api-base";

interface CaptureLinkPageProps {
  params: Promise<{ link: string }>;
}

async function mintSession(linkToken: string): Promise<{ sessionToken: string } | null> {
  try {
    const res = await fetch(
      `${await serverApiBase()}/public/capture/${linkToken}/session`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export default async function CaptureLinkPage({ params }: CaptureLinkPageProps) {
  const { link } = await params;
  const session = await mintSession(link);

  if (!session?.sessionToken) {
    return <InvalidScreen />;
  }

  // redirect() must run outside try/catch — it signals via a thrown control-flow error.
  redirect(`/capture/${session.sessionToken}`);
}

function InvalidScreen() {
  return (
    <>
      <style>{`
        html, body { height: 100%; margin: 0; font-family: 'DM Sans', sans-serif; background: #F7F4EE; color: #0E0E0E; }
        .page { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .card { background: #fff; border: 0.5px solid #E0DDD4; border-radius: 20px; padding: 48px 32px; max-width: 340px; width: 100%; text-align: center; box-shadow: 0 4px 40px rgba(0,0,0,0.06); }
        .icon { width: 56px; height: 56px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 22px; background: #FCEBEB; }
        .title { font-family: 'Instrument Serif', serif; font-size: 22px; margin-bottom: 8px; }
        .sub { font-size: 13px; color: #999; line-height: 1.5; }
      `}</style>
      <div className="page">
        <div className="card">
          <div className="icon">✕</div>
          <div className="title">Link unavailable.</div>
          <div className="sub">
            This feedback link is no longer active. Please ask for a new one.
          </div>
        </div>
      </div>
    </>
  );
}
