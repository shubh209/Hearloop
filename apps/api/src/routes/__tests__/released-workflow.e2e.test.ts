import { createHmac } from "crypto";

type Row = Record<string, any>;

const mockState: Record<string, Row[]> = {
  partners: [],
  capture_links: [],
  sessions: [],
  recordings: [],
  analyses: [],
  webhook_deliveries: [],
};
const mockWebhookRequests: Array<{ body: string; headers: Record<string, string> }> = [];
const mockUrgentAlerts: Row[] = [];

function rowsFor(table: string): Row[] {
  return mockState[table] ?? (mockState[table] = []);
}

function valueAt(row: Row, column: string) {
  return row[column.split(".").pop()!];
}

function matches(row: Row, conditions: Array<[string, string, any]>) {
  return conditions.every(([column, operator, expected]) => {
    const actual = valueAt(row, column);
    if (operator === "=") return actual === expected;
    if (operator === "in") return expected.includes(actual);
    if (operator === "is") return actual === expected;
    return false;
  });
}

function joinedRows(table: string): Row[] {
  if (table === "capture_links") {
    return rowsFor(table).map((link) => ({
      ...mockState.partners.find((partner) => partner.id === link.partner_id),
      ...link,
    }));
  }
  if (table !== "sessions") return rowsFor(table).map((row) => ({ ...row }));
  return rowsFor("sessions").map((session) => ({
    ...mockState.partners.find((partner) => partner.id === session.partner_id),
    ...mockState.analyses.find((analysis) => analysis.session_id === session.id),
    ...mockState.recordings.find((recording) => recording.session_id === session.id),
    ...session,
  }));
}

function mockSelectQuery(table: string) {
  const conditions: Array<[string, string, any]> = [];
  let limit: number | undefined;
  const query: Row = {
    innerJoin: () => query,
    leftJoin: () => query,
    select: () => query,
    selectAll: () => query,
    where(column: string, operator: string, value: any) {
      conditions.push([column, operator, value]);
      return query;
    },
    orderBy: () => query,
    limit(value: number) {
      limit = value;
      return query;
    },
    async execute() {
      const result = joinedRows(table).filter((row) => matches(row, conditions));
      return limit === undefined ? result : result.slice(0, limit);
    },
    async executeTakeFirst() {
      return (await query.execute())[0];
    },
  };
  return query;
}

function mockUpdateQuery(table: string) {
  const conditions: Array<[string, string, any]> = [];
  let values: Row = {};
  const query: Row = {
    set(next: Row) {
      values = next;
      return query;
    },
    where(column: string, operator: string, value: any) {
      conditions.push([column, operator, value]);
      return query;
    },
    returning: () => query,
    async execute() {
      const selected = rowsFor(table).filter((row) => matches(row, conditions));
      selected.forEach((row) => Object.assign(row, values));
      return selected;
    },
    async executeTakeFirst() {
      return (await query.execute())[0];
    },
  };
  return query;
}

function mockInsertQuery(table: string) {
  let values: Row = {};
  const query: Row = {
    values(next: Row) {
      values = next;
      return query;
    },
    onConflict(callback: (oc: Row) => unknown) {
      const oc: Row = {
        column: () => oc,
        columns: () => oc,
        doUpdateSet: () => oc,
      };
      callback(oc);
      return query;
    },
    async execute() {
      const uniqueColumn = table === "analyses" || table === "recordings" ? "session_id" : undefined;
      const existing = uniqueColumn
        ? rowsFor(table).find((row) => row[uniqueColumn] === values[uniqueColumn])
        : undefined;
      if (existing) Object.assign(existing, values);
      else rowsFor(table).push({ ...values });
      return [];
    },
  };
  return query;
}

