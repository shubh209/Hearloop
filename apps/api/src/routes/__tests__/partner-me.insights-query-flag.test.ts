// hearloop/apps/api/src/routes/__tests__/partner-me.insights-query-flag.test.ts

jest.mock("../../lib/db", () => ({
  db: {
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    executeTakeFirst: jest.fn().mockResolvedValue(null),
  },
}));

import { partnerMeRoutes } from "../partner-me";

let savedInsightsQueryEnabled: string | undefined;

function makeApp() {
  const handlers: Record<string, Function> = {};
  const app: any = {
    authenticatePartner: jest.fn(),
    get: (path: string, _opts: unknown, fn: Function) => {
      handlers[`GET ${path}`] = fn;
    },
    patch: (path: string, _opts: unknown, fn: Function) => {
      handlers[`PATCH ${path}`] = fn;
    },
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

const partner = {
  id: "partner-1",
  name: "QuickLube",
  businessContext: "Oil changes",
  allowedOrigins: "https://quicklube.example.com",
  webhookUrl: null,
};

describe("GET /partners/me insightsQueryEnabled", () => {
  beforeEach(() => {
    savedInsightsQueryEnabled = process.env.INSIGHTS_QUERY_ENABLED;
  });

  afterEach(() => {
    if (savedInsightsQueryEnabled === undefined) {
      delete process.env.INSIGHTS_QUERY_ENABLED;
    } else {
      process.env.INSIGHTS_QUERY_ENABLED = savedInsightsQueryEnabled;
    }
  });

  it("returns insightsQueryEnabled false when INSIGHTS_QUERY_ENABLED is unset", async () => {
    delete process.env.INSIGHTS_QUERY_ENABLED;
    const { app, handlers } = makeApp();
    await partnerMeRoutes(app);
    const reply = makeReply();

    await handlers["GET /partners/me"]({ partner }, reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ insightsQueryEnabled: false })
    );
  });

  it("returns insightsQueryEnabled true when INSIGHTS_QUERY_ENABLED is true", async () => {
    process.env.INSIGHTS_QUERY_ENABLED = "true";
    const { app, handlers } = makeApp();
    await partnerMeRoutes(app);
    const reply = makeReply();

    await handlers["GET /partners/me"]({ partner }, reply);

    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ insightsQueryEnabled: true })
    );
  });
});
