"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_TOPICS = void 0;
exports.analyzeTranscript = analyzeTranscript;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const client = new sdk_1.default({
    apiKey: process.env.ANTHROPIC_API_KEY,
});
// Fixed taxonomy from spec §11 — never let these drift
exports.VALID_TOPICS = [
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
];
const SYSTEM_PROMPT = `You are a feedback analysis engine for a business voice feedback platform.

Analyze the transcript and return ONLY valid JSON matching this exact schema:
{
  "sentiment": "positive" | "neutral" | "negative",
  "sentimentScore": number (0.0 to 1.0, strength of sentiment),
  "topics": array of strings from ONLY this list: [${exports.VALID_TOPICS.join(", ")}],
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
async function analyzeTranscript(transcript, options = {}) {
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
        .map((b) => b.text)
        .join("");
    return parseAnalysis(raw);
}
// --- helpers ---
function parseAnalysis(raw) {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    let parsed;
    try {
        parsed = JSON.parse(cleaned);
    }
    catch {
        // Haiku returned something unexpected — return safe fallback
        return fallbackAnalysis("parse_error");
    }
    // Sanitize topics — strip any values not in taxonomy
    const topics = (parsed.topics ?? []).filter((t) => exports.VALID_TOPICS.includes(t));
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
function sanitizeSentiment(val) {
    if (["positive", "neutral", "negative"].includes(val))
        return val;
    return "neutral";
}
function sanitizeUrgency(val) {
    if (["none", "follow_up", "urgent"].includes(val))
        return val;
    return "none";
}
function clamp(n, min, max) {
    return Math.min(Math.max(n, min), max);
}
function fallbackAnalysis(reason) {
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
