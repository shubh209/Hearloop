// hearloop/apps/web/lib/server-api-base.ts
//
// Base URL for server-component fetches to the Hearloop API via the Next.js proxy.
// Avoids relying on NEXT_PUBLIC_API_URL (often mis-set to /api/v1 on Vercel).

export function serverApiBase(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api`;
  }
  const port = process.env.PORT ?? "3000";
  return `http://localhost:${port}/api`;
}
