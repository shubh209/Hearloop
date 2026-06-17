// hearloop/apps/api/src/lib/summarize-business-context.ts
//
// Bedrock summarization for imported website markdown → business_context draft.

import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const client = new BedrockRuntimeClient({
  region: process.env.BEDROCK_REGION ?? "us-east-2",
  credentials: {
    accessKeyId: process.env.BEDROCK_ACCESS_KEY_ID!,
    secretAccessKey: process.env.BEDROCK_SECRET_ACCESS_KEY!,
  },
});

const NOVA_LITE = "us.amazon.nova-lite-v1:0";
const MAX_OUTPUT_CHARS = 500;

const SYSTEM_PROMPT = `You write short business descriptions for a voice feedback analytics product.
Output plain text only, max 500 characters, no markdown, no bullet lists.
Focus on what the business does, who customers are, and what service dimensions matter for feedback (wait time, staff, pricing, quality).`;

export class SummarizeError extends Error {
  readonly code = "summarize_error";

  constructor(message: string) {
    super(message);
    this.name = "SummarizeError";
  }
}

export interface SummarizeResult {
  draftContext: string;
  modelUsed: string;
  inputTokens?: number;
  outputTokens?: number;
}

export async function summarizeBusinessContext(
  markdown: string,
  title: string | null
): Promise<SummarizeResult> {
  const userMessage = [
    title ? `Site title: ${title}` : null,
    "Page content:",
    markdown,
  ]
    .filter(Boolean)
    .join("\n\n");

  const requestBody = {
    messages: [{ role: "user", content: [{ text: userMessage }] }],
    system: [{ text: SYSTEM_PROMPT }],
    inferenceConfig: {
      maxTokens: 180,
      temperature: 0.2,
    },
  };

  try {
    const command = new InvokeModelCommand({
      modelId: NOVA_LITE,
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify(requestBody),
    });

    const response = await client.send(command);
    const body = JSON.parse(new TextDecoder().decode(response.body));
    const text = (body.output?.message?.content?.[0]?.text ?? "")
      .trim()
      .slice(0, MAX_OUTPUT_CHARS);

    if (!text) {
      throw new SummarizeError("empty summary from model");
    }

    return {
      draftContext: text,
      modelUsed: "nova-lite",
      inputTokens: body.usage?.inputTokens,
      outputTokens: body.usage?.outputTokens,
    };
  } catch (err: any) {
    if (err instanceof SummarizeError) throw err;
    throw new SummarizeError(err?.message ?? "bedrock invoke failed");
  }
}
