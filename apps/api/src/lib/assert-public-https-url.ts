// hearloop/apps/api/src/lib/assert-public-https-url.ts
//
// SSRF guard for partner-supplied HTTPS URLs (business-context import, webhooks).
// Sync hostname checks only — DNS rebinding is validated at fetch time in the scraper.

import { isBlockedHostname } from "./blocked-hostname";

export const SSRF_BLOCKED_PREFIX = "SSRF_BLOCKED:";

export class SsrfBlockedError extends Error {
  readonly code = "ssrf_blocked";

  constructor(message: string) {
    super(message);
    this.name = "SsrfBlockedError";
  }
}

function reject(reason: string): never {
  throw new SsrfBlockedError(`${SSRF_BLOCKED_PREFIX} ${reason}`);
}

/**
 * Validates a partner-supplied URL is a public HTTPS origin safe to fetch.
 * Returns the parsed URL on success.
 */
export function assertPublicHttpsUrl(rawUrl: string): URL {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    reject("URL is required");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    reject(`invalid URL — ${rawUrl}`);
  }

  if (parsed.protocol !== "https:") {
    reject(`only HTTPS URLs are allowed (got ${parsed.protocol})`);
  }

  if (parsed.username || parsed.password) {
    reject("URLs with embedded credentials are not allowed");
  }

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    reject("hostname is required");
  }

  if (isBlockedHostname(hostname)) {
    reject(`URL targets a private or reserved address — ${hostname}`);
  }

  return parsed;
}
