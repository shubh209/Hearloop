const sessionRows: Array<Record<string, unknown>> = [];

function selectSessions() {
  let partnerId: string | null = null;
  const query = {
    leftJoin: () => query,
    select: () => query,
    where(column: string, operator: string, value: string) {
      if (column === "sessions.partner_id" && operator === "=") partnerId = value;
      return query;
    },
    orderBy: () => query,
    limit: () => query,
    execute: async () => sessionRows.filter((row) => row.partner_id === partnerId),
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
});
