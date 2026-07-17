// hearloop/apps/api/src/lib/__tests__/is-public-route.test.ts
//
// isPublicRoute decides whether a request path belongs to the widget-facing
// public routes (which legitimately need a permissive/allowlisted CORS
// response) vs. authenticated/dashboard routes (which should never send a
// wildcard CORS header — see ticket 006).

import { isPublicRoute } from "../is-public-route";

describe("isPublicRoute", () => {
  it("returns true for widget-facing /v1/public/* paths", () => {
    expect(isPublicRoute("/v1/public/session/abc123/finalize")).toBe(true);
  });

  it("returns false for authenticated dashboard paths like /v1/partners/me/dashboard", () => {
    expect(isPublicRoute("/v1/partners/me/dashboard")).toBe(false);
  });
});
