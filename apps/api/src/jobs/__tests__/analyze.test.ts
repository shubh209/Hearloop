// hearloop/apps/api/src/jobs/__tests__/analyze.test.ts
//
// Tests for the emit guard in jobs/analyze.ts.
//
// Tasks covered:
//   5.2 — Property tests (fast-check): emit skipped for modelUsed="none",
//          emit called exactly once for "nova-lite" / "haiku-fallback"
//   5.3 — Unit tests: emit failure is non-fatal, warn log shape, ordering
//
// Properties covered:
//   Property 3a: Emit skipped when modelUsed is "none"
//   Property 3b: Emit called exactly once for success/fallback

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that touch the modules under test
// ---------------------------------------------------------------------------

// Logger mock: we need a stable object that analyze.ts's top-level
// `const log = jobLogger("analyze")` captures, AND that our tests can
// assert on. The trick: define a plain object at module scope (not jest.fn,
// so it's not reset by clearAllMocks), and assign jest.fn() properties to it.
// The factory returns this same object every time jobLogger() is called.
const logMock = {
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
};

// jest.mock is hoisted by Babel. The factory can safely reference `logMock`
// because plain object literals (not const/let declarations) are available
// at hoist time when defined at the very top of the module scope.
// However, to be safe we use jest.requireActual pattern and avoid any
// variable that might not be initialized at hoist time.
// The safest approach: inline the mock fns inside the factory, then
// expose them via a shared reference we populate in beforeAll.
jest.mock("../../lib/logger", () => ({
  jobLogger: jest.fn().mockReturnValue({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  }),
}));

// analyzeTranscript — returns a controllable AnalysisResult
const mockAnalyzeTranscript = jest.fn();
jest.mock("../../lib/claude", () => ({
  analyzeTranscript: (...args: unknown[]) => mockAnalyzeTranscript(...args),
}));

// emitBedrockInvocation — spy on call count and allow rejection
const mockEmitBedrockInvocation = jest.fn();
jest.mock("../../lib/cloudwatch", () => ({
  emitBedrockInvocation: (...args: unknown[]) =>
    mockEmitBedrockInvocation(...args),
}));

// db — mock the Kysely query builder chains used in analyze.ts
const mockExecuteTakeFirst = jest.fn();
const mockExecute          = jest.fn();

// Builder returned by selectFrom(...).innerJoin(...).select(...).where(...)
const mockSelectChain = {
  innerJoin: jest.fn().mockReturnThis(),
  select:    jest.fn().mockReturnThis(),
  where:     jest.fn().mockReturnThis(),
  executeTakeFirst: mockExecuteTakeFirst,
};

// Builder returned by updateTable(...).set(...).where(...)
const mockUpdateChain = {
  set:     jest.fn().mockReturnThis(),
  where:   jest.fn().mockReturnThis(),
  execute: mockExecute,
};

jest.mock("../../lib/db", () => ({
  db: {
    selectFrom: jest.fn((table: string) => {
      // Both the partner-context lookup and the partner_id lookup inside
      // enqueueWebhookDelivery use selectFrom — return the same chain.
      return mockSelectChain;
    }),
    updateTable: jest.fn(() => mockUpdateChain),
  },
}));

