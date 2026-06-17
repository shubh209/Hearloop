"use client";

import { useEffect, useRef, useState } from "react";

export type BusinessContextSource =
  | "manual"
  | "template"
  | "import"
  | "import_edited";

type ImportStatus = "idle" | "importing" | "success" | "error";

const POLL_MS = 2000;
const MAX_POLLS = 45;

type Props = {
  websiteUrl: string;
  onWebsiteUrlChange: (url: string) => void;
  businessContext: string;
  onBusinessContextChange: (text: string) => void;
  onSourceChange: (source: BusinessContextSource) => void;
  importDraftRef: React.MutableRefObject<string | null>;
};

export function BusinessContextImportBlock({
  websiteUrl,
  onWebsiteUrlChange,
  businessContext,
  onBusinessContextChange,
  onSourceChange,
  importDraftRef,
}: Props) {
  const [importStatus, setImportStatus] = useState<ImportStatus>("idle");
  const [importMessage, setImportMessage] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const friendlyError = (code?: string) => {
    switch (code) {
      case "ssrf_blocked":
        return "That URL cannot be imported. Use your public HTTPS homepage.";
      case "timeout":
        return "The site took too long to respond. Try again or describe your business manually.";
      case "scrape_empty":
        return "We could not read useful text from that page. Try your homepage or enter text manually.";
      case "rate_limited":
        return "Import limit reached (3 per hour). Try again later or type your description.";
      case "import_in_progress":
        return "An import is already running. Wait for it to finish.";
      default:
        return "Import failed. You can still type your business description below.";
    }
  };

  const pollImport = (importId: string) => {
    let polls = 0;
    stopPolling();

    pollRef.current = setInterval(async () => {
      polls += 1;
      if (polls > MAX_POLLS) {
        stopPolling();
        setImportStatus("error");
        setImportMessage("Import timed out. Try again or describe your business manually.");
        return;
      }

      try {
        const res = await fetch(
          `/api/partners/me/business-context/import/${importId}`
        );
        const data = await res.json();

        if (!res.ok) {
          stopPolling();
          setImportStatus("error");
          setImportMessage(friendlyError(data.error));
          return;
        }

        if (data.status === "pending") return;

        stopPolling();

        if (data.status === "completed" && data.draftContext) {
          onBusinessContextChange(data.draftContext);
          importDraftRef.current = data.draftContext;
          onSourceChange("import");
          if (data.websiteUrl) onWebsiteUrlChange(data.websiteUrl);
          setImportStatus("success");
          setImportMessage("Draft imported — review and save when ready.");
          return;
        }

        setImportStatus("error");
        setImportMessage(friendlyError(data.errorCode));
      } catch {
        stopPolling();
        setImportStatus("error");
        setImportMessage("Network error while checking import status.");
      }
    }, POLL_MS);
  };

  const startImport = async () => {
    const url = websiteUrl.trim();
    if (!url) {
      setImportMessage("Enter your website URL first.");
      setImportStatus("error");
      return;
    }

    setImportStatus("importing");
    setImportMessage("Reading your website… usually 10–20 seconds.");

    try {
      const res = await fetch("/api/partners/me/business-context/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ websiteUrl: url }),
      });
      const data = await res.json();

      if (!res.ok) {
        setImportStatus("error");
        setImportMessage(friendlyError(data.error));
        return;
      }

      pollImport(data.importId);
    } catch {
      setImportStatus("error");
      setImportMessage("Network error. Try again or type your description.");
    }
  };

  const handleContextChange = (text: string) => {
    onBusinessContextChange(text);
    if (importDraftRef.current && text.trim() !== importDraftRef.current.trim()) {
      onSourceChange("import_edited");
    } else if (importDraftRef.current && text.trim() === importDraftRef.current.trim()) {
      onSourceChange("import");
    }
  };

  return (
    <>
      <label style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)" }}>
        Website (optional)
      </label>
      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 6,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <input
          style={{
            flex: "1 1 200px",
            padding: "10px 12px",
            borderRadius: 8,
            border: "0.5px solid var(--paper-3)",
            fontSize: 13,
          }}
          placeholder="https://your-business.com"
          value={websiteUrl}
          onChange={(e) => onWebsiteUrlChange(e.target.value)}
          disabled={importStatus === "importing"}
        />
        <button
          type="button"
          className="btn-ghost"
          style={{
            padding: "10px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
            cursor: importStatus === "importing" ? "wait" : "pointer",
            border: "none",
            background: "var(--paper-2)",
            color: "var(--ink-2)",
          }}
          disabled={importStatus === "importing"}
          onClick={startImport}
        >
          {importStatus === "importing" ? "Importing…" : "Import"}
        </button>
      </div>

      {importMessage && (
        <p
          style={{
            fontSize: 12,
            color: importStatus === "error" ? "var(--red)" : "var(--ink-3)",
            marginBottom: 12,
            lineHeight: 1.4,
          }}
        >
          {importMessage}
        </p>
      )}

      <label style={{ fontSize: 11, fontWeight: 500, color: "var(--ink-3)" }}>
        Business description
      </label>
      <textarea
        style={{
          width: "100%",
          marginTop: 6,
          minHeight: 120,
          padding: "10px 12px",
          borderRadius: 8,
          border: "0.5px solid var(--paper-3)",
          fontSize: 13,
          resize: "vertical",
        }}
        placeholder="What does your business do? What do customers usually visit for?"
        value={businessContext}
        onChange={(e) => handleContextChange(e.target.value)}
      />
    </>
  );
}

export function resolveBusinessContextSource(
  context: string,
  importDraft: string | null,
  explicitSource: BusinessContextSource
): BusinessContextSource {
  if (explicitSource === "template") return "template";
  if (importDraft && context.trim() !== importDraft.trim()) return "import_edited";
  if (importDraft && context.trim() === importDraft.trim()) return "import";
  return explicitSource === "import_edited" ? "import_edited" : "manual";
}
