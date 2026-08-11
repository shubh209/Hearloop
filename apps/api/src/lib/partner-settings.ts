import {
  assertPublicHttpsUrl,
  SsrfBlockedError,
} from "./assert-public-https-url";

export const BUSINESS_CONTEXT_SOURCES = [
  "manual",
  "template",
  "import",
  "import_edited",
] as const;

export type BusinessContextSource = (typeof BUSINESS_CONTEXT_SOURCES)[number];

export class PartnerSettingsValidationError extends Error {
  readonly error: string;

  constructor(error: string, message?: string) {
    super(message ?? error);
    this.name = "PartnerSettingsValidationError";
    this.error = error;
  }
}

export interface PartnerSettingsInput {
  webhookUrl?: string | null;
  allowedOrigins?: string | null;
  businessContext?: string | null;
  websiteUrl?: string | null;
  businessContextSource?: string | null;
}

export interface PartnerSettingsUpdate {
  webhookUrl?: string | null;
  allowedOrigins?: string | null;
  businessContext?: string | null;
  websiteUrl?: string | null;
  businessContextSource?: BusinessContextSource | null;
}

function requirePublicHttps(rawUrl: string): string {
  try {
    assertPublicHttpsUrl(rawUrl);
    return rawUrl.trim();
  } catch (err) {
    if (err instanceof SsrfBlockedError) {
      throw new PartnerSettingsValidationError(err.code, err.message);
    }
    throw err;
  }
}

export function validatePartnerSettingsInput(
  body: PartnerSettingsInput
): PartnerSettingsUpdate {
  const update: PartnerSettingsUpdate = {};

  if (body.webhookUrl !== undefined) {
    update.webhookUrl =
      body.webhookUrl && body.webhookUrl.trim()
        ? requirePublicHttps(body.webhookUrl)
        : null;
  }

  if (body.allowedOrigins !== undefined) {
    if (!body.allowedOrigins || !body.allowedOrigins.trim()) {
      update.allowedOrigins = null;
    } else {
      const origins = body.allowedOrigins
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      for (const origin of origins) {
        try {
          const parsed = new URL(origin);
          if (!parsed.origin || parsed.origin === "null") throw new Error("invalid");
        } catch {
          throw new PartnerSettingsValidationError(
            `invalid origin: "${origin}" — must be a full origin like https://example.com`
          );
        }
      }
      update.allowedOrigins = origins.join(",");
    }
  }

  if (body.businessContext !== undefined) {
    update.businessContext = body.businessContext
      ? body.businessContext.trim().slice(0, 500)
      : null;
  }

  if (body.websiteUrl !== undefined) {
    update.websiteUrl =
      body.websiteUrl && body.websiteUrl.trim()
        ? requirePublicHttps(body.websiteUrl)
        : null;
  }

  if (body.businessContextSource !== undefined) {
    if (
      body.businessContextSource !== null &&
      !(BUSINESS_CONTEXT_SOURCES as readonly string[]).includes(
        body.businessContextSource
      )
    ) {
      throw new PartnerSettingsValidationError("invalid_business_context_source");
    }
    update.businessContextSource =
      body.businessContextSource as BusinessContextSource | null;
  }

  return update;
}