// queue — mock enqueueWebhook (used via dynamic import inside analyze.ts)
const mockEnqueueWebhook = jest.fn();
jest.mock("../../lib/queue", () => ({
  enqueueWebhook: (...args: unknown[]) => mockEnqueueWebhook(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as fc from "fast-check";
import { runAnalyzeJob } from "../analyze";
import type { AnalysisResult } from "../../lib/claude";
import { jobLogger } from "../../lib/logger";

// Grab the stable logger instance that analyze.ts captured at module load.
// jobLogger is mocked to return the same object every call (mockReturnValue),
// so .mock.results[0].value is the exact object that `log` in analyze.ts holds.
const log = (jobLogger as jest.Mock).mock.results[0]?.value as {
  info: jest.Mock; warn: jest.Mock; error: jest.Mock;
};
const mockInfo  = log?.info  as jest.Mock;
const mockWarn  = log?.warn  as jest.Mock;
const mockError = log?.error as jest.Mock;

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** A minimal AnalysisResult with modelUsed overridden. */
function makeAnalysis(modelUsed: string): AnalysisResult {
  return {
    sentiment:       "neutral",
    sentimentScore:  0,
    topics:          [],
    urgency:         "low" as any,
    qualityFlags:    [],
    moderationFlags: [],
    summary:         "",
    modelUsed,
    inputTokens:     10,
    outputTokens:    5,
  };
}

/** A minimal valid job payload. */
const BASE_PAYLOAD = {
  sessionId:  "session-abc",
  transcript: "the service was great",
};

// ---------------------------------------------------------------------------
// beforeEach — reset all mocks to a clean, successful state
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();

  // Restore chain mocks after clearAllMocks() resets mockReturnThis()
  mockSelectChain.innerJoin.mockReturnThis();
  mockSelectChain.select.mockReturnThis();
  mockSelectChain.where.mockReturnThis();
  mockUpdateChain.set.mockReturnThis();
  mockUpdateChain.where.mockReturnThis();

  // DB: partner-context lookup returns null (non-fatal, analysis proceeds)
  mockExecuteTakeFirst.mockResolvedValue(null);
  // DB: update queries succeed
  mockExecute.mockResolvedValue([]);

  // analyzeTranscript: default to nova-lite success
  mockAnalyzeTranscript.mockResolvedValue(makeAnalysis("nova-lite"));

  // emitBedrockInvocation: default to success
  mockEmitBedrockInvocation.mockResolvedValue(undefined);

  // enqueueWebhook: default to success
  mockEnqueueWebhook.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Property 3a: Emit skipped when modelUsed is "none"
// Validates: Requirements 2.1, 4.2
// ---------------------------------------------------------------------------

describe("Property 3a: Emit skipped when modelUsed is 'none'", () => {
  /**
   * **Validates: Requirements 2.1, 4.2**
   *
   * For any job payload where analyzeTranscript returns { modelUsed: "none" },
   * emitBedrockInvocation SHALL NOT be called.
   */
  it("never calls emitBedrockInvocation for any payload when modelUsed is 'none'", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate varied transcripts (at least 2 words so the job doesn't
        // short-circuit before calling analyzeTranscript)
        fc.tuple(
          fc.string({ minLength: 1, maxLength: 40 }),
          fc.string({ minLength: 1, maxLength: 40 })
        ).map(([a, b]) => `${a} ${b}`),
        // Optional languageHint
        fc.option(fc.string({ minLength: 2, maxLength: 5 }), { nil: undefined }),
        async (transcript, languageHint) => {
          jest.clearAllMocks();
          mockExecuteTakeFirst.mockResolvedValue(null);
          mockExecute.mockResolvedValue([]);
          mockEnqueueWebhook.mockResolvedValue(undefined);
          mockEmitBedrockInvocation.mockResolvedValue(undefined);

          // analyzeTranscript always returns modelUsed: "none"
          mockAnalyzeTranscript.mockResolvedValue(makeAnalysis("none"));

          await runAnalyzeJob({ sessionId: "s-none", transcript, languageHint });

          // The emit guard must have blocked the call
          expect(mockEmitBedrockInvocation).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3b: Emit called exactly once for success/fallback
// Validates: Requirements 2.1, 4.2
// ---------------------------------------------------------------------------

describe("Property 3b: Emit called exactly once for 'nova-lite' or 'haiku-fallback'", () => {
  /**
   * **Validates: Requirements 2.1, 4.2**
   *
   * For any modelUsed of "nova-lite" or "haiku-fallback",
   * emitBedrockInvocation SHALL be called exactly once per runAnalyzeJob call.
   */
  it("calls emitBedrockInvocation exactly once for any nova-lite or haiku-fallback result", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Pick one of the two valid model aliases
        fc.constantFrom("nova-lite" as const, "haiku-fallback" as const),
        // Varied token counts
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        async (modelUsed, inputTokens, outputTokens) => {
          jest.clearAllMocks();
          mockExecuteTakeFirst.mockResolvedValue(null);
          mockExecute.mockResolvedValue([]);
          mockEnqueueWebhook.mockResolvedValue(undefined);
          mockEmitBedrockInvocation.mockResolvedValue(undefined);

          mockAnalyzeTranscript.mockResolvedValue({
            ...makeAnalysis(modelUsed),
            inputTokens,
            outputTokens,
          });

          await runAnalyzeJob({ ...BASE_PAYLOAD, sessionId: `s-${modelUsed}` });

          // Must be called exactly once — not zero, not twice
          expect(mockEmitBedrockInvocation).toHaveBeenCalledTimes(1);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ---------------------------------------------------------------------------
// Task 5.3 — Unit tests
// ---------------------------------------------------------------------------

describe("Unit tests: emit wiring in runAnalyzeJob", () => {
  // ── 5.3.1 ─────────────────────────────────────────────────────────────────
  describe("emit failure does NOT throw from runAnalyzeJob", () => {
    it("session reaches completed status and enqueueWebhook is called even when emitBedrockInvocation rejects", async () => {
      // emitBedrockInvocation rejects — this must be swallowed
      mockEmitBedrockInvocation.mockRejectedValue(new Error("CW timeout"));
      mockAnalyzeTranscript.mockResolvedValue(makeAnalysis("nova-lite"));

      // enqueueWebhookDelivery does a selectFrom("sessions") to get partner_id.
      // Return null for the partner-context lookup (first call), then a valid
      // session row for the webhook lookup (second call).
      mockExecuteTakeFirst
        .mockResolvedValueOnce(null)                          // partner context lookup
        .mockResolvedValueOnce({ partner_id: "partner-1" }); // webhook session lookup

      // Should NOT throw
      await expect(
        runAnalyzeJob(BASE_PAYLOAD)
      ).resolves.toBeUndefined();

      // Give the fire-and-forget .catch() a tick to execute
      await new Promise((r) => setImmediate(r));

      // Session must have been marked completed
      const { db } = require("../../lib/db");
      const updateCalls: string[] = (db.updateTable as jest.Mock).mock.calls.map(
        (c: [string]) => c[0]
      );
      expect(updateCalls).toContain("sessions");

      // The set() call on sessions must include status: "completed"
      const sessionSetCall = mockUpdateChain.set.mock.calls.find((args: [Record<string, unknown>]) =>
        args[0]?.status === "completed"
      );
      expect(sessionSetCall).toBeDefined();

      // enqueueWebhook must still have been called
      expect(mockEnqueueWebhook).toHaveBeenCalledTimes(1);
    });
  });

  // ── 5.3.2 ─────────────────────────────────────────────────────────────────
  describe("warn log shape when emit fails", () => {
    it("logs warn with sessionId, err.message, and metric payload when emitBedrockInvocation rejects", async () => {
      const analysis = makeAnalysis("nova-lite");
      mockAnalyzeTranscript.mockResolvedValue(analysis);
      mockEmitBedrockInvocation.mockRejectedValue(new Error("CW timeout"));

      await runAnalyzeJob(BASE_PAYLOAD);

      // Give the fire-and-forget .catch() a tick to execute
      await new Promise((r) => setImmediate(r));

      // Find the warn call that contains the cloudwatch failure context
      const warnCalls: [Record<string, unknown>, string][] = mockWarn.mock.calls;
      const cwWarnCall = warnCalls.find(
        ([ctx]) =>
          typeof ctx === "object" &&
          ctx !== null &&
          "err" in ctx &&
          ctx.err === "CW timeout"
      );

      expect(cwWarnCall).toBeDefined();

      const [ctx] = cwWarnCall!;
      expect(ctx).toMatchObject({
        sessionId: BASE_PAYLOAD.sessionId,
        err:       "CW timeout",
        metric: {
          modelUsed:    analysis.modelUsed,
          inputTokens:  analysis.inputTokens,
          outputTokens: analysis.outputTokens,
        },
      });
    });
  });

  // ── 5.3.3 ─────────────────────────────────────────────────────────────────
  describe("log.info('analysis complete') is called before emitBedrockInvocation", () => {
    it("info log fires before the emit is attempted", async () => {
      const callOrder: string[] = [];

      mockInfo.mockImplementation((_ctx: unknown, msg: string) => {
        if (msg === "analysis complete") callOrder.push("info:analysis-complete");
      });

      mockEmitBedrockInvocation.mockImplementation(() => {
        callOrder.push("emit");
        return Promise.resolve();
      });

      mockAnalyzeTranscript.mockResolvedValue(makeAnalysis("nova-lite"));

      await runAnalyzeJob(BASE_PAYLOAD);

      // Both events must have been recorded
      expect(callOrder).toContain("info:analysis-complete");
      expect(callOrder).toContain("emit");

      // info must come before emit
      expect(callOrder.indexOf("info:analysis-complete")).toBeLessThan(
        callOrder.indexOf("emit")
      );
    });
  });
});
