// hearloop/apps/api/src/lib/rate-limit-key.ts

import { createHash } from "crypto";

/** Derive a stable, per-credential rate-limit bucket key from a request. */
export function rateLimitKey(req: { headers: Record<string, unknown>; ip: string }): string {
  const auth = (req.headers["authorization"] as string) ?? "";
  const token = auth.replace("Bearer ", "");
  if (!token) return req.ip;
  return createHash("sha256").update(token).digest("hex");
}