jest.mock("../../lib/db", () => {
  const db = {
    selectFrom: jest.fn((table: string) => mockSelectQuery(table)),
    updateTable: jest.fn((table: string) => mockUpdateQuery(table)),
    insertInto: jest.fn((table: string) => mockInsertQuery(table)),
    transaction: jest.fn(() => ({
      execute: (callback: (trx: Row) => unknown) => callback(db),
    })),
  };
  return { db };
});
jest.mock("../../lib/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  jobLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockAudio = Buffer.alloc(1_200);
mockAudio[0] = 0x1a;
mockAudio[1] = 0x45;
jest.mock("../../lib/storage", () => ({
  buildStorageKey: (sessionId: string, mimeType: string) =>
    `recordings/${sessionId}.${mimeType === "audio/webm" ? "webm" : "bin"}`,
  getUploadSignedUrl: async (sessionId: string, mimeType: string) => ({
    uploadUrl: "https://controlled-storage.invalid/upload",
    storageKey: `recordings/${sessionId}.${mimeType === "audio/webm" ? "webm" : "bin"}`,
  }),
  getAudioBuffer: async () => mockAudio,
}));
jest.mock("../../lib/groq", () => ({
  transcribeAudio: async () => ({
    text: "The wait was unacceptable and I need a manager to call me now.",
    detectedLanguage: "en",
    confidence: 0.99,
  }),
}));
jest.mock("../../lib/claude", () => ({
  analyzeTranscript: async () => ({
    sentiment: "negative",
    sentimentScore: -0.95,
    topics: ["wait time"],
    urgency: "urgent",
    qualityFlags: [],
    moderationFlags: [],
    summary: "Customer requests an immediate manager callback.",
    modelUsed: "none",
    inputTokens: 0,
    outputTokens: 0,
  }),
}));
jest.mock("../../lib/cloudwatch", () => ({ emitBedrockInvocation: jest.fn() }));
jest.mock("../../lib/send-urgent-alert", () => ({
  sendUrgentAlert: async (input: Row) => { mockUrgentAlerts.push(input); },
}));

let mockRunValidate: (payload: Row) => Promise<void>;
let mockRunTranscribe: (payload: Row) => Promise<void>;
let mockRunAnalyze: (payload: Row) => Promise<void>;
let mockRunWebhook: (payload: Row) => Promise<void>;
jest.mock("../../lib/queue", () => ({
  enqueueExpireSession: async () => undefined,
  enqueueValidate: async (payload: Row) => mockRunValidate(payload),
  enqueueTranscribe: async (payload: Row) => mockRunTranscribe(payload),
  enqueueAnalyze: async (payload: Row) => mockRunAnalyze(payload),
  enqueueWebhook: async (payload: Row) => mockRunWebhook(payload),
}));

import Fastify from "fastify";
import { captureLinkRoutes } from "../capture-links";
import { publicRoutes } from "../public";
import { partnerMeRoutes } from "../partner-me";
import { runValidateRecordingJob } from "../../jobs/validate-recording";
import { runTranscribeJob } from "../../jobs/transcribe";
import { runAnalyzeJob } from "../../jobs/analyze";
import { runDeliverWebhookJob } from "../../jobs/deliver-webhook";

describe("released legacy workflow", () => {
  it("carries a Capture-link Target through controlled processing and Partner delivery", async () => {
    mockRunValidate = runValidateRecordingJob;
    mockRunTranscribe = runTranscribeJob;
    mockRunAnalyze = runAnalyzeJob;
    mockRunWebhook = runDeliverWebhookJob;
    Object.values(mockState).forEach((rows) => rows.splice(0));
    mockWebhookRequests.splice(0);
    mockUrgentAlerts.splice(0);
    process.env.WEBHOOK_SIGNING_SECRET = "controlled-secret";
    global.fetch = jest.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      mockWebhookRequests.push({
        body: String(init?.body),
        headers: init?.headers as Record<string, string>,
      });
      return { status: 204 } as Response;
    }) as typeof fetch;
    mockState.partners.push({
      id: "partner-1",
      name: "Northside Auto",
      email: "owner@example.com",
      business_context: "Quick-service automotive shop",
      default_config_json: JSON.stringify({
        promptText: "How was your visit?",
        consentRequired: true,
        consentText: "I consent to analysis.",
        maxDurationSec: 30,
      }),
      allowed_origins: "https://northside.example",
      webhook_url: "https://partner.example/webhook",
    });

    const app = Fastify();
    app.decorate("authenticatePartner", async () => undefined);
    app.addHook("preHandler", async (request) => {
      (request as any).partner = {
        id: "partner-1",
        name: "Northside Auto",
        businessContext: "Quick-service automotive shop",
      };
    });
    await captureLinkRoutes(app as any);
    await publicRoutes(app as any);
    await partnerMeRoutes(app as any);

    const createLink = await app.inject({
      method: "POST",
      url: "/partners/me/capture-links",
      payload: { targetLabel: "North Ave — Oil Change" },
    });
    expect(createLink.statusCode).toBe(201);
    const link = createLink.json();

    const mint = await app.inject({
      method: "POST",
      url: `/public/capture/${link.token}/session`,
    });
    expect(mint.statusCode).toBe(201);
    const minted = mint.json();

    const config = await app.inject({
      method: "GET",
      url: `/public/session/${minted.sessionToken}`,
    });
    expect(config.json()).toMatchObject({
      consentRequired: true,
      promptText: "How was your visit?",
    });

    const opened = await app.inject({
      method: "POST",
      url: `/public/session/${minted.sessionToken}/open`,
    });
    expect(opened.json()).toMatchObject({ status: "opened" });

    const upload = await app.inject({
      method: "POST",
      url: `/public/session/${minted.sessionToken}/upload-url`,
      payload: { mimeType: "audio/webm" },
    });
    expect(upload.statusCode).toBe(200);
    const grant = upload.json();

    const finalized = await app.inject({
      method: "POST",
      url: `/public/session/${minted.sessionToken}/finalize`,
      payload: {
        storageKey: grant.storageKey,
        mimeType: "audio/webm",
        durationMs: 4_000,
        consentGiven: true,
        languageHint: "en",
      },
    });
    expect(finalized.statusCode).toBe(200);

    const session = mockState.sessions.find((row) => row.id === minted.sessionId)!;
    const analysis = mockState.analyses.find((row) => row.session_id === minted.sessionId)!;
    expect(session.status).toBe("completed");
    expect(analysis).toMatchObject({
      transcript: "The wait was unacceptable and I need a manager to call me now.",
      sentiment_label: "negative",
    });
    expect(JSON.parse(session.metadata_json).target).toEqual({
      label: "North Ave — Oil Change",
      key: "north-ave-oil-change",
      source: "capture-link",
    });
    expect(JSON.parse(session.metadata_json)._hearloopValidationHandoff).toEqual({
      state: "enqueued",
      languageHint: "en",
    });
    expect(mockState.recordings).toEqual([
      expect.objectContaining({
        session_id: minted.sessionId,
        storage_key: grant.storageKey,
        mime_type: "audio/webm",
      }),
    ]);

    const dashboard = await app.inject({
      method: "GET",
      url: "/partners/me/dashboard",
    });
    expect(dashboard.json()).toMatchObject({
      stats: { total: 1, completed: 1, urgent: 1 },
      sessions: [{
        id: minted.sessionId,
        target: { label: "North Ave — Oil Change", key: "north-ave-oil-change" },
        urgency: "urgent",
      }],
    });
    expect(mockWebhookRequests).toHaveLength(1);
    const webhook = mockWebhookRequests[0];
    const timestamp = webhook.headers["X-Hearloop-Timestamp"];
    expect(webhook.headers["X-Hearloop-Signature"]).toBe(
      `sha256=${createHmac("sha256", "controlled-secret")
        .update(`${timestamp}.${webhook.body}`)
        .digest("hex")}`
    );
    expect(mockState.webhook_deliveries).toEqual([
      expect.objectContaining({
        session_id: minted.sessionId,
        event_type: "session.completed",
        status: "delivered",
        attempt_count: 1,
        response_code: 204,
      }),
    ]);
    expect(mockUrgentAlerts).toEqual([
      expect.objectContaining({
        to: "owner@example.com",
        sessionId: minted.sessionId,
        urgency: "urgent",
        targetLabel: "North Ave — Oil Change",
      }),
    ]);

    await app.close();
  });
});
