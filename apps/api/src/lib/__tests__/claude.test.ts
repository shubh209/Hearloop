// hearloop/apps/api/src/lib/__tests__/claude.test.ts
//
// Ticket 002 — analyzeTranscript must throw (not silently return a fake
// "success" result) when both Nova Lite and Haiku fail.

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that touch the module under test
// ---------------------------------------------------------------------------

// We mock @aws-sdk/client-bedrock-runtime so BedrockRuntimeClient.prototype.send
// is controllable and no real AWS calls are made.
const mockSend = jest.fn();

jest.mock("@aws-sdk/client-bedrock-runtime", () => {
  const actual = jest.requireActual("@aws-sdk/client-bedrock-runtime");
  return {
    ...actual,
    BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
      send: mockSend,
    })),
  };
});

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------
//
// claude.ts constructs BedrockRuntimeClient eagerly at module-load time, and
// that load happens before the `mockSend` declaration above runs (babel
// hoists `jest.mock`/`import` above other top-level statements). Requiring
// the module lazily, after `mockSend` is initialized, avoids the resulting
// "Cannot access 'mockSend' before initialization" error.
let analyzeTranscript: (typeof import("../claude"))["analyzeTranscript"];

beforeAll(() => {
  analyzeTranscript = require("../claude").analyzeTranscript;
});

beforeEach(() => {
  mockSend.mockReset();
});

describe("analyzeTranscript — both models fail", () => {
  it("throws instead of returning a fallback result when Nova Lite and Haiku both reject", async () => {
    mockSend.mockRejectedValue(new Error("Bedrock unavailable"));

    await expect(
      analyzeTranscript("the wait was way too long today")
    ).rejects.toThrow();
  });
});
