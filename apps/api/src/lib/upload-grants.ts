import { createHash } from "crypto";

export interface VersionedUploadGrantRequest {
  uploadAttemptId: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface ParsedUploadGrantRequest {
  idempotencyKey: string;
  request: VersionedUploadGrantRequest;
}

export interface VersionedUploadGrantResponse {
  uploadId: string;
  uploadUrl: string;
  storageKey: string;
  expiresAt: string;
  requiredHeaders: {
    "Content-Type": string;
    "x-amz-checksum-sha256": string;
  };
}

export type UploadGrantErrorCode =
  | "invalid_upload_grant_request"
  | "upload_attempt_conflict"
  | "idempotency_key_reused"
  | "storage_unavailable";

export class UploadGrantError extends Error {
  readonly name = "UploadGrantError";

  constructor(
    readonly statusCode: 400 | 409 | 422 | 503,
    readonly errorCode: UploadGrantErrorCode
  ) {
    super(errorCode);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SUPPORTED_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/x-m4a",
  "audio/m4a",
]);

function invalidRequest(): never {
  throw new UploadGrantError(400, "invalid_upload_grant_request");
}

function isCanonicalSha256Base64(value: unknown): value is string {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    return false;
  }

  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength === 32 && decoded.toString("base64") === value;
}

export function parseUploadGrantRequest(
  idempotencyKey: unknown,
  body: unknown
): ParsedUploadGrantRequest {
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
    typeof candidate.uploadAttemptId !== "string" ||
    !UUID_REGEX.test(candidate.uploadAttemptId) ||
    typeof candidate.mimeType !== "string" ||
    !SUPPORTED_MIME_TYPES.has(candidate.mimeType) ||
    typeof candidate.sizeBytes !== "number" ||
    !Number.isSafeInteger(candidate.sizeBytes) ||
    candidate.sizeBytes < 1000 ||
    candidate.sizeBytes > 10_485_760 ||
    !isCanonicalSha256Base64(candidate.checksumSha256)
  ) {
    invalidRequest();
  }

  return {
    idempotencyKey,
    request: {
      uploadAttemptId: candidate.uploadAttemptId,
      mimeType: candidate.mimeType,
      sizeBytes: candidate.sizeBytes,
      checksumSha256: candidate.checksumSha256,
    },
  };
}

export function hashUploadGrantRequest(
  request: VersionedUploadGrantRequest
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        uploadAttemptId: request.uploadAttemptId,
        mimeType: request.mimeType,
        sizeBytes: request.sizeBytes,
        checksumSha256: request.checksumSha256,
      })
    )
    .digest("hex");
}
