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

let invokeBedrock: (typeof import("../bedrock"))["invokeBedrock"];

beforeAll(() => {
  invokeBedrock = require("../bedrock").invokeBedrock;
});

beforeEach(() => {
  mockSend.mockReset();
});

it("normalizes Converse text, tool input, and token usage", async () => {
  mockSend.mockResolvedValue({
    output: {
      message: {
        role: "assistant",
        content: [
          { text: "plain response" },
          {
            toolUse: {
              toolUseId: "tool-use-1",
              name: "record_analysis",
              input: { sentiment: "negative" },
            },
          },
        ],
      },
    },
    usage: { inputTokens: 21, outputTokens: 8, totalTokens: 29 },
  });

  await expect(
    invokeBedrock({
      modelId: "test-model",
      system: "system prompt",
      messages: [{ role: "user", content: [{ text: "user prompt" }] }],
      tools: [
        {
          toolSpec: {
            name: "record_analysis",
            inputSchema: { json: { type: "object" } },
          },
        },
      ],
      toolChoice: { tool: { name: "record_analysis" } },
      maxTokens: 120,
      temperature: 0,
    })
  ).resolves.toEqual({
    text: "plain response",
    toolInput: { sentiment: "negative" },
    inputTokens: 21,
    outputTokens: 8,
  });

  expect(mockSend).toHaveBeenCalledTimes(1);
  expect(mockSend.mock.calls[0][0].input).toEqual({
    modelId: "test-model",
    system: [{ text: "system prompt" }],
    messages: [{ role: "user", content: [{ text: "user prompt" }] }],
    toolConfig: {
      tools: [
        {
          toolSpec: {
            name: "record_analysis",
            inputSchema: { json: { type: "object" } },
          },
        },
      ],
      toolChoice: { tool: { name: "record_analysis" } },
    },
    inferenceConfig: { maxTokens: 120, temperature: 0 },
  });
});
