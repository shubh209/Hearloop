import { GOLDEN_SET } from "../golden-set";

it("covers the six eval categories with 3+ injection phrasings", () => {
  const categories = new Set(GOLDEN_SET.map((c) => c.category));
  expect(categories).toEqual(
    new Set([
      "positive",
      "negative_urgent",
      "neutral",
      "off_topic",
      "too_short",
      "injection",
    ])
  );
  expect(GOLDEN_SET.filter((c) => c.category === "injection").length).toBeGreaterThanOrEqual(3);
  expect(GOLDEN_SET.length).toBeGreaterThanOrEqual(20);
  expect(GOLDEN_SET.every((c) => c.id && c.transcript !== undefined)).toBe(true);
});
