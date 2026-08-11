import {
  PartnerSettingsValidationError,
  validatePartnerSettingsInput,
} from "../partner-settings";

describe("validatePartnerSettingsInput", () => {
  it("accepts a public webhook, website, and comma-separated origins", () => {
    expect(
      validatePartnerSettingsInput({
        webhookUrl: " https://hooks.example.com/hearloop ",
        websiteUrl: "https://www.jiffylube.com/",
        allowedOrigins: " https://a.example.com, https://b.example.com ",
        businessContext: "  Oil changes  ",
        businessContextSource: "manual",
      })
    ).toEqual({
      webhookUrl: "https://hooks.example.com/hearloop",
      websiteUrl: "https://www.jiffylube.com/",
      allowedOrigins: "https://a.example.com,https://b.example.com",
      businessContext: "Oil changes",
      businessContextSource: "manual",
    });
  });

  it.each([
    ["webhookUrl", { webhookUrl: "https://127.0.0.1/hook" }],
    ["webhookUrl metadata", { webhookUrl: "https://169.254.169.254/latest" }],
    ["websiteUrl", { websiteUrl: "https://10.0.0.1/" }],
  ])("rejects a private %s with ssrf_blocked", (_case, input) => {
    expect(() => validatePartnerSettingsInput(input)).toThrow(
      PartnerSettingsValidationError
    );
    try {
      validatePartnerSettingsInput(input);
    } catch (err) {
      expect(err).toBeInstanceOf(PartnerSettingsValidationError);
      expect((err as PartnerSettingsValidationError).error).toBe("ssrf_blocked");
    }
  });

  it("rejects http webhook URLs", () => {
    expect(() =>
      validatePartnerSettingsInput({ webhookUrl: "http://example.com/hook" })
    ).toThrow(/only HTTPS/);
  });

  it("rejects a malformed origin and keeps comma-separated storage format", () => {
    expect(() =>
      validatePartnerSettingsInput({ allowedOrigins: "https://ok.example,not-an-origin" })
    ).toThrow(/invalid origin: "not-an-origin"/);
  });

  it("clears optional URL fields when blank", () => {
    expect(
      validatePartnerSettingsInput({
        webhookUrl: null,
        websiteUrl: "  ",
        allowedOrigins: null,
        businessContext: null,
      })
    ).toEqual({
      webhookUrl: null,
      websiteUrl: null,
      allowedOrigins: null,
      businessContext: null,
    });
  });

  it("ignores fields that were not sent", () => {
    expect(validatePartnerSettingsInput({ businessContext: "Shop" })).toEqual({
      businessContext: "Shop",
    });
  });
});
