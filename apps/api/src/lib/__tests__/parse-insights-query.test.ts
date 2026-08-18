import {
  InsightsQueryParseError,
  isRangeTooWide,
  parseInsightsQuery,
} from "../parse-insights-query";

const from = "2026-01-01T00:00:00.000Z";
const to = "2026-01-08T00:00:00.000Z";

describe("parseInsightsQuery", () => {
  it("parses a count body", () => {
    const parsed = parseInsightsQuery({
      intent: "count",
      filters: {
        from,
        to,
        sentiment: "negative",
        targetKey: "north-ave",
      },
    });
    expect(parsed.intent).toBe("count");
    expect(parsed.filters.sentiment).toBe("negative");
    expect(parsed.filters.targetKey).toBe("north-ave");
    expect(parsed.filters.from.toISOString()).toBe(from);
    expect(parsed.filters.to.toISOString()).toBe(to);
  });

  it("rejects unknown filter keys", () => {
    expect(() =>
      parseInsightsQuery({
        intent: "count",
        filters: { from, to, partnerId: "sneak" },
      })
    ).toThrow(InsightsQueryParseError);
  });

  it("rejects count without from/to", () => {
    expect(() =>
      parseInsightsQuery({ intent: "count", filters: {} })
    ).toThrow(InsightsQueryParseError);
  });

  it("parses list without from/to so the route can refuse", () => {
    const parsed = parseInsightsQuery({ intent: "list", filters: {} });
    expect(parsed.intent).toBe("list");
  });

  it("parses unknown intent strings for unsupported_intent", () => {
    expect(parseInsightsQuery({ intent: "recommend", filters: {} }).intent).toBe(
      "recommend"
    );
  });
});

describe("isRangeTooWide", () => {
  it("is true when end is not after start", () => {
    const t = new Date("2026-01-01T00:00:00.000Z");
    expect(isRangeTooWide(t, t)).toBe(true);
  });

  it("is true when the window is longer than 90 days", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-04-02T00:00:00.000Z");
    expect(isRangeTooWide(start, end)).toBe(true);
  });

  it("is false for a 7-day window", () => {
    expect(
      isRangeTooWide(new Date(from), new Date(to))
    ).toBe(false);
  });
});
