import { isInsightsQueryEnabled } from "../insights-query-enabled";

describe("isInsightsQueryEnabled", () => {
  it("is false when unset", () => {
    expect(isInsightsQueryEnabled({})).toBe(false);
  });

  it("is false when not the string true", () => {
    expect(isInsightsQueryEnabled({ INSIGHTS_QUERY_ENABLED: "1" })).toBe(false);
    expect(isInsightsQueryEnabled({ INSIGHTS_QUERY_ENABLED: "TRUE" })).toBe(
      false
    );
  });

  it("is true only for the string true", () => {
    expect(
      isInsightsQueryEnabled({ INSIGHTS_QUERY_ENABLED: "true" })
    ).toBe(true);
  });
});
