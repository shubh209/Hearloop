jest.mock("../../lib/count-insights-sessions", () => ({
  countInsightsSessions: jest.fn(),
}));

import { countInsightsSessions } from "../../lib/count-insights-sessions";
import { insightsQueryStubEvidenceUrl } from "../../lib/insights-query-stub-evidence-url";
import { insightsQueryRoutes } from "../insights-query";

const mockCountInsightsSessions = countInsightsSessions as jest.MockedFunction<
  typeof countInsightsSessions
>;

const VALID_FROM = "2026-01-01T00:00:00.000Z";
const VALID_TO = "2026-01-08T00:00:00.000Z";
const RANGE_TOO_WIDE_TO = "2026-04-02T00:00:00.000Z";

let savedInsightsQueryEnabled: string | undefined;

function makeApp() {
  const handlers: Record<string, Function> = {};
  const app: any = {
    authenticatePartner: jest.fn(),
    post: (path: string, _opts: unknown, fn: Function) => {
      handlers[`POST ${path}`] = fn;
    },
  };
  return { app, handlers };
}

function makeReply() {
  const reply: any = {};
  reply.code = jest.fn().mockReturnValue(reply);
  reply.send = jest.fn().mockReturnValue(reply);
  return reply;
}

function countBody(overrides: Record<string, unknown> = {}) {
  return {
    intent: "count",
    filters: {
      from: VALID_FROM,
      to: VALID_TO,
      ...overrides,
    },
  };
}

describe("POST /partners/me/insights-query", () => {
  beforeEach(() => {
    savedInsightsQueryEnabled = process.env.INSIGHTS_QUERY_ENABLED;
    process.env.INSIGHTS_QUERY_ENABLED = "true";
    mockCountInsightsSessions.mockReset();
    mockCountInsightsSessions.mockResolvedValue(0);
  });

  afterEach(() => {
    if (savedInsightsQueryEnabled === undefined) {
      delete process.env.INSIGHTS_QUERY_ENABLED;
    } else {
      process.env.INSIGHTS_QUERY_ENABLED = savedInsightsQueryEnabled;
    }
  });

  it("returns 404 when the feature flag is off", async () => {
    delete process.env.INSIGHTS_QUERY_ENABLED;
    const { app, handlers } = makeApp();
    await insightsQueryRoutes(app);
    const reply = makeReply();

    await handlers["POST /partners/me/insights-query"](
      { partner: { id: "partner-a" }, body: countBody() },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: "not_found" });
    expect(mockCountInsightsSessions).not.toHaveBeenCalled();
  });

  it("returns unsupported_intent for intent list without totalCount", async () => {
    const { app, handlers } = makeApp();
    await insightsQueryRoutes(app);
    const reply = makeReply();

    await handlers["POST /partners/me/insights-query"](
      {
        partner: { id: "partner-a" },
        body: { intent: "list", filters: {} },
      },
      reply
    );

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.any(String),
        refusal: expect.objectContaining({ code: "unsupported_intent" }),
      })
    );
    const payload = reply.send.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("totalCount");
    expect(mockCountInsightsSessions).not.toHaveBeenCalled();
  });

  it("returns range_too_wide for a window longer than 90 days", async () => {
    const { app, handlers } = makeApp();
    await insightsQueryRoutes(app);
    const reply = makeReply();

    await handlers["POST /partners/me/insights-query"](
      {
        partner: { id: "partner-a" },
        body: countBody({ to: RANGE_TOO_WIDE_TO }),
      },
      reply
    );

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: expect.any(String),
        refusal: expect.objectContaining({ code: "range_too_wide" }),
      })
    );
    const payload = reply.send.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("totalCount");
    expect(mockCountInsightsSessions).not.toHaveBeenCalled();
  });

  it("returns count 0 with the stub evidence URL", async () => {
    mockCountInsightsSessions.mockResolvedValue(0);
    const { app, handlers } = makeApp();
    await insightsQueryRoutes(app);
    const reply = makeReply();

    await handlers["POST /partners/me/insights-query"](
      { partner: { id: "partner-a" }, body: countBody() },
      reply
    );

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({
      summary: expect.any(String),
      totalCount: 0,
      evidenceResultsUrl: insightsQueryStubEvidenceUrl(),
    });
  });

  it("scopes countInsightsSessions to req.partner.id only", async () => {
    mockCountInsightsSessions.mockResolvedValue(3);
    const { app, handlers } = makeApp();
    await insightsQueryRoutes(app);
    const reply = makeReply();

    await handlers["POST /partners/me/insights-query"](
      { partner: { id: "partner-a" }, body: countBody() },
      reply
    );

    expect(mockCountInsightsSessions).toHaveBeenCalledTimes(1);
    expect(mockCountInsightsSessions).toHaveBeenCalledWith(
      "partner-a",
      expect.objectContaining({
        from: expect.any(Date),
        to: expect.any(Date),
      })
    );
    expect(mockCountInsightsSessions.mock.calls[0][0]).not.toBe("partner-b");
  });

  it("returns 400 for unknown filter keys", async () => {
    const { app, handlers } = makeApp();
    await insightsQueryRoutes(app);
    const reply = makeReply();

    await handlers["POST /partners/me/insights-query"](
      {
        partner: { id: "partner-a" },
        body: countBody({ partnerId: "sneak" }),
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "bad_request",
        message: expect.any(String),
      })
    );
    expect(mockCountInsightsSessions).not.toHaveBeenCalled();
  });
});
