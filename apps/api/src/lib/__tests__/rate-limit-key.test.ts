// hearloop/apps/api/src/lib/__tests__/rate-limit-key.test.ts

import { signPartnerSession } from "../partner-session";
import { rateLimitKey } from "../rate-limit-key";

function reqWithAuth(authHeader: string | undefined, ip = "1.2.3.4") {
  return {
    headers: { authorization: authHeader },
    ip,
  } as any;
}

describe("rateLimitKey", () => {
  const prev = process.env.PARTNER_SESSION_SECRET;
  beforeAll(() => {
    process.env.PARTNER_SESSION_SECRET = "test-secret";
  });
  afterAll(() => {
    process.env.PARTNER_SESSION_SECRET = prev;
  });

  it("gives two different partner-session tokens different keys", () => {
    const tokenA = signPartnerSession("partner-uuid-aaaa");
    const tokenB = signPartnerSession("partner-uuid-bbbb");

    // Guard against the bug this test exists to catch: both tokens share
    // the same 16-char prefix (`hlps.eyJzdWIiOi`) because the JSON shape
    // before the partner id is identical.
    expect(tokenA.slice(0, 16)).toBe(tokenB.slice(0, 16));

    const keyA = rateLimitKey(reqWithAuth(`Bearer ${tokenA}`));
    const keyB = rateLimitKey(reqWithAuth(`Bearer ${tokenB}`));
    expect(keyA).not.toBe(keyB);
  });

  it("gives the same token the same key on repeat calls", () => {
    const token = signPartnerSession("partner-uuid-stable");
    const req = reqWithAuth(`Bearer ${token}`);
    expect(rateLimitKey(req)).toBe(rateLimitKey(req));
  });

  it("falls back to req.ip when there is no bearer token", () => {
    expect(rateLimitKey(reqWithAuth(undefined, "9.9.9.9"))).toBe("9.9.9.9");
  });

  it("gives two different secret keys different keys", () => {
    const keyA = rateLimitKey(
      reqWithAuth("Bearer sk-live_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
    );
    const keyB = rateLimitKey(
      reqWithAuth("Bearer sk-live_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
    );
    expect(keyA).not.toBe(keyB);
  });
});
