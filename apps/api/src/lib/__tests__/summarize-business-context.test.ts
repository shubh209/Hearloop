const mockInvokeBedrock = jest.fn();

jest.mock("../bedrock", () => ({
  invokeBedrock: mockInvokeBedrock,
}));

let summarizeBusinessContext: (typeof import("../summarize-business-context"))["summarizeBusinessContext"];
let SummarizeError: (typeof import("../summarize-business-context"))["SummarizeError"];

beforeAll(() => {
  const module = require("../summarize-business-context");
  summarizeBusinessContext = module.summarizeBusinessContext;
  SummarizeError = module.SummarizeError;
});

beforeEach(() => {
  mockInvokeBedrock.mockReset();
});

describe("summarizeBusinessContext", () => {
  it("returns trimmed, truncated text and normalized metrics from the shared Bedrock seam", async () => {
    mockInvokeBedrock.mockResolvedValue({
      text: `  ${"x".repeat(510)}  `,
      inputTokens: 44,
      outputTokens: 19,
    });

    await expect(
      summarizeBusinessContext("# Services\nOil changes", "Acme Auto")
    ).resolves.toEqual({
      draftContext: "x".repeat(500),
      modelUsed: "nova-lite",
      inputTokens: 44,
      outputTokens: 19,
    });

    expect(mockInvokeBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "us.amazon.nova-lite-v1:0",
        messages: [
          {
            role: "user",
            content: [
              {
                text: "Site title: Acme Auto\n\nPage content:\n\n# Services\nOil changes",
              },
            ],
          },
        ],
        maxTokens: 180,
        temperature: 0.2,
      })
    );
  });

  it("preserves the summarizer error contract for an empty model response", async () => {
    mockInvokeBedrock.mockResolvedValue({});

    await expect(
      summarizeBusinessContext("Page content", null)
    ).rejects.toEqual(
      expect.objectContaining({
        name: "SummarizeError",
        code: "summarize_error",
        message: "empty summary from model",
      })
    );
    expect(SummarizeError).toBeDefined();
  });
});
