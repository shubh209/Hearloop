// hearloop/apps/api/src/jobs/__tests__/deliver-webhook.test.ts
//
// Ticket 003 — webhook retry identity.
//
// Covers the seam: runDeliverWebhookJob(payload) called repeatedly for the
// same (partnerId, sessionId, eventType) tuple, simulating BullMQ retrying
// the same job after a failed delivery attempt.

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that touch the modules under test
// ---------------------------------------------------------------------------

// crypto: keep createHmac/timingSafeEqual etc. real, control randomUUID so
// we can tell whether the code under test minted a *new* id on a retry.
const mockRandomUUID = jest.fn();
jest.mock("crypto", () => ({
  ...jest.requireActual("crypto"),
  randomUUID: (...args: unknown[]) => mockRandomUUID(...args),
}));

// SSRF guard is out of scope for this ticket — no-op it.
jest.mock("../../lib/assert-public-https-url", () => ({
  assertPublicHttpsUrl: jest.fn((url: string) => {
    if (url.includes("blocked")) throw new Error("blocked webhook URL");
  }),
}));

jest.mock("../../lib/logger", () => ({
  jobLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// db — a tiny in-memory fake standing in for the "partners" and
// "webhook_deliveries" tables, so the test can assert against real
// query/update targeting instead of just "no crash".
const mockState: {
  partner?: { id: string; webhook_url: string | null };
  delivery?: {
    id: string;
    event_id: string;
    partner_id: string;
    session_id: string;
    event_type: string;
    payload_json: string;
    status: string;
    attempt_count: number;
    response_code: number | null;
    last_attempted_at: Date | null;
    created_at: Date;
  };
  updateWhereArgs: Array<[string, unknown]>;
} = { updateWhereArgs: [] };

jest.mock("../../lib/db", () => {
  function makeSelectChain(table: string) {
    const conditions: Array<[string, unknown]> = [];
    let cols: string[] = [];
    const chain: any = {
      select: jest.fn((c: string | string[]) => {
        cols = Array.isArray(c) ? c : [c];
        return chain;
      }),
      where: jest.fn((col: string, _op: string, val: unknown) => {
        conditions.push([col, val]);
        return chain;
      }),
      executeTakeFirst: jest.fn(async () => {
        const row = table === "partners" ? mockState.partner : mockState.delivery;
        if (!row) return undefined;
        const matches = conditions.every(([c, v]) => (row as any)[c] === v);
        if (!matches) return undefined;
        if (!cols.length) return row;
        const projected: any = {};
        for (const c of cols) projected[c] = (row as any)[c];
        return projected;
      }),
    };
    return chain;
  }

  function makeInsertChain() {
    let values: any;
    const chain: any = {
      values: jest.fn((v: any) => {
        values = v;
        return chain;
      }),
      onConflict: jest.fn((cb: (oc: any) => any) => {
        const oc = {
          columns: jest.fn().mockReturnThis(),
          doUpdateSet: jest.fn().mockReturnThis(),
        };
        cb(oc);
        return chain;
      }),
      execute: jest.fn(async () => {
        if (!mockState.delivery) {
          mockState.delivery = { ...values };
        } else {
          // Mirrors the real onConflict doUpdateSet({ status: "pending" }) —
          // only status changes, id/event_id of the existing row are untouched.
          mockState.delivery.status = "pending";
        }
        return [];
      }),
    };
    return chain;
  }

  function makeUpdateChain() {
    let setValues: any;
    const conditions: Array<[string, unknown]> = [];
    const chain: any = {
      set: jest.fn((v: any) => {
        setValues = v;
        return chain;
      }),
      where: jest.fn((col: string, _op: string, val: unknown) => {
        conditions.push([col, val]);
        mockState.updateWhereArgs.push([col, val]);
        return chain;
      }),
      execute: jest.fn(async () => {
        if (
          mockState.delivery &&
          conditions.every(([c, v]) => (mockState.delivery as any)[c] === v)
        ) {
          Object.assign(mockState.delivery, setValues);
        }
        return [];
      }),
    };
    return chain;
  }

  return {
    db: {
      selectFrom: jest.fn((table: string) => makeSelectChain(table)),
      insertInto: jest.fn(() => makeInsertChain()),
      updateTable: jest.fn(() => makeUpdateChain()),
    },
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { runDeliverWebhookJob } from "../deliver-webhook";
import { assertPublicHttpsUrl } from "../../lib/assert-public-https-url";

const PAYLOAD = {
  sessionId: "session-1",
  eventType: "test.event",
  partnerId: "partner-1",
};

function fetchCallHeader(callIndex: number, header: string): string {
  const init = (global.fetch as jest.Mock).mock.calls[callIndex][1];
  return init.headers[header];
}

function fetchCallBodyId(callIndex: number): string {
  const init = (global.fetch as jest.Mock).mock.calls[callIndex][1];
  return JSON.parse(init.body).id;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockState.partner = { id: "partner-1", webhook_url: "https://partner.example.com/hook" };
  mockState.delivery = undefined;
  mockState.updateWhereArgs = [];
  process.env.WEBHOOK_SIGNING_SECRET = "test-secret";

  let uuidCounter = 0;
  mockRandomUUID.mockImplementation(() => `generated-uuid-${++uuidCounter}`);
});

describe("runDeliverWebhookJob — retry identity", () => {
  it("sends the same eventId and X-Hearloop-Delivery header across 3 retry attempts, and targets the same delivery row", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValueOnce(new Error("network fail"))
      .mockRejectedValueOnce(new Error("network fail"))
      .mockResolvedValueOnce({ status: 200 } as Response) as any;

    // Attempts 1 and 2 fail delivery, so BullMQ would retry — simulate that
    // by calling the job function again with the identical payload.
    await expect(runDeliverWebhookJob(PAYLOAD)).rejects.toThrow(
      "Webhook delivery failed"
    );
    await expect(runDeliverWebhookJob(PAYLOAD)).rejects.toThrow(
      "Webhook delivery failed"
    );
    await expect(runDeliverWebhookJob(PAYLOAD)).resolves.toBeUndefined();

    expect(global.fetch).toHaveBeenCalledTimes(3);

    // (a) Same eventId (JSON body's `id`) across all 3 attempts.
    const eventIds = [0, 1, 2].map(fetchCallBodyId);
    expect(eventIds[0]).toBe(eventIds[1]);
    expect(eventIds[1]).toBe(eventIds[2]);

    // (b) Same X-Hearloop-Delivery header across all 3 attempts.
    const deliveryHeaders = [0, 1, 2].map((i) =>
      fetchCallHeader(i, "X-Hearloop-Delivery")
    );
    expect(deliveryHeaders[0]).toBe(deliveryHeaders[1]);
    expect(deliveryHeaders[1]).toBe(deliveryHeaders[2]);

    // (c) Every attempt's attempt_count/status update targeted the same,
    // real row id — not a locally-generated id that no longer matches a row.
    const idUpdateTargets = mockState.updateWhereArgs
      .filter(([col]) => col === "id")
      .map(([, val]) => val);
    expect(idUpdateTargets).toHaveLength(3);
    expect(new Set(idUpdateTargets).size).toBe(1);
    expect(idUpdateTargets[0]).toBe(deliveryHeaders[0]);

    // The row actually reflects 3 real attempts and ends up delivered —
    // proof the updates landed on the row, not on thin air.
    expect(mockState.delivery?.attempt_count).toBe(3);
    expect(mockState.delivery?.status).toBe("delivered");
  });

  it("does not fetch or write a delivery when the webhook URL is blocked", async () => {
    mockState.partner = {
      id: "partner-1",
      webhook_url: "https://blocked.example.com/hook",
    };
    global.fetch = jest.fn() as any;

    await expect(runDeliverWebhookJob(PAYLOAD)).rejects.toThrow(
      "blocked webhook URL"
    );

    expect(assertPublicHttpsUrl).toHaveBeenCalledWith(
      "https://blocked.example.com/hook"
    );
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockState.delivery).toBeUndefined();
  });

  it("signs a fixed timestamp and body with the expected literal HMAC", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-02T03:04:05.000Z"));
    global.fetch = jest.fn().mockResolvedValue({ status: 200 } as Response) as any;

    try {
      await runDeliverWebhookJob(PAYLOAD);
    } finally {
      jest.useRealTimers();
    }

    expect(fetchCallHeader(0, "X-Hearloop-Timestamp")).toBe("1767323045");
    expect(fetchCallHeader(0, "X-Hearloop-Signature")).toBe(
      "sha256=8cb8d5e0c6ff55b8b103f1c85dc64944598ebca8b561653c369f7076a0aaf765"
    );
  });

  it("records an HTTP 500 response and rejects before attempt seven", async () => {
    global.fetch = jest.fn().mockResolvedValue({ status: 500 } as Response) as any;

    await expect(runDeliverWebhookJob(PAYLOAD)).rejects.toThrow(
      "Webhook delivery failed: status=500"
    );

    expect(mockState.delivery).toMatchObject({
      status: "failed",
      attempt_count: 1,
      response_code: 500,
    });
  });

  it("marks attempt seven dead and resolves without requesting another retry", async () => {
    mockState.delivery = {
      id: "delivery-1",
      event_id: "event-1",
      partner_id: "partner-1",
      session_id: "session-1",
      event_type: "test.event",
      payload_json: "{}",
      status: "failed",
      attempt_count: 6,
      response_code: 500,
      last_attempted_at: new Date("2026-01-01T00:00:00.000Z"),
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    };
    global.fetch = jest.fn().mockResolvedValue({ status: 500 } as Response) as any;

    await expect(runDeliverWebhookJob(PAYLOAD)).resolves.toBeUndefined();

    expect(mockState.delivery).toMatchObject({
      status: "dead",
      attempt_count: 7,
      response_code: 500,
    });
  });
});
