// hearloop/apps/api/src/lib/parse-insights-query.ts

export type InsightsQueryIntent = "count" | "list" | "quote";

export type InsightsQuerySentiment = "positive" | "neutral" | "negative";

export interface InsightsQueryFilters {
  from?: Date;
  to?: Date;
  sentiment?: InsightsQuerySentiment;
  targetKey?: string;
}

export interface ParsedInsightsQuery {
  intent: InsightsQueryIntent | string;
  filters: InsightsQueryFilters;
}

const ALLOWED_FILTER_KEYS = new Set([
  "from",
  "to",
  "sentiment",
  "targetKey",
]);

const SENTIMENTS = new Set<InsightsQuerySentiment>([
  "positive",
  "neutral",
  "negative",
]);

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export class InsightsQueryParseError extends Error {
  readonly name = "InsightsQueryParseError";
  readonly statusCode = 400 as const;

  constructor(message?: string) {
    super(message ?? "invalid insights query");
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

function parseError(): never {
  throw new InsightsQueryParseError();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIso8601Date(value: unknown): Date | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed;
}

function parseFilters(
  raw: unknown,
  intent: string
): InsightsQueryFilters {
  if (!isPlainObject(raw)) {
    parseError();
  }

  for (const key of Object.keys(raw)) {
    if (!ALLOWED_FILTER_KEYS.has(key)) {
      parseError();
    }
  }

  const filters: InsightsQueryFilters = {};

  if ("sentiment" in raw) {
    const sentiment = raw.sentiment;
    if (
      typeof sentiment !== "string" ||
      !SENTIMENTS.has(sentiment as InsightsQuerySentiment)
    ) {
      parseError();
    }
    filters.sentiment = sentiment as InsightsQuerySentiment;
  }

  if ("targetKey" in raw) {
    const targetKey = raw.targetKey;
    if (typeof targetKey !== "string" || targetKey.length === 0) {
      parseError();
    }
    filters.targetKey = targetKey;
  }

  if ("from" in raw) {
    const from = parseIso8601Date(raw.from);
    if (!from) {
      parseError();
    }
    filters.from = from;
  }

  if ("to" in raw) {
    const to = parseIso8601Date(raw.to);
    if (!to) {
      parseError();
    }
    filters.to = to;
  }

  if (intent === "count" && (!filters.from || !filters.to)) {
    parseError();
  }

  return filters;
}

export function parseInsightsQuery(body: unknown): ParsedInsightsQuery {
  if (!isPlainObject(body)) {
    parseError();
  }

  const { intent, filters } = body;

  if (typeof intent !== "string" || intent.length === 0) {
    parseError();
  }

  if (!("filters" in body) || !isPlainObject(filters)) {
    parseError();
  }

  return {
    intent,
    filters: parseFilters(filters, intent),
  };
}

export function isRangeTooWide(from: Date, to: Date): boolean {
  const windowMs = to.getTime() - from.getTime();
  return to.getTime() <= from.getTime() || windowMs > NINETY_DAYS_MS;
}
