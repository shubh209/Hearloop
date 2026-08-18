import { insightsQueryStubEvidenceUrl } from "../insights-query-stub-evidence-url";

describe("insightsQueryStubEvidenceUrl", () => {
  it("returns the locked stub path", () => {
    expect(insightsQueryStubEvidenceUrl()).toBe(
      "/api/partners/me/insights-query/evidence"
    );
  });
});
