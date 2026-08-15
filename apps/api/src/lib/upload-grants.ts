import { createHash, randomUUID } from "crypto";
import { db } from "./db";
import {
  buildVersionedStorageKey,
  getVersionedUploadSignedUrl,
  VersionedUploadSignedUrlInput,
  VersionedUploadSignedUrlResult,
} from "./storage";

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

export interface UploadGrantRow {
  id: string;
  partner_id: string;
  session_id: string;
  upload_attempt_id: string;
  idempotency_key: string;
  request_hash: string;
  response_json: string;
  storage_bucket: string;
  storage_key: string;
  expected_mime_type: string;
  expected_size_bytes: number;
  expected_checksum_sha256: string;
  expires_at: Date;
}

export type NewUploadGrantRow = UploadGrantRow;

export interface UploadGrantDependencies {
  findByIdempotencyKey(
    sessionId: string,
    idempotencyKey: string
  ): Promise<UploadGrantRow | undefined>;
  findByAttemptId(
    sessionId: string,
    uploadAttemptId: string
  ): Promise<UploadGrantRow | undefined>;
  insertGrant(row: NewUploadGrantRow): Promise<void>;
  signUpload(
    input: VersionedUploadSignedUrlInput
  ): Promise<VersionedUploadSignedUrlResult>;
  createId(): string;
}

export interface IssueUploadGrantInput {
  partnerId: string;
  sessionId: string;
  idempotencyKey: unknown;
  body: unknown;
}

export interface IssueUploadGrantResult {
  response: VersionedUploadGrantResponse;
  replayed: boolean;
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

function parseStoredResponse(responseJson: string): VersionedUploadGrantResponse {
  try {
    const parsed = JSON.parse(responseJson) as Record<string, unknown>;
    const requiredHeaders = parsed.requiredHeaders as
      | Record<string, unknown>
      | undefined;
    if (
      typeof parsed.uploadId !== "string" ||
      parsed.uploadId.length === 0 ||
      typeof parsed.uploadUrl !== "string" ||
      parsed.uploadUrl.length === 0 ||
      typeof parsed.storageKey !== "string" ||
      parsed.storageKey.length === 0 ||
      typeof parsed.expiresAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.expiresAt)) ||
      typeof requiredHeaders !== "object" ||
      requiredHeaders === null ||
      typeof requiredHeaders["Content-Type"] !== "string" ||
      typeof requiredHeaders["x-amz-checksum-sha256"] !== "string"
    ) {
      throw new Error("invalid response");
    }

    return {
      uploadId: parsed.uploadId,
      uploadUrl: parsed.uploadUrl,
      storageKey: parsed.storageKey,
      expiresAt: parsed.expiresAt,
      requiredHeaders: {
        "Content-Type": requiredHeaders["Content-Type"],
        "x-amz-checksum-sha256":
          requiredHeaders["x-amz-checksum-sha256"],
      },
    };
  } catch {
    throw new UploadGrantError(503, "storage_unavailable");
  }
}

function replayOrRejectByKey(
  row: UploadGrantRow,
  requestHash: string
): IssueUploadGrantResult {
  if (row.request_hash !== requestHash) {
    throw new UploadGrantError(422, "idempotency_key_reused");
  }
  return { response: parseStoredResponse(row.response_json), replayed: true };
}

