// hearloop/apps/api/src/jobs/import-business-context.ts

import { jobLogger } from "../lib/logger";
import { assertPublicHttpsUrl, SsrfBlockedError } from "../lib/assert-public-https-url";
import {
  scrapeWebsiteHttp,
  truncateMarkdownForSummary,
  ScrapeError,
} from "../lib/scrape-via-crawl4ai";
import {
  summarizeBusinessContext,
  SummarizeError,
} from "../lib/summarize-business-context";
import type { ImportJobResult } from "../lib/import-job-status";

const log = jobLogger("import-business-context");

export async function runImportBusinessContextJob(data: {
  partnerId: string;
  websiteUrl: string;
}): Promise<ImportJobResult> {
  const { partnerId, websiteUrl } = data;

  log.info({ partnerId, websiteUrl }, "import job started");

  try {
    assertPublicHttpsUrl(websiteUrl);
    const scraped = await scrapeWebsiteHttp(websiteUrl);
    const markdown = truncateMarkdownForSummary(scraped.markdown);
    const summary = await summarizeBusinessContext(markdown, scraped.title);

    log.info(
      {
        partnerId,
        websiteUrl,
        modelUsed: summary.modelUsed,
        inputTokens: summary.inputTokens,
        outputTokens: summary.outputTokens,
      },
      "import job completed"
    );

    return {
      status: "completed",
      websiteUrl,
      draftContext: summary.draftContext,
    };
  } catch (err: unknown) {
    const errorCode = mapImportError(err);
    log.warn({ partnerId, websiteUrl, errorCode }, "import job failed");
    return {
      status: "failed",
      websiteUrl,
      errorCode,
    };
  }
}

function mapImportError(err: unknown): string {
  if (err instanceof SsrfBlockedError) return "ssrf_blocked";
  if (err instanceof ScrapeError) return err.code;
  if (err instanceof SummarizeError) return err.code;
  return "scrape_error";
}
