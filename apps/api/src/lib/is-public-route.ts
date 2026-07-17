// hearloop/apps/api/src/lib/is-public-route.ts

// True for the widget-facing routes registered under publicRoutes (prefix
// "/v1" + "/public/*"). These are called from arbitrary partner websites and
// allow permissive/allowlisted CORS. Everything else is an authenticated
// dashboard route, which should never send a wildcard CORS header.
export function isPublicRoute(path: string): boolean {
  return path.startsWith("/v1/public/");
}
