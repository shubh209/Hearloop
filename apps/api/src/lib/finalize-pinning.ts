import { createHash, randomUUID } from "crypto";
import { db } from "./db";
import { enqueueValidate } from "./queue";
import {
  headVersion,
  StorageError,
  StorageVersionRef,
  VersionedObjectMetadata,
} from "./storage";

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

export interface FinalizePinInput {
  partnerId: string;
  sessionId: string;
  maxDurationSec: number;
  idempotencyKey: unknown;
  body: unknown;
}

export interface FinalizePinResult {
  response: { sessionId: string; status: "submitted" };
  responseStatus: 200;
  replayed: boolean;
}

export interface FinalizeGrantRow {
  id: string;
  partner_id: string;
  session_id: string;
  storage_bucket: string;
  storage_key: string;
  expected_mime_type: string;
  expected_size_bytes: number;
  expected_checksum_sha256: string;
  state: "available" | "cleanup_claimed" | "pinned" | "cleaned";
}

export interface FinalizeReceiptRow {
  id: string;
  partner_id: string;
  session_id: string;
  upload_grant_id: string;
  idempotency_key: string;
  request_hash: string;
  status: "verifying" | "completed";
  response_status: number | null;
  response_json: string | null;
  verification_lease_until: Date | null;
}

export interface RecordingPinRow {
  id: string;
  session_id: string;
  upload_grant_id: string | null;
  object_version_id: string | null;
}

export interface FinalizePinDependencies {
  now(): Date;
  createId(): string;
  findReceipt(
    sessionId: string,
    idempotencyKey: string
  ): Promise<FinalizeReceiptRow | undefined>;
  insertVerifyingReceipt(row: {
    id: string;
    partner_id: string;
    session_id: string;
    upload_grant_id: string;
    idempotency_key: string;
    request_hash: string;
    verification_lease_token: string;
    verification_lease_until: Date;
  }): Promise<void>;
  completeReceipt(
    id: string,
    responseStatus: number,
    responseJson: string
  ): Promise<void>;
  deleteReceipt(id: string): Promise<void>;
  findGrant(
    partnerId: string,
    sessionId: string,
    uploadId: string
  ): Promise<FinalizeGrantRow | undefined>;
  findRecording(sessionId: string): Promise<RecordingPinRow | undefined>;
  persistPin(input: {
    sessionId: string;
    grant: FinalizeGrantRow;
    metadata: VersionedObjectMetadata;
    durationMs: number | null;
    recordingId: string;
    pinnedAt: Date;
  }): Promise<void>;
  headVersion(ref: StorageVersionRef): Promise<VersionedObjectMetadata>;
  enqueueValidate(payload: {
    sessionId: string;
    storageKey: string;
    mimeType: string;
    languageHint?: string;
    promptText?: string;
    maxDurationSec?: number;
  }): Promise<void>;
}

const SUCCESS_STATUS = "submitted" as const;
const LEASE_MS = 30_000;

function conflict(): never {
  throw new FinalizePinError(409, "upload_attempt_conflict");
}

function integrityFailure(): never {
  throw new FinalizePinError(422, "integrity_mismatch");
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "23505"
  );
}

