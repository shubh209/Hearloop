const whereCalls: Array<[string, string, unknown]> = [];

const mockQuery: any = {
  leftJoin: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  where: jest.fn((col: string, op: string, val: unknown) => {
    whereCalls.push([String(col), op, val]);
    return mockQuery;
  }),
  executeTakeFirst: jest.fn().mockResolvedValue({ count: "0" }),
};

jest.mock("../db", () => ({
  db: {
    selectFrom: jest.fn(() => mockQuery),
  },
}));

import { countInsightsSessions } from "../count-insights-sessions";

describe("countInsightsSessions", () => {
  beforeEach(() => {
    whereCalls.length = 0;
    jest.clearAllMocks();
  });

  it("scopes to the requesting Partner and corpus", async () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const to = new Date("2026-01-08T00:00:00.000Z");
    const n = await countInsightsSessions("partner-a", { from, to });
    expect(n).toBe(0);
    expect(whereCalls).toEqual(
      expect.arrayContaining([
        ["sessions.partner_id", "=", "partner-a"],
        ["sessions.status", "=", "completed"],
        ["sessions.upload_protocol", "=", "versioned-v1"],
      ])
    );
    expect(whereCalls.some((c) => c[2] === "partner-b")).toBe(false);
  });
});
