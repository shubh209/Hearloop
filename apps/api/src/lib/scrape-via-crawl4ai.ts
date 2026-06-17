// hearloop/apps/api/src/lib/scrape-via-crawl4ai.ts
//
// HTTP client for the internal Crawl4AI sidecar (business-context import).

const SCRAPER_URL =
  process.env.SCRAPER_URL ?? "http://127.0.0.1:11235";

const SCRAPE_TIMEOUT_MS = Number(process.env.SCRAPE_TIMEOUT_MS ?? 25_000);

export interface ScrapePageResult {
  markdown: string;
  title: string | null;
  bytes: number;
  statusCode: number | null;
}

export class ScrapeError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "ScrapeError";
  }
}

export async function scrapeWebsiteHttp(
  websiteUrl: string
): Promise<ScrapePageResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

  try {
    const res = await fetch(`${SCRAPER_URL}/crawl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: websiteUrl,
        mode: "http",
        timeoutMs: SCRAPE_TIMEOUT_MS,
      }),
      signal: controller.signal,
    });

    const data = (await res.json().catch(() => ({}))) as {
      markdown?: string;
      title?: string | null;
      bytes?: number;
      statusCode?: number | null;
      detail?: string;
    };

    if (!res.ok) {
      const code = mapScraperDetail(data.detail, res.status);
      throw new ScrapeError(code, data.detail ?? `scraper HTTP ${res.status}`);
    }

    if (!data.markdown?.trim()) {
      throw new ScrapeError("scrape_empty", "empty markdown from scraper");
    }

    return {
      markdown: data.markdown,
      title: data.title ?? null,
      bytes: data.bytes ?? 0,
      statusCode: data.statusCode ?? null,
    };
  } catch (err: any) {
    if (err instanceof ScrapeError) throw err;
    if (err?.name === "AbortError") {
      throw new ScrapeError("timeout", "scraper request timed out");
    }
    throw new ScrapeError(
      "scrape_error",
      err?.message ?? "scraper request failed"
    );
  } finally {
    clearTimeout(timer);
  }
}

function mapScraperDetail(detail: string | undefined, status: number): string {
  if (detail === "scrape_empty") return "scrape_empty";
  if (detail === "blocked_host" || detail === "blocked_resolved_ip") {
    return "ssrf_blocked";
  }
  if (status === 408 || detail === "timeout") return "timeout";
  return "scrape_error";
}

/** Truncate markdown before Bedrock to control token cost. */
export function truncateMarkdownForSummary(markdown: string): string {
  const max = Number(process.env.IMPORT_MARKDOWN_MAX_CHARS ?? 8_000);
  const trimmed = markdown.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}\n\n[truncated]`;
}
