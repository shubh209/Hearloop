const mockApiKeys: Array<Record<string, unknown>> = [];
const mockForUpdate = jest.fn();

function matches(
  row: Record<string, unknown>,
  conditions: Array<[string, string, unknown]>
) {
  return conditions.every(([column, operator, value]) => {
    const field = column.replace("api_keys.", "");
    if (operator === "is") return row[field] === value;
    return row[field] === value;
  });
}

function mockInsertApiKey() {
  return {
    values(values: Record<string, unknown>) {
      return {
        execute: async () => {
          mockApiKeys.push(values);
        },
      };
    },
  };
}

function mockUpdateApiKey() {
  const conditions: Array<[string, string, unknown]> = [];
  let updates: Record<string, unknown> = {};
  const query = {
    set(values: Record<string, unknown>) {
      updates = values;
      return query;
    },
    where(column: string, operator: string, value: unknown) {
      conditions.push([column, operator, value]);
      return query;
    },
    execute: async () => {
      mockApiKeys
        .filter((key) => matches(key, conditions))
        .forEach((key) => Object.assign(key, updates));
    },
  };
  return query;
}

function mockSelectPartner() {
  const query = {
    select: () => query,
    where: () => query,
    forUpdate: () => {
      mockForUpdate();
      return query;
    },
    executeTakeFirstOrThrow: async () => ({ id: "partner-a" }),
  };
  return query;
}

const mockDb = {
  insertInto: jest.fn().mockImplementation(mockInsertApiKey),
  updateTable: jest.fn().mockImplementation(mockUpdateApiKey),
  selectFrom: jest.fn().mockImplementation(mockSelectPartner),
  transaction: jest.fn().mockImplementation(() => ({
    execute: (callback: (transaction: typeof mockDb) => unknown) => callback(mockDb),
  })),
};

jest.mock("../../lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

import Fastify from "fastify";
import { partnerMeRoutes } from "../partner-me";

function activeKeys(partnerId: string, type: "secret" | "public") {
  return mockApiKeys.filter(
    (key) =>
      key.partner_id === partnerId && key.type === type && key.revoked_at === null
  );
}

describe("POST /partners/me/secret-keys", () => {
  beforeEach(() => {
    mockApiKeys.splice(0);
    mockDb.insertInto.mockClear();
    mockDb.updateTable.mockClear();
    mockDb.selectFrom.mockClear();
    mockForUpdate.mockClear();
    mockDb.transaction.mockClear();

    mockApiKeys.push(
      {
        id: "old-a-secret",
        partner_id: "partner-a",
        type: "secret",
        key_prefix: "sk-live_olda",
        key_hash: "old-a-hash",
        last_used_at: null,
        revoked_at: null,
        created_at: new Date(),
      },
      {
        id: "active-b-secret",
        partner_id: "partner-b",
        type: "secret",
        key_prefix: "sk-live_oldb",
        key_hash: "old-b-hash",
        last_used_at: null,
        revoked_at: null,
        created_at: new Date(),
      }
    );
  });

  it("rotates only the authenticated Partner's active secret key", async () => {
    const app = Fastify();
    app.decorate("authenticatePartner", async (request: any, reply: any) => {
      if (request.headers.authorization !== "Bearer partner-a-session") {
        return reply.code(401).send({ error: "missing_auth" });
      }
      request.partner = { id: "partner-a" };
    });
    await app.register(partnerMeRoutes);

    const response = await app.inject({
      method: "POST",
      url: "/partners/me/secret-keys",
      headers: { authorization: "Bearer partner-a-session" },
    });

    const payload = response.json();
    const oldPartnerAKey = mockApiKeys.find((key) => key.id === "old-a-secret")!;
    const partnerBKey = mockApiKeys.find((key) => key.id === "active-b-secret")!;

    expect(response.statusCode).toBe(200);
    expect(payload.secretKey).toMatch(/^sk-live_[0-9a-f]{48}$/);
    expect(activeKeys("partner-a", "secret")).toHaveLength(1);
    expect(oldPartnerAKey.revoked_at).toBeInstanceOf(Date);
    expect(activeKeys("partner-b", "secret")).toEqual([partnerBKey]);
    expect(mockDb.selectFrom).toHaveBeenCalledWith("partners");
    expect(mockForUpdate).toHaveBeenCalledTimes(1);

    await app.close();
  });
});
