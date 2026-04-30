// hearloop/apps/api/src/lib/claude.ts

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

// Model IDs
// Replace model IDs with cross-region inference profile IDs
const NOVA_LITE = "us.amazon.nova-lite-v1:0";
const HAIKU_FALLBACK = "us.anthropic.claude-haiku-4-5-20251001-v1:0";

// Fixed taxonomy from spec §11
export const VALID_TOPICS = [
  "staff_friendliness",
  "wait_time",
  "service_quality",
  "price",
  "cleanliness",
  "ease_of_booking",
  "communication",
  "professionalism",
  "speed",
  "other",
] as const;

export type Topic = (typeof VALID_TOPICS)[number];
export type SentimentLabel = "positive" | "neutral" | "negative";
export type UrgencyLabel = "none" | "follow_up" | "urgent";

export interface AnalysisResult {
  sentiment: SentimentLabel;
  sentimentScore: number;
  topics: Topic[];
  urgency: UrgencyLabel;
  summary: string;
  qualityFlags: string[];
  moderationFlags: string[];
  modelUsed?: string;
}

// Optimized system prompt — ~150 tokens vs original ~300
const SYSTEM_PROMPT = `You are a feedback classifier. Return ONLY a JSON object, no markdown, no explanation.

Schema:
{
  "sentiment": "positive"|"neutral"|"negative",
  "sentimentScore": 0.0-1.0,
  "topics": [array from: staff_friendliness|wait_time|service_quality|price|cleanliness|ease_of_booking|communication|professionalism|speed|other],
  "urgency": "none"|"follow_up"|"urgent",
  "summary": "max one sentence",
  "qualityFlags": [low_confidence|too_short|off_topic|inaudible|non_speech],
  "moderationFlags": [profanity|threat|abuse]
}

Rules: topics only from allowed list. urgency=urgent means safety/strong anger. urgency=follow_up means complaint. Empty transcript = qualityFlags:["inaudible"].`;

// --- Nova Lite invocation ---
async function invokeNovaLite(transcript: string): Promise<string> {
  const userContent = transcript.trim()
    ? `Classify this feedback transcript: "${transcript.trim()}"`
    : `Classify this feedback transcript: [empty]`;

  const requestBody = {
    messages: [{ role: "user", content: [{ text: userContent }] }],
    system: [{ text: SYSTEM_PROMPT }],
    inferenceConfig: {
      max_new_tokens: 250, // Optimized — JSON output ~150 tokens
      temperature: 0.0,    // Deterministic output
    },
  };

  const command = new InvokeModelCommand({
    modelId: NOVA_LITE,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(requestBody),
  });

  const response = await client.send(command);
  const body = JSON.parse(new TextDecoder().decode(response.body));
  return body.output?.message?.content?.[0]?.text ?? "";
}

// --- Haiku fallback invocation ---
async function invokeHaiku(transcript: string): Promise<string> {
  const userContent = transcript.trim()
    ? `Classify this feedback transcript: "${transcript.trim()}"`
    : `Classify this feedback transcript: [empty]`;

  const requestBody = {
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 250,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  };

  const command = new InvokeModelCommand({
    modelId: HAIKU_FALLBACK,
    contentType: "application/json",
    accept: "application/json",
    body: JSON.stringify(requestBody),
  });

  const response = await client.send(command);
  const body = JSON.parse(new TextDecoder().decode(response.body));
  return body.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("");
}

// --- Main export ---
export async function analyzeTranscript(
  transcript: string,
  options: { languageHint?: string } = {}
): Promise<AnalysisResult> {

  // Try Nova Lite first
  try {
    const raw = await invokeNovaLite(transcript);
    const result = parseAnalysis(raw);

    // If parse succeeded return with model tag
    if (!result.qualityFlags.includes("parse_error")) {
      return { ...result, modelUsed: "nova-lite" };
    }

    // Parse failed — fall through to Haiku
    console.warn("Nova Lite returned invalid JSON — falling back to Haiku");
  } catch (err: any) {
    console.warn("Nova Lite failed:", err.message, "— falling back to Haiku");
  }

  // Haiku fallback
  try {
    const raw = await invokeHaiku(transcript);
    const result = parseAnalysis(raw);
    return { ...result, modelUsed: "haiku-fallback" };
  } catch (err: any) {
    console.error("Haiku fallback also failed:", err.message);
    return { ...fallbackAnalysis("model_error"), modelUsed: "none" };
  }
}

// --- helpers ---

function parseAnalysis(raw: string): AnalysisResult {
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return fallbackAnalysis("parse_error");
  }

  const topics: Topic[] = (parsed.topics ?? []).filter((t: string) =>
    VALID_TOPICS.includes(t as Topic)
  );

  return {
    sentiment: sanitizeSentiment(parsed.sentiment),
    sentimentScore: clamp(parsed.sentimentScore ?? 0.5, 0, 1),
    topics: topics.length > 0 ? topics : ["other"],
    urgency: sanitizeUrgency(parsed.urgency),
    summary: (parsed.summary ?? "").slice(0, 280),
    qualityFlags: Array.isArray(parsed.qualityFlags) ? parsed.qualityFlags : [],
    moderationFlags: Array.isArray(parsed.moderationFlags)
      ? parsed.moderationFlags
      : [],
  };
}

function sanitizeSentiment(val: any): SentimentLabel {
  if (["positive", "neutral", "negative"].includes(val)) return val;
  return "neutral";
}

function sanitizeUrgency(val: any): UrgencyLabel {
  if (["none", "follow_up", "urgent"].includes(val)) return val;
  return "none";
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function fallbackAnalysis(reason: string): AnalysisResult {
  return {
    sentiment: "neutral",
    sentimentScore: 0.5,
    topics: ["other"],
    urgency: "none",
    summary: "",
    qualityFlags: [reason],
    moderationFlags: [],
  };
}