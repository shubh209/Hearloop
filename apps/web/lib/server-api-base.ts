// hearloop/apps/web/lib/server-api-base.ts
//
// Base URL for server-component fetches to the Hearloop API via the Next.js proxy.
// Uses the incoming request host so it works on hearloop.vercel.app and preview URLs.

import { headers } from "next/headers";

export async function serverApiBase(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) {
    const proto = host.startsWith("localhost") ? "http" : "https";
    return `${proto}://${host}/api`;
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api`;
  }

  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}/api`;
}
