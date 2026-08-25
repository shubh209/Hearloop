type CaptureLinkRow = {
  id: string;
  partner_id: string;
  token: string;
  target_label: string | null;
  target_key: string | null;
  active: boolean;
  created_at: Date;
};

const captureLinks: CaptureLinkRow[] = [];

function rowMatches(
  row: CaptureLinkRow,
  conditions: Array<[string, string, unknown]>
) {
  return conditions.every(([column, operator, value]) => {
    const field = column.replace("capture_links.", "") as keyof CaptureLinkRow;
    return operator === "=" && row[field] === value;
  });
}

function selectCaptureLinks() {
  const conditions: Array<[string, string, unknown]> = [];
  const query = {
    select: () => query,
    where(column: string, operator: string, value: unknown) {
      conditions.push([column, operator, value]);
      return query;
    },
    orderBy: () => query,
    execute: async () => captureLinks.filter((row) => rowMatches(row, conditions)),
  };
  return query;
}

function updateCaptureLinks() {
  const conditions: Array<[string, string, unknown]> = [];
  let values: Partial<CaptureLinkRow> = {};
  const query = {
    set(nextValues: Partial<CaptureLinkRow>) {
      values = nextValues;
      return query;
    },
    where(column: string, operator: string, value: unknown) {
      conditions.push([column, operator, value]);
      return query;
    },
    execute: async () => {
      captureLinks
        .filter((row) => rowMatches(row, conditions))
        .forEach((row) => Object.assign(row, values));
    },
  };
  return query;
}

const mockDb = {
  insertInto: jest.fn().mockImplementation(() => ({
    values(values: CaptureLinkRow) {
      return {
        execute: async () => {
          captureLinks.push(values);
        },
      };
    },
  })),
  selectFrom: jest.fn().mockImplementation(selectCaptureLinks),
  updateTable: jest.fn().mockImplementation(updateCaptureLinks),
};

jest.mock("../../lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

import { captureLinkRoutes } from "../capture-links";

function makeApp() {
  const handlers: Record<string, Function> = {};
  const app: any = {
    authenticatePartner: jest.fn(),
    post: (path: string, _options: unknown, handler: Function) => {
      handlers[`POST ${path}`] = handler;
    },
    get: (path: string, _options: unknown, handler: Function) => {
      handlers[`GET ${path}`] = handler;
    },
    delete: (path: string, _options: unknown, handler: Function) => {
      handlers[`DELETE ${path}`] = handler;
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

describe("Capture-link Partner boundary", () => {
  beforeEach(() => {
    captureLinks.splice(0);
    jest.clearAllMocks();
  });

  it("lets a Partner create, list, and deactivate its own normalized Target link", async () => {
    const { app, handlers } = makeApp();
    await captureLinkRoutes(app);
    const createReply = makeReply();

    await handlers["POST /partners/me/capture-links"](
      {
        partner: { id: "partner-a" },
        body: { targetLabel: "  North Ave — Oil Change  " },
      },
      createReply
    );

    const created = createReply.send.mock.calls[0][0];
    expect(createReply.code).toHaveBeenCalledWith(201);
    expect(created).toEqual({
      id: expect.any(String),
      token: expect.stringMatching(/^[0-9a-f]{32}$/),
      targetLabel: "North Ave — Oil Change",
      path: expect.stringMatching(/^\/c\/[0-9a-f]{32}$/),
      active: true,
    });

    const listReply = makeReply();
    await handlers["GET /partners/me/capture-links"](
      { partner: { id: "partner-a" } },
      listReply
    );
    expect(listReply.send.mock.calls[0][0].links).toEqual([
      expect.objectContaining({
        id: created.id,
        token: created.token,
        targetLabel: "North Ave — Oil Change",
        targetKey: "north-ave-oil-change",
        path: created.path,
      }),
    ]);

    const deactivateReply = makeReply();
    await handlers["DELETE /partners/me/capture-links/:id"](
      { partner: { id: "partner-a" }, params: { id: created.id } },
      deactivateReply
    );
    expect(deactivateReply.send).toHaveBeenCalledWith({ ok: true });

    const emptyListReply = makeReply();
    await handlers["GET /partners/me/capture-links"](
      { partner: { id: "partner-a" } },
      emptyListReply
    );
    expect(emptyListReply.send.mock.calls[0][0].links).toEqual([]);
  });

  it("does not reveal or deactivate another Partner's Capture link", async () => {
    captureLinks.push({
      id: "link-a",
      partner_id: "partner-a",
      token: "a".repeat(32),
      target_label: "North Ave",
      target_key: "north-ave",
      active: true,
      created_at: new Date("2026-08-24T12:00:00.000Z"),
    });
    const { app, handlers } = makeApp();
    await captureLinkRoutes(app);

    const listReply = makeReply();
    await handlers["GET /partners/me/capture-links"](
      { partner: { id: "partner-b" } },
      listReply
    );
    expect(listReply.send.mock.calls[0][0].links).toEqual([]);

    const deactivateReply = makeReply();
    await handlers["DELETE /partners/me/capture-links/:id"](
      { partner: { id: "partner-b" }, params: { id: "link-a" } },
      deactivateReply
    );
    expect(deactivateReply.send).toHaveBeenCalledWith({ ok: true });
    expect(captureLinks[0].active).toBe(true);
  });
});
