import { signPartnerSession, verifyPartnerSession } from "../partner-session";

describe("partner-session", () => {
  const prev = process.env.PARTNER_SESSION_SECRET;
  beforeAll(() => {
    process.env.PARTNER_SESSION_SECRET = "test-secret";
  });
  afterAll(() => {
    process.env.PARTNER_SESSION_SECRET = prev;
  });

  it("round-trips partner id", () => {
    const token = signPartnerSession("partner-uuid-1");
    expect(token.startsWith("hlps.")).toBe(true);
    expect(verifyPartnerSession(token)).toEqual({ partnerId: "partner-uuid-1" });
  });

  it("rejects tampered token", () => {
    const token = signPartnerSession("partner-uuid-1");
    expect(verifyPartnerSession(token + "x")).toBeNull();
  });
});
