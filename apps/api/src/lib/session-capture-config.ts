export type SessionCaptureTarget = {
  label: string;
  key: string;
  source: "capture-link";
};

export type SessionCaptureConfig = {
  promptText?: string;
  consentRequired: boolean;
  consentText?: string;
  target?: SessionCaptureTarget | null;
};

export type LegacyValidationHandoff = {
  state: "pending" | "enqueued";
  languageHint?: string;
};

const LEGACY_VALIDATION_HANDOFF_KEY = "_hearloopValidationHandoff";

type BuildSessionMetadataInput = {
  promptText?: string;
  consentRequired?: boolean;
  consentText?: string;
  target?: SessionCaptureTarget | null;
  metadata?: Record<string, unknown>;
};

export class InvalidSessionCaptureConfigError extends Error {
  constructor() {
    super("Persisted Session capture configuration is malformed");
    this.name = "InvalidSessionCaptureConfigError";
  }
}

export function buildSessionMetadata({
  metadata,
  promptText,
  consentRequired = false,
  consentText,
  target = null,
}: BuildSessionMetadataInput): string {
  return JSON.stringify({
    ...metadata,
    [LEGACY_VALIDATION_HANDOFF_KEY]: undefined,
    promptText,
    consentRequired,
    consentText,
    target,
  });
}

export function readSessionCaptureConfig(
  metadataJson: string | null | undefined
): SessionCaptureConfig {
  if (metadataJson == null) {
    return { consentRequired: false, target: null };
  }

  const metadata = parseSessionMetadata(metadataJson);

  if (
    metadata.consentRequired !== undefined &&
    typeof metadata.consentRequired !== "boolean"
  ) {
    throw new InvalidSessionCaptureConfigError();
  }
  if (!isOptionalString(metadata.promptText)) {
    throw new InvalidSessionCaptureConfigError();
  }
  if (!isOptionalString(metadata.consentText)) {
    throw new InvalidSessionCaptureConfigError();
  }

  const target = readTarget(metadata.target);

  return {
    promptText:
      typeof metadata.promptText === "string" ? metadata.promptText : undefined,
    consentRequired: metadata.consentRequired ?? false,
    consentText:
      typeof metadata.consentText === "string"
        ? metadata.consentText
        : undefined,
    target,
  };
}

export function readLegacyValidationHandoff(
  metadataJson: string | null | undefined
): LegacyValidationHandoff | null {
  if (metadataJson == null) {
    return null;
  }
  const metadata = parseSessionMetadata(metadataJson);
  const value = metadata[LEGACY_VALIDATION_HANDOFF_KEY];
  if (value === undefined || value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    (value.state !== "pending" && value.state !== "enqueued") ||
    !isOptionalString(value.languageHint)
  ) {
    throw new InvalidSessionCaptureConfigError();
  }
  return {
    state: value.state,
    languageHint:
      typeof value.languageHint === "string" ? value.languageHint : undefined,
  };
}

export function writeLegacyValidationHandoff(
  metadataJson: string | null | undefined,
  handoff: LegacyValidationHandoff
): string {
  const metadata = metadataJson == null ? {} : parseSessionMetadata(metadataJson);
  return JSON.stringify({
    ...metadata,
    [LEGACY_VALIDATION_HANDOFF_KEY]: handoff,
  });
}

export function isFinalizeConsentValid(
  config: Pick<SessionCaptureConfig, "consentRequired">,
  consentGiven: boolean | undefined
): boolean {
  return !config.consentRequired || consentGiven === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSessionMetadata(metadataJson: string): Record<string, unknown> {
  let metadata: unknown;
  try {
    metadata = JSON.parse(metadataJson);
  } catch {
    throw new InvalidSessionCaptureConfigError();
  }
  if (!isRecord(metadata)) {
    throw new InvalidSessionCaptureConfigError();
  }
  return metadata;
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function readTarget(value: unknown): SessionCaptureTarget | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    typeof value.label !== "string" ||
    typeof value.key !== "string" ||
    value.source !== "capture-link"
  ) {
    throw new InvalidSessionCaptureConfigError();
  }
  return {
    label: value.label,
    key: value.key,
    source: "capture-link",
  };
}
