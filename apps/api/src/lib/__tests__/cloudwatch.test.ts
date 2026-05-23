// hearloop/apps/api/src/lib/__tests__/cloudwatch.test.ts
//
// Property-based tests for lib/cloudwatch.ts using fast-check.
// All properties are tested without making real AWS calls.
//
// Properties covered:
//   Property 1 — Missing CLOUDWATCH_REGION causes module load failure (Req 1.2)
//   Property 2 — Credential alias priority resolution (Req 1.3)
//   Property 4 — Emit payload shape: 4 metrics, ModelId+Outcome dims, no SessionId (Req 2.2, 2.3, 2.7)
//   Property 5 — Latency computation: BedrockLatencyMs = Date.now() - startTimestamp (Req 2.6)
//   Property 6 — ModelId dimension mapping for nova-lite and haiku-fallback (Req 2.3)

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that touch the module under test
// ---------------------------------------------------------------------------

// We mock @aws-sdk/client-cloudwatch so CloudWatchClient.prototype.send is
// controllable and no real AWS calls are made.
const mockSend = jest.fn();

jest.mock("@aws-sdk/client-cloudwatch", () => {
  const actual = jest.requireActual("@aws-sdk/client-cloudwatch");
  return {
    ...actual,
    CloudWatchClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import * as fc from "fast-check";
import { PutMetricDataCommand } from "@aws-sdk/client-cloudwatch";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Load (or reload) lib/cloudwatch.ts with the given env vars set.
 * Clears the module registry first so top-level module code re-runs.
 */
function loadCloudwatch(env: Record<string, string | undefined>) {
  // Save and restore env around the require
  const saved: Record<string, string | undefined> = {};
  const keys = [
    "CLOUDWATCH_REGION",
    "BEDROCK_ACCESS_KEY_ID",
    "AWS_ACCESS_KEY_ID",
    "STORAGE_ACCESS_KEY_ID",
    "BEDROCK_SECRET_ACCESS_KEY",
    "AWS_SECRET_ACCESS_KEY",
    "STORAGE_SECRET_ACCESS_KEY",
    "CLOUDWATCH_NAMESPACE",
  ];

  for (const k of keys) {
    saved[k] = process.env[k];
    if (k in env) {
      if (env[k] === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = env[k];
      }
    } else {
      delete process.env[k];
    }
  }

  jest.resetModules();
  // Re-apply the mock after resetModules so the fresh require still gets it
  jest.mock("@aws-sdk/client-cloudwatch", () => {
    const actual = jest.requireActual("@aws-sdk/client-cloudwatch");
    return {
      ...actual,
      CloudWatchClient: jest.fn().mockImplementation(() => ({
        send: mockSend,
      })),
    };
  });

  let mod: typeof import("../cloudwatch") | undefined;
  let loadError: Error | undefined;
  try {
    mod = require("../cloudwatch");
  } catch (e) {
    loadError = e as Error;
  }

  // Restore env
  for (const k of keys) {
    if (saved[k] === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = saved[k];
    }
  }

  return { mod, loadError };
}

// ---------------------------------------------------------------------------
// Property 1: Missing CLOUDWATCH_REGION causes module load failure
// Validates: Requirements 1.2
// ---------------------------------------------------------------------------

describe("Property 1: Missing CLOUDWATCH_REGION causes module load failure", () => {
  /**
   * **Validates: Requirements 1.2**
   *
   * For any absent or empty-string CLOUDWATCH_REGION, importing the module
   * SHALL throw before constructing CloudWatchClient.
   */
  it("throws on absent or empty CLOUDWATCH_REGION for any valid credential set", () => {
    fc.assert(
      fc.property(
        // Generate absent (undefined) or empty-string CLOUDWATCH_REGION values
        fc.oneof(
          fc.constant(undefined),
          fc.constant(""),
          fc.stringMatching(/^\s+$/) // whitespace-only strings
        ),
        // Always provide valid credentials so the only failure is the region
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ""),
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ""),
        (badRegion, accessKey, secretKey) => {
          const { loadError } = loadCloudwatch({
            CLOUDWATCH_REGION: badRegion,
            BEDROCK_ACCESS_KEY_ID: accessKey,
            BEDROCK_SECRET_ACCESS_KEY: secretKey,
          });
          expect(loadError).toBeDefined();
          expect(loadError!.message).toMatch(/CLOUDWATCH_REGION/);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Credential alias priority resolution
// Validates: Requirements 1.3
// ---------------------------------------------------------------------------

describe("Property 2: Credential alias priority resolution", () => {
  /**
   * **Validates: Requirements 1.3**
   *
   * For any combination of the three access key aliases where at least one is
   * non-empty, the CloudWatchClient SHALL be initialised with the value from
   * the highest-priority alias (BEDROCK_ACCESS_KEY_ID → AWS_ACCESS_KEY_ID →
   * STORAGE_ACCESS_KEY_ID).
   */
  it("uses the highest-priority non-empty access key alias", () => {
    // Arbitraries for optional (possibly absent) credential values
    const optionalKey = fc.oneof(
      fc.constant(undefined),
      fc.constant(""),
      fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== "")
    );

    fc.assert(
      fc.property(
        optionalKey, // BEDROCK_ACCESS_KEY_ID
        optionalKey, // AWS_ACCESS_KEY_ID
        optionalKey, // STORAGE_ACCESS_KEY_ID
        fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim() !== ""), // secret (always valid)
        (bedrockKey, awsKey, storageKey, secretKey) => {
          // Determine the expected winning key (first non-empty in priority order)
          const candidates = [
            { name: "BEDROCK_ACCESS_KEY_ID", value: bedrockKey },
            { name: "AWS_ACCESS_KEY_ID", value: awsKey },
            { name: "STORAGE_ACCESS_KEY_ID", value: storageKey },
          ];
          const winner = candidates.find(
            (c) => c.value !== undefined && c.value.trim() !== ""
          );

          if (!winner) {
            // No valid key — module should throw; skip this combination
            return;
          }

          const { CloudWatchClient } = require("@aws-sdk/client-cloudwatch");
          (CloudWatchClient as jest.Mock).mockClear();

          const { loadError } = loadCloudwatch({
            CLOUDWATCH_REGION: "us-east-2",
            BEDROCK_ACCESS_KEY_ID: bedrockKey,
            AWS_ACCESS_KEY_ID: awsKey,
            STORAGE_ACCESS_KEY_ID: storageKey,
            BEDROCK_SECRET_ACCESS_KEY: secretKey,
          });

          // Module should load successfully
          expect(loadError).toBeUndefined();

          // CloudWatchClient should have been constructed with the winning key
          const { CloudWatchClient: CWC } = require("@aws-sdk/client-cloudwatch");
          expect(CWC).toHaveBeenCalled();
          const constructorArgs = (CWC as jest.Mock).mock.calls[0][0];
          expect(constructorArgs.credentials.accessKeyId).toBe(winner.value);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Setup for Properties 4, 5, 6 — load module once with valid env
// ---------------------------------------------------------------------------

// Set required env vars before the module is loaded for emit tests
const VALID_ENV = {
  CLOUDWATCH_REGION: "us-east-2",
  BEDROCK_ACCESS_KEY_ID: "test-access-key",
  BEDROCK_SECRET_ACCESS_KEY: "test-secret-key",
  CLOUDWATCH_NAMESPACE: "Hearloop/Pipeline",
};

let emitBedrockInvocation: (typeof import("../cloudwatch"))["emitBedrockInvocation"];

beforeAll(() => {
  // Apply env vars
  for (const [k, v] of Object.entries(VALID_ENV)) {
    process.env[k] = v;
  }
  jest.resetModules();
  jest.mock("@aws-sdk/client-cloudwatch", () => {
    const actual = jest.requireActual("@aws-sdk/client-cloudwatch");
    return {
      ...actual,
      CloudWatchClient: jest.fn().mockImplementation(() => ({
        send: mockSend,
      })),
    };
  });
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  emitBedrockInvocation = require("../cloudwatch").emitBedrockInvocation;
});

beforeEach(() => {
  mockSend.mockReset();
  mockSend.mockResolvedValue({});
});

afterAll(() => {
  for (const k of Object.keys(VALID_ENV)) {
    delete process.env[k];
  }
});

// ---------------------------------------------------------------------------
// Property 4: Emit payload shape
// Validates: Requirements 2.2, 2.3, 2.7
// ---------------------------------------------------------------------------

describe("Property 4: Emit payload shape", () => {
  /**
   * **Validates: Requirements 2.2, 2.3, 2.7**
   *
   * For any valid BedrockInvocationMetric, emitBedrockInvocation() SHALL issue
   * exactly one PutMetricData call with exactly 4 MetricDatum items, each
   * carrying exactly ModelId and Outcome dimensions, and no SessionId dimension.
   */
  it("issues exactly one PutMetricData call with 4 MetricDatum items, ModelId+Outcome dims, no SessionId", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          modelUsed: fc.constantFrom("nova-lite" as const, "haiku-fallback" as const),
          startTimestamp: fc.integer({ min: 0, max: Date.now() }),
          inputTokens: fc.nat({ max: 100_000 }),
          outputTokens: fc.nat({ max: 100_000 }),
        }),
        async (metric) => {
          mockSend.mockReset();
          mockSend.mockResolvedValue({});

          await emitBedrockInvocation(metric);

          // Exactly one send() call
          expect(mockSend).toHaveBeenCalledTimes(1);

          const command: PutMetricDataCommand = mockSend.mock.calls[0][0];
          const metricData = command.input.MetricData!;

          // Exactly 4 MetricDatum items
          expect(metricData).toHaveLength(4);

          for (const datum of metricData) {
            const dims = datum.Dimensions!;

            // Each datum has exactly 2 dimensions
            expect(dims).toHaveLength(2);

            const dimNames = dims.map((d) => d.Name);

            // Must have ModelId and Outcome
            expect(dimNames).toContain("ModelId");
            expect(dimNames).toContain("Outcome");

            // Must NOT have SessionId
            expect(dimNames).not.toContain("SessionId");
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Latency computation
// Validates: Requirements 2.6
// ---------------------------------------------------------------------------

describe("Property 5: Latency computation", () => {
  /**
   * **Validates: Requirements 2.6**
   *
   * For any startTimestamp ≤ Date.now(), BedrockLatencyMs SHALL equal
   * Date.now() - startTimestamp at emission time, including 0.
   */
  it("BedrockLatencyMs equals the fixed Date.now() minus startTimestamp", async () => {
    await fc.assert(
      fc.asyncProperty(
        // startTimestamp is any value from 0 up to a fixed "now"
        fc.integer({ min: 0, max: 1_700_000_000_000 }),
        async (startTimestamp) => {
          // Fix Date.now() to a value that is always >= startTimestamp
          const fixedNow = 1_700_000_000_000; // a fixed epoch well above startTimestamp range
          const dateSpy = jest.spyOn(Date, "now").mockReturnValue(fixedNow);

          mockSend.mockReset();
          mockSend.mockResolvedValue({});

          try {
            await emitBedrockInvocation({
              modelUsed: "nova-lite",
              startTimestamp,
              inputTokens: 10,
              outputTokens: 5,
            });

            const command: PutMetricDataCommand = mockSend.mock.calls[0][0];
            const latencyDatum = command.input.MetricData!.find(
              (d) => d.MetricName === "BedrockLatencyMs"
            )!;

            expect(latencyDatum.Value).toBe(fixedNow - startTimestamp);
          } finally {
            dateSpy.mockRestore();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  it("emits BedrockLatencyMs of 0 when startTimestamp equals Date.now()", async () => {
    const fixedNow = 1_700_000_000_000;
    const dateSpy = jest.spyOn(Date, "now").mockReturnValue(fixedNow);

    try {
      await emitBedrockInvocation({
        modelUsed: "nova-lite",
        startTimestamp: fixedNow,
        inputTokens: 0,
        outputTokens: 0,
      });

      const command: PutMetricDataCommand = mockSend.mock.calls[0][0];
      const latencyDatum = command.input.MetricData!.find(
        (d) => d.MetricName === "BedrockLatencyMs"
      )!;

      expect(latencyDatum.Value).toBe(0);
    } finally {
      dateSpy.mockRestore();
    }
  });
});

// ---------------------------------------------------------------------------
// Property 6: ModelId dimension mapping
// Validates: Requirements 2.3
// ---------------------------------------------------------------------------

describe("Property 6: ModelId dimension mapping", () => {
  /**
   * **Validates: Requirements 2.3**
   *
   * nova-lite maps to "us.amazon.nova-lite-v1:0",
   * haiku-fallback maps to "us.anthropic.claude-haiku-4-5-20251001-v1:0".
   */
  it("maps nova-lite to the correct full Bedrock model ID for any token counts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        async (inputTokens, outputTokens) => {
          mockSend.mockReset();
          mockSend.mockResolvedValue({});

          await emitBedrockInvocation({
            modelUsed: "nova-lite",
            startTimestamp: 0,
            inputTokens,
            outputTokens,
          });

          const command: PutMetricDataCommand = mockSend.mock.calls[0][0];
          const firstDatum = command.input.MetricData![0];
          const modelIdDim = firstDatum.Dimensions!.find((d) => d.Name === "ModelId")!;

          expect(modelIdDim.Value).toBe("us.amazon.nova-lite-v1:0");
        }
      ),
      { numRuns: 100 }
    );
  });

  it("maps haiku-fallback to the correct full Bedrock model ID for any token counts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat({ max: 100_000 }),
        fc.nat({ max: 100_000 }),
        async (inputTokens, outputTokens) => {
          mockSend.mockReset();
          mockSend.mockResolvedValue({});

          await emitBedrockInvocation({
            modelUsed: "haiku-fallback",
            startTimestamp: 0,
            inputTokens,
            outputTokens,
          });

          const command: PutMetricDataCommand = mockSend.mock.calls[0][0];
          const firstDatum = command.input.MetricData![0];
          const modelIdDim = firstDatum.Dimensions!.find((d) => d.Name === "ModelId")!;

          expect(modelIdDim.Value).toBe("us.anthropic.claude-haiku-4-5-20251001-v1:0");
        }
      ),
      { numRuns: 100 }
    );
  });
});
