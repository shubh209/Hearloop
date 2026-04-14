import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Fixed taxonomy from spec §11 — never let these drift
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
  sentimentScore: number;        // 0.0 - 1.0
  topics: Topic[];
  urgency: UrgencyLabel;
  summary: string;               // ≤ 1 sentence
  qualityFlags: string[];        // e.g. ["low_confidence", "too_short"]
  moderationFlags: string[];     // e.g. ["profanity", "threat"]
}

const SYSTEM_PROMPT = `You are a feedback analysis engine for a business voice feedback platform.

Analyze the transcript and return ONLY valid JSON matching this exact schema:
{
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": number (0.0 to 1.0, strength of sentiment),
  "topics": array of strings from ONLY this list: [${VALID_TOPICS.join(", ")}],
  "urgency": "none" | "follow_up" | "urgent",
  "summary": "one sentence max",
  "qualityFlags": array of strings (use: "low_confidence", "too_short", "off_topic", "inaudible", "non_speech"),
  "moderationFlags": array of strings (use: "profanity", "threat", "abuse", empty array if none)
}

Rules:
- Return ONLY the JSON object. No markdown, no explanation, no preamble.
- topics must only contain values from the allowed list above.
- sentimentScore reflects intensity: 0.9 = very positive/negative, 0.5 = mild.
- If transcript is empty or unintelligible, set qualityFlags: ["inaudible"] and sentiment: "neutral".
- urgency "urgent" = safety concern or strong anger. "follow_up" = complaint needing response.`;

export async function analyzeTranscript(
  transcript: string,
  options: { languageHint?: string } = {}
): Promise<AnalysisResult> {
  const userContent = transcript.trim()
    ? `Transcript: "${transcript.trim()}"`
    : `Transcript: [empty — no speech detected]`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const raw = message.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");

  return parseAnalysis(raw);
}

// --- helpers ---

function parseAnalysis(raw: string): AnalysisResult {
  const cleaned = raw.replace(/```json|```/g, "").trim();

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Haiku returned something unexpected — return safe fallback
    return fallbackAnalysis("parse_error");
  }

  // Sanitize topics — strip any values not in taxonomy
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