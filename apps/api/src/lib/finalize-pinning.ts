import { createHash } from "crypto";

export interface VersionedFinalizePinRequest {
  uploadId: string;
  versionId: string;
  etag: string;
  languageHint: string;
  promptText: string;
  durationMs: number | null;
}

export interface ParsedFinalizePinRequest {
  idempotencyKey: string;
  request: VersionedFinalizePinRequest;
}

export type FinalizePinErrorCode =
  | "invalid_finalize_request"
  | "upload_attempt_conflict"
  | "idempotency_key_reused"
  | "integrity_mismatch"
  | "storage_unavailable";

export class FinalizePinError extends Error {
  readonly name = "FinalizePinError";

  constructor(
    readonly statusCode: 400 | 409 | 422 | 503,
    readonly errorCode: FinalizePinErrorCode
  ) {
    super(errorCode);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalidRequest(): never {
  throw new FinalizePinError(400, "invalid_finalize_request");
}

export function parseFinalizePinRequest(
  idempotencyKey: unknown,
  body: unknown
): ParsedFinalizePinRequest {
  if (
    typeof idempotencyKey !== "string" ||
    !/^[\x21-\x7e]{8,128}$/.test(idempotencyKey) ||
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body)
  ) {
    invalidRequest();
  }

  try {
    const serialized = JSON.stringify(body);
    if (
      typeof serialized !== "string" ||
      Buffer.byteLength(serialized, "utf8") > 1024
    ) {
      invalidRequest();
    }
  } catch {
    invalidRequest();
  }

  const candidate = body as Record<string, unknown>;
  if (
    typeof candidate.uploadId !== "string" ||
    !UUID_REGEX.test(candidate.uploadId) ||
    typeof candidate.versionId !== "string" ||
    Buffer.byteLength(candidate.versionId, "utf8") < 1 ||
    Buffer.byteLength(candidate.versionId, "utf8") > 1024 ||
    typeof candidate.etag !== "string" ||
    candidate.etag.trim().length < 1 ||
    candidate.etag.length > 128
  ) {
    invalidRequest();
  }

  if (
    candidate.languageHint !== undefined &&
    typeof candidate.languageHint !== "string"
  ) {
    invalidRequest();
  }
  if (
    candidate.promptText !== undefined &&
    typeof candidate.promptText !== "string"
  ) {
    invalidRequest();
  }
  if (candidate.durationMs !== undefined) {
    if (
      typeof candidate.durationMs !== "number" ||
      !Number.isSafeInteger(candidate.durationMs) ||
      candidate.durationMs < 0
    ) {
      invalidRequest();
    }
  }

  return {
    idempotencyKey,
    request: {
      uploadId: candidate.uploadId,
      versionId: candidate.versionId,
      etag: candidate.etag,
      languageHint:
        typeof candidate.languageHint === "string" ? candidate.languageHint : "",
      promptText:
        typeof candidate.promptText === "string" ? candidate.promptText : "",
      durationMs:
        typeof candidate.durationMs === "number" ? candidate.durationMs : null,
    },
  };
}

export function hashFinalizePinRequest(
  request: VersionedFinalizePinRequest
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        uploadId: request.uploadId,
        versionId: request.versionId,
        etag: request.etag,
        languageHint: request.languageHint,
        promptText: request.promptText,
        durationMs: request.durationMs,
      })
    )
    .digest("hex");
}
