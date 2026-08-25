const mockPartners: Array<Record<string, any>> = [];
const mockApiKeys: Array<Record<string, any>> = [];
const mockSessions: Array<Record<string, any>> = [];

function conditionValue(
  conditions: Array<[string, string, unknown]>,
  column: string
) {
  return conditions.find(([field]) => field === column)?.[2];
}

function mockSelect(table: string) {
  const conditions: Array<[string, string, unknown]> = [];
  const query = {
    innerJoin: () => query,
    select: () => query,
    where(column: string, operator: string, value: unknown) {
      conditions.push([column, operator, value]);
      return query;
    },
    executeTakeFirst: async () => {
      if (table === "partners") {
        const partnerId = conditionValue(conditions, "id");
        const email = conditionValue(conditions, "email");
        const status = conditionValue(conditions, "status");
        return mockPartners.find(
          (partner) =>
            (partnerId === undefined || partner.id === partnerId) &&
            (email === undefined || partner.email === email) &&
            (status === undefined || partner.status === status)
        );
      }

      return undefined;
    },
  };
  return query;
}

function mockInsert(table: string) {
  return {
    values(values: Record<string, unknown>) {
      return {
        execute: async () => {
          if (table === "partners") mockPartners.push(values);
          if (table === "api_keys") mockApiKeys.push(values);
        },
      };
    },
  };
}

const mockDb = {
  selectFrom: jest.fn().mockImplementation(mockSelect),
  insertInto: jest.fn().mockImplementation(mockInsert),
  updateTable: jest.fn(),
};

jest.mock("../../lib/db", () => ({
  get db() {
    return mockDb;
  },
}));

import bcrypt from "bcrypt";
import Fastify from "fastify";
import { authenticatePartner } from "../../lib/authenticate-partner";
import { verifyPartnerSession } from "../../lib/partner-session";
import { partnerMeRoutes } from "../partner-me";
import { partnerRoutes } from "../partners";

describe("Partner registration and dashboard authentication", () => {
  beforeEach(() => {
    mockPartners.splice(0);
    mockApiKeys.splice(0);
    mockSessions.splice(0);
    process.env.PARTNER_SESSION_SECRET =
      "test-partner-session-secret-at-least-32-characters";
  });

  afterAll(() => {
    delete process.env.PARTNER_SESSION_SECRET;
  });

  it("keeps a Partner dashboard session scoped to its authenticated identity", async () => {
    mockSessions.push({
      id: "session-a",
      partner_id: "partner-a",
      public_token: "9c9643a1-e87c-4b22-a7f3-03b7afd81d78",
      status: "created",
    });
    const publicSessionToken = mockSessions[0].public_token;

    const app = Fastify();
    app.decorate("authenticatePartner", authenticatePartner);
    await app.register(partnerRoutes, { prefix: "/v1" });
    await app.register(partnerMeRoutes, { prefix: "/v1" });

    const registration = await app.inject({
      method: "POST",
      url: "/v1/partners/register",
      payload: {
        name: "Partner A",
        email: "partner-a@example.com",
        password: "a-secure-password",
      },
    });
    const registered = registration.json();

    expect(registration.statusCode).toBe(201);
    expect(mockPartners).toHaveLength(1);
    expect(mockPartners[0].password_hash).not.toBe("a-secure-password");
    expect(await bcrypt.compare("a-secure-password", mockPartners[0].password_hash)).toBe(true);
    expect(registered.sessionToken).toMatch(/^hlps\./);
    expect(registered.embedKeyPrefix).toMatch(/^pk-live_/);

    const login = await app.inject({
      method: "POST",
      url: "/v1/partners/login",
      payload: { email: "partner-a@example.com", password: "a-secure-password" },
    });
    const loggedIn = login.json();

    expect(login.statusCode).toBe(200);
    expect(loggedIn.sessionToken).toMatch(/^hlps\./);
    expect(verifyPartnerSession(loggedIn.sessionToken)).toEqual({
      partnerId: registered.partnerId,
    });

    const publicSession = await app.inject({
      method: "GET",
      url: "/v1/partners/me",
      headers: { authorization: `Bearer ${publicSessionToken}` },
    });
    expect(publicSession.statusCode).toBe(401);

    const otherPartnerDashboard = await app.inject({
      method: "GET",
      url: "/v1/partners/partner-b/dashboard",
      headers: { authorization: `Bearer ${loggedIn.sessionToken}` },
    });
    expect(otherPartnerDashboard.statusCode).toBe(403);

    await app.close();
  });
});
