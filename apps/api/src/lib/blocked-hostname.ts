// hearloop/apps/api/src/lib/blocked-hostname.ts
//
// Hostname / IP literals that must never be fetched or webhook-targeted (SSRF guard).

const BLOCKED_HOSTNAME_RE = /^(localhost|.*\.local)$/i;

const BLOCKED_IP_RE = new RegExp(
  [
    "^127\\.", // 127.0.0.0/8 loopback
    "^10\\.", // 10.0.0.0/8
    "^192\\.168\\.", // 192.168.0.0/16
    "^172\\.(1[6-9]|2[0-9]|3[01])\\.", // 172.16.0.0/12
    "^169\\.254\\.", // 169.254.0.0/16 link-local (AWS metadata)
    "^0\\.", // 0.0.0.0/8
    "^::1$", // IPv6 loopback
    "^fc", // IPv6 unique local fc00::/7
    "^fd",
  ].join("|")
);

/** True when the hostname must not receive outbound fetches or webhooks. */
export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return BLOCKED_HOSTNAME_RE.test(host) || BLOCKED_IP_RE.test(host);
}