function replayOrRejectByAttempt(
  row: UploadGrantRow,
  requestHash: string
): IssueUploadGrantResult {
  if (row.request_hash !== requestHash) {
    throw new UploadGrantError(409, "upload_attempt_conflict");
  }
  return { response: parseStoredResponse(row.response_json), replayed: true };
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

export function createUploadGrantIssuer(dependencies: UploadGrantDependencies): {
  issue(input: IssueUploadGrantInput): Promise<IssueUploadGrantResult>;
} {
  return {
    async issue(input): Promise<IssueUploadGrantResult> {
      const { idempotencyKey, request } = parseUploadGrantRequest(
        input.idempotencyKey,
        input.body
      );
      const requestHash = hashUploadGrantRequest(request);

      const existingByKey = await dependencies.findByIdempotencyKey(
        input.sessionId,
        idempotencyKey
      );
      if (existingByKey) {
        return replayOrRejectByKey(existingByKey, requestHash);
      }

      const existingByAttempt = await dependencies.findByAttemptId(
        input.sessionId,
        request.uploadAttemptId
      );
      if (existingByAttempt) {
        return replayOrRejectByAttempt(existingByAttempt, requestHash);
      }

      const grantId = dependencies.createId();
      const storageKey = buildVersionedStorageKey({
        partnerId: input.partnerId,
        sessionId: input.sessionId,
        uploadId: request.uploadAttemptId,
        mimeType: request.mimeType,
      });

      let signedUpload: VersionedUploadSignedUrlResult;
      try {
        signedUpload = await dependencies.signUpload({
          storageKey,
          mimeType: request.mimeType,
          checksumSha256: request.checksumSha256,
          expiresInSeconds: 900,
        });
      } catch {
        throw new UploadGrantError(503, "storage_unavailable");
      }

      const response: VersionedUploadGrantResponse = {
        uploadId: grantId,
        uploadUrl: signedUpload.uploadUrl,
        storageKey: signedUpload.key,
        expiresAt: signedUpload.expiresAt.toISOString(),
        requiredHeaders: signedUpload.requiredHeaders,
      };
      const row: NewUploadGrantRow = {
        id: grantId,
        partner_id: input.partnerId,
        session_id: input.sessionId,
        upload_attempt_id: request.uploadAttemptId,
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        response_json: JSON.stringify(response),
        storage_bucket: signedUpload.bucket,
        storage_key: signedUpload.key,
        expected_mime_type: request.mimeType,
        expected_size_bytes: request.sizeBytes,
        expected_checksum_sha256: request.checksumSha256,
        expires_at: signedUpload.expiresAt,
      };

      try {
        await dependencies.insertGrant(row);
      } catch (error) {
        if (!isPostgresUniqueViolation(error)) throw error;

        const winnerByKey = await dependencies.findByIdempotencyKey(
          input.sessionId,
          idempotencyKey
        );
        if (winnerByKey) {
          return replayOrRejectByKey(winnerByKey, requestHash);
        }

        const winnerByAttempt = await dependencies.findByAttemptId(
          input.sessionId,
          request.uploadAttemptId
        );
        if (winnerByAttempt) {
          return replayOrRejectByAttempt(winnerByAttempt, requestHash);
        }

        throw error;
      }

      return { response, replayed: false };
    },
  };
}

const UPLOAD_GRANT_COLUMNS = [
  "id",
  "partner_id",
  "session_id",
  "upload_attempt_id",
  "idempotency_key",
  "request_hash",
  "response_json",
  "storage_bucket",
  "storage_key",
  "expected_mime_type",
  "expected_size_bytes",
  "expected_checksum_sha256",
  "expires_at",
] as const;

const productionIssuer = createUploadGrantIssuer({
  async findByIdempotencyKey(sessionId, idempotencyKey) {
    return db
      .selectFrom("upload_grants")
      .select(UPLOAD_GRANT_COLUMNS)
      .where("session_id", "=", sessionId)
      .where("idempotency_key", "=", idempotencyKey)
      .executeTakeFirst();
  },
  async findByAttemptId(sessionId, uploadAttemptId) {
    return db
      .selectFrom("upload_grants")
      .select(UPLOAD_GRANT_COLUMNS)
      .where("session_id", "=", sessionId)
      .where("upload_attempt_id", "=", uploadAttemptId)
      .executeTakeFirst();
  },
  async insertGrant(row) {
    await db.insertInto("upload_grants").values(row).execute();
  },
  signUpload: getVersionedUploadSignedUrl,
  createId: randomUUID,
});

export async function issueVersionedUploadGrant(
  input: IssueUploadGrantInput
): Promise<IssueUploadGrantResult> {
  return productionIssuer.issue(input);
}
