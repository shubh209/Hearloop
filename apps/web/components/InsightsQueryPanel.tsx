"use client";

import { FormEvent, useEffect, useState } from "react";

type SentimentFilter = "any" | "positive" | "neutral" | "negative";

type InsightsQueryResponse = {
  summary?: string;
  totalCount?: number;
  evidenceResultsUrl?: string;
  refusal?: { message: string };
  error?: string;
  message?: string;
};

function toUtcIso(datetimeLocal: string): string {
  return new Date(datetimeLocal).toISOString();
}

function defaultFromLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function defaultToLocal(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function InsightsQueryPanel() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [sentiment, setSentiment] = useState<SentimentFilter>("any");
  const [targetKey, setTargetKey] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<InsightsQueryResponse | null>(null);

  useEffect(() => {
    fetch("/api/partners/me")
      .then((r) => r.json())
      .then((data) => {
        setEnabled(data.insightsQueryEnabled === true);
      })
      .catch(() => setEnabled(false));

    setFrom(defaultFromLocal());
    setTo(defaultToLocal());
  }, []);

  if (enabled !== true) {
    return null;
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setResult(null);

    const filters: Record<string, string> = {
      from: toUtcIso(from),
      to: toUtcIso(to),
    };
    if (sentiment !== "any") {
      filters.sentiment = sentiment;
    }
    const trimmedKey = targetKey.trim();
    if (trimmedKey) {
      filters.targetKey = trimmedKey;
    }

    try {
      const res = await fetch("/api/partners/me/insights-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent: "count", filters }),
      });
      const data: InsightsQueryResponse = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(data.message ?? data.error ?? "Query failed");
        return;
      }

      setResult(data);
    } catch {
      setError("Query failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card">
      <div className="ch">
        <div className="ct">Insights query (demo)</div>
      </div>

      <form onSubmit={submit}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 12,
            marginBottom: 14,
          }}
        >
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Intent</span>
            <span
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "0.5px solid var(--paper-3)",
                fontSize: 13,
                background: "var(--paper-2)",
                color: "var(--ink-2)",
              }}
            >
              Count
            </span>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Sentiment</span>
            <select
              className="sel"
              value={sentiment}
              onChange={(e) => setSentiment(e.target.value as SentimentFilter)}
              style={{ padding: "6px 8px", fontSize: 13 }}
            >
              <option value="any">Any</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>Target key</span>
            <input
              type="text"
              value={targetKey}
              onChange={(e) => setTargetKey(e.target.value)}
              placeholder="Optional"
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "0.5px solid var(--paper-3)",
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>From</span>
            <input
              type="datetime-local"
              required
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "0.5px solid var(--paper-3)",
                fontSize: 13,
              }}
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-3)" }}>To</span>
            <input
              type="datetime-local"
              required
              value={to}
              onChange={(e) => setTo(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "0.5px solid var(--paper-3)",
                fontSize: 13,
              }}
            />
          </label>
        </div>

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Running…" : "Run count query"}
        </button>
      </form>

      {error && (
        <p style={{ color: "var(--red)", fontSize: 12, marginTop: 14 }}>{error}</p>
      )}

      {result && (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            borderRadius: 8,
            background: "var(--paper-2)",
            border: "0.5px solid var(--paper-3)",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        >
          {result.refusal ? (
            <p style={{ color: "var(--amber)", margin: 0 }}>{result.refusal.message}</p>
          ) : (
            <>
              {result.summary && (
                <p style={{ margin: "0 0 8px", color: "var(--ink)" }}>{result.summary}</p>
              )}
              {typeof result.totalCount === "number" && (
                <p style={{ margin: "0 0 8px", color: "var(--ink-2)" }}>
                  Total count: <strong>{result.totalCount}</strong>
                </p>
              )}
              {result.evidenceResultsUrl && (
                <p style={{ margin: 0, color: "var(--ink-3)", fontSize: 12 }}>
                  <a href={result.evidenceResultsUrl} style={{ color: "var(--blue)" }}>
                    {result.evidenceResultsUrl}
                  </a>
                  {" · "}
                  Evidence list not built yet.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
