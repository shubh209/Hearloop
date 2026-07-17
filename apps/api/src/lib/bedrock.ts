import {
  BedrockRuntimeClient,
  ConverseCommand,
  type Message,
  type Tool,
  type ToolChoice,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION ?? "us-east-2",
  credentials: {
    accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY!,
  },
});

interface InvokeBedrockInput {
  modelId: string;
  system: string;
  messages: Message[];
  tools?: Tool[];
  toolChoice?: ToolChoice;
  maxTokens: number;
  temperature: number;
}

interface InvokeBedrockOutput {
  text?: string;
  toolInput?: unknown;
  inputTokens?: number;
  outputTokens?: number;
}

export async function invokeBedrock({
  modelId,
  system,
  messages,
  tools,
  toolChoice,
  maxTokens,
  temperature,
}: InvokeBedrockInput): Promise<InvokeBedrockOutput> {
  const response = await client.send(
    new ConverseCommand({
      modelId,
      system: [{ text: system }],
      messages,
      toolConfig: tools ? { tools, toolChoice } : undefined,
      inferenceConfig: { maxTokens, temperature },
    })
  );
  const content = response.output?.message?.content ?? [];
  const text = content.map((block) => block.text ?? "").join("") || undefined;
  const toolInput = content.find((block) => block.toolUse)?.toolUse?.input;

  return {
    text,
    toolInput,
    inputTokens: response.usage?.inputTokens,
    outputTokens: response.usage?.outputTokens,
  };
}
