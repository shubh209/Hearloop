"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BusinessContextField } from "../../components/BusinessContextField";

const AUTOMOTIVE_TEMPLATE =
  "Quick-service automotive shop. Common visits: oil change, tire rotation, brake service. " +
  "Walk-in and appointment customers. Visits usually 45–90 minutes. " +
  "We care about wait time, pricing vs quote, staff attitude, and bay cleanliness.";

export default function OnboardingPage() {
  const router = useRouter();
  const [businessContext, setBusinessContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const saveContext = async (
    context: string | null,
    source: "manual" | "template" = "manual"
  ) => {
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/partners/me/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessContext: context,
          businessContextSource: context ? source : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? data.message ?? "Failed to save");
        setLoading(false);
        return;
      }
      router.push("/dashboard?nav=embed");
    } catch {
      setError("Network error");
      setLoading(false);
    }
  };

  const useTemplate = () => {
    setBusinessContext(AUTOMOTIVE_TEMPLATE);
    void saveContext(AUTOMOTIVE_TEMPLATE, "template");
  };

  return (
    <>
      <style>{`
        body { background: var(--paper); min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
        .card { max-width: 520px; width: 100%; background: white; border: 0.5px solid var(--paper-3); border-radius: 12px; padding: 28px; }
        h1 { font-family: var(--font-display); font-size: 22px; margin-bottom: 8px; }
        p { font-size: 13px; color: var(--ink-3); line-height: 1.5; margin-bottom: 20px; }
        .actions { display: flex; gap: 10px; margin-top: 16px; flex-wrap: wrap; }
        .btn { padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; border: none; }
        .btn-primary { background: var(--green); color: white; }
        .btn-ghost { background: var(--paper-2); color: var(--ink-2); }
        .err { color: var(--red); font-size: 12px; margin-top: 8px; }
      `}</style>
      <div className="card">
        <h1>Tell us about your business</h1>
        <p>
          Optional. Describe your business or use the starter template. This
          helps Hearloop label topics and sentiment correctly.
        </p>

        <BusinessContextField
          value={businessContext}
          onChange={setBusinessContext}
        />

        <div className="actions">
          <button
            className="btn btn-primary"
            disabled={loading || !businessContext.trim()}
            onClick={() => saveContext(businessContext.trim())}
          >
            Save & continue
          </button>
          <button
            className="btn btn-ghost"
            disabled={loading}
            onClick={useTemplate}
          >
            Use automotive template
          </button>
          <button
            className="btn btn-ghost"
            disabled={loading}
            onClick={() => router.push("/dashboard?nav=embed")}
          >
            Skip for now
          </button>
        </div>
        {error && <div className="err">{error}</div>}
      </div>
    </>
  );
}
