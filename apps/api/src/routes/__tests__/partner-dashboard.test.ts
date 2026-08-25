const sessionRows: Array<Record<string, unknown>> = [];

function selectSessions() {
  let partnerId: string | null = null;
  let orderedByCreatedAt = false;
  let limit: number | null = null;
  const query = {
    leftJoin: () => query,
    select: () => query,
    where(column: string, operator: string, value: string) {
      if (column === "sessions.partner_id" && operator === "=") partnerId = value;
      return query;
    },
    orderBy(column: string, direction: string) {
      if (column === "sessions.created_at" && direction === "desc") {
        orderedByCreatedAt = true;
      }
      return query;
    },
    limit(value: number) {
      limit = value;
      return query;
    },
    execute: async () => {
      let rows = sessionRows.filter((row) => row.partner_id === partnerId);
      if (orderedByCreatedAt) {
        rows = [...rows].sort(
          (a, b) =>
            new Date(b.created_at as Date).getTime() -
            new Date(a.created_at as Date).getTime()
        );
      }
      return limit === null ? rows : rows.slice(0, limit);
    },
  };
  return query;
}

const mockDb = {
  selectFrom: jest.fn().mockImplementation(selectSessions),
};

jest.mock("../../lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

import { buildDashboardPayload } from "../partner-dashboard";

describe("Partner dashboard Target mapping", () => {
  beforeEach(() => {
    sessionRows.splice(0);
    mockDb.selectFrom.mockClear();
  });

  it("returns a Capture-link Target only on the owning Partner's Session", async () => {
    const target = {
      label: "North Ave — Oil Change",
      key: "north-ave-oil-change",
      source: "capture-link",
    };
    const common = {
      status: "created",
      external_event_id: null,
      created_at: new Date("2026-08-24T12:00:00.000Z"),
      processing_started_at: null,
      processing_completed_at: null,
      transcript: null,
      sentiment_label: null,
      sentiment_score: null,
      topics_json: null,
      moderation_json: null,
      detected_language: null,
      model_used: null,
      input_tokens: null,
      output_tokens: null,
      duration_ms: null,
      mime_type: null,
    };
    sessionRows.push(
      {
        ...common,
        id: "session-a",
        partner_id: "partner-a",
        metadata_json: JSON.stringify({ target }),
      },
      {
        ...common,
        id: "session-b",
        partner_id: "partner-b",
        metadata_json: JSON.stringify({
          target: { label: "South Ave", key: "south-ave", source: "capture-link" },
        }),
      }
    );

    const payload = await buildDashboardPayload("partner-a");

    expect(payload.sessions).toEqual([
      expect.objectContaining({ id: "session-a", target }),
    ]);
  });

  it("computes all-time Partner aggregates while returning only 100 recent Sessions", async () => {
    const baseTime = new Date("2026-08-24T12:00:00.000Z").getTime();
    const common = {
      status: "created",
      external_event_id: null,
      metadata_json: null,
      processing_started_at: null,
      processing_completed_at: null,
      transcript: null,
      sentiment_label: null,
      sentiment_score: null,
      topics_json: null,
      moderation_json: null,
      detected_language: null,
      model_used: null,
      input_tokens: null,
      output_tokens: null,
      duration_ms: null,
      mime_type: null,
    };

    for (let index = 0; index < 100; index += 1) {
      sessionRows.push({
        ...common,
        id: `recent-${index}`,
        partner_id: "partner-a",
        status: index === 0 ? "created" : "completed",
        created_at: new Date(baseTime - index * 1_000),
      });
    }
    sessionRows.push(
      {
        ...common,
        id: "old-completed",
        partner_id: "partner-a",
        status: "completed",
        created_at: new Date(baseTime - 101_000),
        metadata_json: JSON.stringify({
          target: { label: "Old Target", key: "old-target", source: "capture-link" },
        }),
        sentiment_label: "negative",
        topics_json: JSON.stringify(["wait_time"]),
        moderation_json: JSON.stringify({ urgency: "urgent" }),
      },
      {
        ...common,
        id: "partner-b-session",
        partner_id: "partner-b",
        status: "completed",
        created_at: new Date(baseTime + 1_000),
        topics_json: JSON.stringify(["wait_time"]),
        moderation_json: JSON.stringify({ urgency: "urgent" }),
      }
    );

    const payload = await buildDashboardPayload("partner-a");

    expect(payload.stats.total).toBe(101);
    expect(payload.stats.completed).toBe(100);
    expect(payload.stats.urgent).toBe(1);
    expect(payload.topics).toContainEqual({ name: "wait_time", count: 1, pct: 1 });
    expect(payload.sessions).toHaveLength(100);
    expect(payload.sessions).not.toContainEqual(
      expect.objectContaining({ id: "old-completed" })
    );
    expect(payload.sessions).not.toContainEqual(
      expect.objectContaining({ id: "partner-b-session" })
    );
  });
});
