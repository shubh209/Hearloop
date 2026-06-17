// hearloop/apps/api/src/lib/__tests__/assert-public-https-url.test.ts

import {
  assertPublicHttpsUrl,
  SsrfBlockedError,
} from "../assert-public-https-url";

describe("assertPublicHttpsUrl", () => {
  it("allows a normal public HTTPS URL", () => {
    const url = assertPublicHttpsUrl("https://www.jiffylube.com/");
    expect(url.hostname).toBe("www.jiffylube.com");
    expect(url.protocol).toBe("https:");
  });

  it("trims surrounding whitespace", () => {
    const url = assertPublicHttpsUrl("  https://example.com/path  ");
    expect(url.href).toBe("https://example.com/path");
  });

  it("rejects empty input", () => {
    expect(() => assertPublicHttpsUrl("")).toThrow(SsrfBlockedError);
  });

  it("rejects invalid URLs", () => {
    expect(() => assertPublicHttpsUrl("not-a-url")).toThrow(SsrfBlockedError);
  });

  it("rejects http://", () => {
    expect(() => assertPublicHttpsUrl("http://example.com")).toThrow(
      /only HTTPS URLs are allowed/
    );
  });

  it("rejects embedded credentials", () => {
    expect(() =>
      assertPublicHttpsUrl("https://user:pass@example.com")
    ).toThrow(/credentials/);
  });

  it.each([
    "https://localhost/",
    "https://app.local/",
    "https://127.0.0.1/",
    "https://10.0.0.1/",
    "https://192.168.1.1/",
    "https://172.16.0.1/",
    "https://169.254.169.254/",
    "https://0.0.0.0/",
    "https://[::1]/",
  ])("blocks private/reserved host %s", (blocked) => {
    expect(() => assertPublicHttpsUrl(blocked)).toThrow(SsrfBlockedError);
    expect(() => assertPublicHttpsUrl(blocked)).toThrow(/private or reserved/);
  });

  it("exposes ssrf_blocked code on SsrfBlockedError", () => {
    try {
      assertPublicHttpsUrl("http://example.com");
    } catch (err) {
      expect(err).toBeInstanceOf(SsrfBlockedError);
      expect((err as SsrfBlockedError).code).toBe("ssrf_blocked");
      return;
    }
    throw new Error("expected throw");
  });
});
