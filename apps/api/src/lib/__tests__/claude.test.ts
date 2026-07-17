const mockInvokeBedrock = jest.fn();

jest.mock("../bedrock", () => ({
  invokeBedrock: mockInvokeBedrock,
}));

let analyzeTranscript: (typeof import("../claude"))["analyzeTranscript"];

beforeAll(() => {
  analyzeTranscript = require("../claude").analyzeTranscript;
});

beforeEach(() => {
  mockInvokeBedrock.mockReset();
});

describe("analyzeTranscript", () => {
  it("returns parsed Insights and normalized metrics from the shared Bedrock seam", async () => {
    mockInvokeBedrock.mockResolvedValue({
      text: JSON.stringify({
        sentiment: "negative",
        sentimentScore: 0.9,
        topics: ["wait_time"],
        urgency: "follow_up",
        summary: "The wait was too long.",
        qualityFlags: [],
        moderationFlags: [],
      }),
      inputTokens: 31,
      outputTokens: 17,
    });

    await expect(
      analyzeTranscript("the wait was way too long today")
    ).resolves.toEqual({
      sentiment: "negative",
      sentimentScore: 0.9,
      topics: ["wait_time"],
      urgency: "follow_up",
      summary: "The wait was too long.",
      qualityFlags: [],
      moderationFlags: [],
      modelUsed: "nova-lite",
      inputTokens: 31,
      outputTokens: 17,
    });

    expect(mockInvokeBedrock).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "us.amazon.nova-lite-v1:0",
        maxTokens: 120,
        temperature: 0,
      })
    );
  });

  it("throws instead of returning a fallback result when Nova Lite and Haiku both reject", async () => {
    mockInvokeBedrock.mockRejectedValue(new Error("Bedrock unavailable"));

    await expect(
      analyzeTranscript("the wait was way too long today")
    ).rejects.toThrow(
      "Both Nova Lite and Haiku failed: Bedrock unavailable"
    );

    expect(mockInvokeBedrock).toHaveBeenCalledTimes(2);
  });
});
