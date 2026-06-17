// hearloop/apps/api/src/lib/partner-session.ts

import { createHmac, timingSafeEqual } from "crypto";

const SESSION_TTL_SEC = 60 * 60 * 24 * 30; // 30 days

function sessionSecret(): string {
  return (
    process.env.PARTNER_SESSION_SECRET ??
    (process.env.NODE_ENV === "production"
      ? ""
      : "hearloop-dev-partner-session-change-me")
  );
}

function b64urlEncode(data: string): string {
  return Buffer.from(data, "utf8")
    .toString("base64url")
    .replace(/=+$/, "");
}

function b64urlDecode(data: string): string {
  const pad = data.length % 4 === 0 ? "" : "=".repeat(4 - (data.length % 4));
  return Buffer.from(data + pad, "base64url").toString("utf8");
}

/** Issue a dashboard session token after email/password login. */
export function signPartnerSession(partnerId: string): string {
  const secret = sessionSecret();
  if (!secret) {
    throw new Error("PARTNER_SESSION_SECRET is required in production");
  }

  const payload = {
    sub: partnerId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };

  const body = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `hlps.${body}.${sig}`;
}

export function verifyPartnerSession(
  token: string
): { partnerId: string } | null {
  if (!token.startsWith("hlps.")) return null;

  const secret = sessionSecret();
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const body = parts[1];
  const sig = parts[2];
  const expected = createHmac("sha256", secret).update(body).digest("base64url");

  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  let payload: { sub?: string; exp?: number };
  try {
    payload = JSON.parse(b64urlDecode(body));
  } catch {
    return null;
  }

  if (!payload.sub || !payload.exp) return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return { partnerId: payload.sub };
}