function normalizeEtag(etag: string): string {
  return etag.replace(/"/g, "");
}

function parseStoredFinalizeResponse(
  responseJson: string
): FinalizePinResult["response"] {
  try {
    const parsed = JSON.parse(responseJson) as Record<string, unknown>;
    if (
      typeof parsed.sessionId !== "string" ||
      parsed.status !== SUCCESS_STATUS
    ) {
      throw new Error("invalid response");
    }
    return { sessionId: parsed.sessionId, status: SUCCESS_STATUS };
  } catch {
    throw new FinalizePinError(503, "storage_unavailable");
  }
}

function replayCompleted(row: FinalizeReceiptRow): FinalizePinResult {
  if (typeof row.response_json !== "string") {
    throw new FinalizePinError(503, "storage_unavailable");
  }
  return {
    response: parseStoredFinalizeResponse(row.response_json),
    responseStatus: 200,
    replayed: true,
  };
}

function applyExistingReceipt(
  row: FinalizeReceiptRow,
  requestHash: string,
  now: Date
): FinalizePinResult | "takeover" {
  if (row.request_hash !== requestHash) {
    throw new FinalizePinError(422, "idempotency_key_reused");
  }
  if (row.status === "completed") {
    return replayCompleted(row);
  }
  if (
    row.verification_lease_until &&
    row.verification_lease_until.getTime() > now.getTime()
  ) {
    conflict();
  }
  return "takeover";
}

function grantMatchesHead(
  grant: FinalizeGrantRow,
  metadata: VersionedObjectMetadata,
  request: VersionedFinalizePinRequest
): boolean {
  return (
    metadata.versionId === request.versionId &&
    normalizeEtag(metadata.etag) === normalizeEtag(request.etag) &&
    metadata.mimeType === grant.expected_mime_type &&
    metadata.sizeBytes === grant.expected_size_bytes &&
    metadata.checksumSha256 === grant.expected_checksum_sha256
  );
}

export function createFinalizePinner(dependencies: FinalizePinDependencies): {
  pin(input: FinalizePinInput): Promise<FinalizePinResult>;
} {
  return {
    async pin(input): Promise<FinalizePinResult> {
      const { idempotencyKey, request } = parseFinalizePinRequest(
        input.idempotencyKey,
        input.body
      );
      const requestHash = hashFinalizePinRequest(request);
      const now = dependencies.now();
      const successBody = {
        sessionId: input.sessionId,
        status: SUCCESS_STATUS,
      };
      const successJson = JSON.stringify(successBody);

      let existing = await dependencies.findReceipt(
        input.sessionId,
        idempotencyKey
      );
      let receiptId: string | undefined;
      if (existing) {
        const outcome = applyExistingReceipt(existing, requestHash, now);
        if (outcome !== "takeover") return outcome;
        receiptId = existing.id;
      }

      const grant = await dependencies.findGrant(
        input.partnerId,
        input.sessionId,
        request.uploadId
      );
      if (!grant) {
        throw new FinalizePinError(400, "invalid_finalize_request");
      }
      if (grant.state === "cleaned" || grant.state === "cleanup_claimed") {
        conflict();
      }

      const recording = await dependencies.findRecording(input.sessionId);
      if (
        recording &&
        ((recording.upload_grant_id &&
          recording.upload_grant_id !== grant.id) ||
          (recording.object_version_id &&
            recording.object_version_id !== request.versionId))
      ) {
        conflict();
      }

      if (!receiptId) {
        receiptId = dependencies.createId();
        try {
          await dependencies.insertVerifyingReceipt({
            id: receiptId,
            partner_id: input.partnerId,
            session_id: input.sessionId,
            upload_grant_id: grant.id,
            idempotency_key: idempotencyKey,
            request_hash: requestHash,
            verification_lease_token: dependencies.createId(),
            verification_lease_until: new Date(now.getTime() + LEASE_MS),
          });
        } catch (error) {
          if (!isPostgresUniqueViolation(error)) throw error;
          const winner = await dependencies.findReceipt(
            input.sessionId,
            idempotencyKey
          );
          if (!winner) throw error;
          const outcome = applyExistingReceipt(winner, requestHash, now);
          if (outcome !== "takeover") return outcome;
          receiptId = winner.id;
        }
      }

      let metadata: VersionedObjectMetadata;
      try {
        metadata = await dependencies.headVersion({
          bucket: grant.storage_bucket,
          key: grant.storage_key,
          versionId: request.versionId,
        });
      } catch (error) {
        await dependencies.deleteReceipt(receiptId);
        if (error instanceof StorageError && error.retryable) {
          throw new FinalizePinError(503, "storage_unavailable");
        }
        throw new FinalizePinError(422, "integrity_mismatch");
      }

      if (!grantMatchesHead(grant, metadata, request)) {
        await dependencies.deleteReceipt(receiptId);
        integrityFailure();
      }

      await dependencies.persistPin({
        sessionId: input.sessionId,
        grant,
        metadata,
        durationMs: request.durationMs,
        recordingId: recording?.id ?? dependencies.createId(),
        pinnedAt: now,
      });
      await dependencies.completeReceipt(receiptId, 200, successJson);
      await dependencies.enqueueValidate({
        sessionId: input.sessionId,
        storageKey: grant.storage_key,
        mimeType: metadata.mimeType,
        ...(request.languageHint ? { languageHint: request.languageHint } : {}),
        ...(request.promptText ? { promptText: request.promptText } : {}),
        maxDurationSec: input.maxDurationSec,
      });

      return {
        response: successBody,
        responseStatus: 200,
        replayed: false,
      };
    },
  };
}

const GRANT_COLUMNS = [
  "id",
  "partner_id",
  "session_id",
  "storage_bucket",
  "storage_key",
  "expected_mime_type",
  "expected_size_bytes",
  "expected_checksum_sha256",
  "state",
] as const;

const productionPinner = createFinalizePinner({
  now: () => new Date(),
  createId: randomUUID,
  async findReceipt(sessionId, idempotencyKey) {
    return db
      .selectFrom("finalize_receipts")
      .select([
        "id",
        "partner_id",
        "session_id",
        "upload_grant_id",
        "idempotency_key",
        "request_hash",
        "status",
        "response_status",
        "response_json",
        "verification_lease_until",
      ])
      .where("session_id", "=", sessionId)
      .where("idempotency_key", "=", idempotencyKey)
      .executeTakeFirst();
  },
  async insertVerifyingReceipt(row) {
    await db
      .insertInto("finalize_receipts")
      .values({
        ...row,
        status: "verifying",
        response_status: null,
        response_json: null,
      })
      .execute();
  },
  async completeReceipt(id, responseStatus, responseJson) {
    await db
      .updateTable("finalize_receipts")
      .set({
        status: "completed",
        response_status: responseStatus,
        response_json: responseJson,
        verification_lease_token: null,
        verification_lease_until: null,
        updated_at: new Date(),
      })
      .where("id", "=", id)
      .execute();
  },
  async deleteReceipt(id) {
    await db.deleteFrom("finalize_receipts").where("id", "=", id).execute();
  },
  async findGrant(partnerId, sessionId, uploadId) {
    return db
      .selectFrom("upload_grants")
      .select(GRANT_COLUMNS)
      .where("id", "=", uploadId)
      .where("partner_id", "=", partnerId)
      .where("session_id", "=", sessionId)
      .executeTakeFirst();
  },
  async findRecording(sessionId) {
    return db
      .selectFrom("recordings")
      .select(["id", "session_id", "upload_grant_id", "object_version_id"])
      .where("session_id", "=", sessionId)
      .executeTakeFirst();
  },
  async persistPin({
    sessionId,
    grant,
    metadata,
    durationMs,
    recordingId,
    pinnedAt,
  }) {
    await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("recordings")
        .values({
          id: recordingId,
          session_id: sessionId,
          storage_key: grant.storage_key,
          mime_type: metadata.mimeType,
          duration_ms: durationMs,
          size_bytes: metadata.sizeBytes,
          sha256_hash: metadata.checksumSha256,
          storage_bucket: metadata.bucket,
          object_version_id: metadata.versionId,
          etag: metadata.etag,
          checksum_sha256: metadata.checksumSha256,
          upload_grant_id: grant.id,
          pinned_at: pinnedAt,
          created_at: pinnedAt,
        })
        .onConflict((oc) =>
          oc.column("session_id").doUpdateSet({
            storage_key: grant.storage_key,
            mime_type: metadata.mimeType,
            duration_ms: durationMs,
            size_bytes: metadata.sizeBytes,
            sha256_hash: metadata.checksumSha256,
            storage_bucket: metadata.bucket,
            object_version_id: metadata.versionId,
            etag: metadata.etag,
            checksum_sha256: metadata.checksumSha256,
            upload_grant_id: grant.id,
            pinned_at: pinnedAt,
          })
        )
        .execute();

      await trx
        .updateTable("upload_grants")
        .set({
          state: "pinned",
          pinned_at: pinnedAt,
          cleanup_lease_token: null,
          cleanup_lease_until: null,
          updated_at: pinnedAt,
        })
        .where("id", "=", grant.id)
        .execute();

      await trx
        .updateTable("sessions")
        .set({ status: "submitted", updated_at: pinnedAt })
        .where("id", "=", sessionId)
        .execute();
    });
  },
  headVersion,
  enqueueValidate,
});

export async function pinVersionedFinalize(
  input: FinalizePinInput
): Promise<FinalizePinResult> {
  return productionPinner.pin(input);
}
