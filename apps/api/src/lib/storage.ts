// hearloop/apps/api/src/lib/storage.ts

import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "crypto";
import { Readable } from "stream";

const s3 = new S3Client({
  region: process.env.STORAGE_REGION ?? "auto",
  endpoint: process.env.STORAGE_ENDPOINT, // Cloudflare R2 endpoint
  credentials: {
    accessKeyId: process.env.STORAGE_ACCESS_KEY_ID!,
    secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.STORAGE_BUCKET!;

export type StorageErrorCode =
  | "invalid_argument"
  | "not_found"
  | "access_denied"
  | "conflict"
  | "integrity_mismatch"
  | "invalid_response"
  | "upstream_error";

export type StorageOperation =
  | "build_key"
  | "presign_put"
  | "head_version"
  | "get_version"
  | "delete_version";

export class StorageError extends Error {
  readonly name = "StorageError";

  constructor(
    message: string,
    readonly code: StorageErrorCode,
    readonly operation: StorageOperation,
    readonly retryable: boolean,
    readonly statusCode?: number,
    readonly cause?: unknown
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function buildStorageKey(sessionId: string, mimeType: string): string {
  const ext = mimeType.split("/")[1] ?? "webm";
  return `recordings/${sessionId}/audio.${ext}`;
}

export interface VersionedStorageKeyInput {
  partnerId: string;
  sessionId: string;
  uploadId: string;
  mimeType: string;
}

export interface VersionedUploadSignedUrlInput {
  storageKey: string;
  mimeType: string;
  checksumSha256: string;
  expiresInSeconds?: number;
}

export interface VersionedUploadSignedUrlResult {
  bucket: string;
  key: string;
  uploadUrl: string;
  expiresAt: Date;
  requiredHeaders: {
    "Content-Type": string;
    "x-amz-checksum-sha256": string;
  };
}

export interface StorageVersionRef {
  bucket: string;
  key: string;
  versionId: string;
}

export interface VersionedObjectMetadata extends StorageVersionRef {
  etag: string;
  checksumSha256: string;
  mimeType: string;
  sizeBytes: number;
}

export interface VersionedObject extends VersionedObjectMetadata {
  body: Buffer;
}

const AUDIO_EXTENSION_BY_MIME_TYPE: Readonly<Record<string, string>> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
};

function isSha256Base64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) return false;
  const decoded = Buffer.from(value, "base64");
  return decoded.byteLength === 32 && decoded.toString("base64") === value;
}

function validateVersionRef(
  ref: StorageVersionRef,
  operation: "head_version" | "get_version" | "delete_version"
): void {
  const validVersionIdLength =
    Buffer.byteLength(ref.versionId, "utf8") >= 1 &&
    Buffer.byteLength(ref.versionId, "utf8") <= 1024;

  if (
    ref.bucket !== BUCKET ||
    ref.key.trim().length === 0 ||
    !validVersionIdLength
  ) {
    throw new StorageError(
      "Invalid exact-version storage reference",
      "invalid_argument",
      operation,
      false
    );
  }
}

interface ObjectMetadataResponse {
  VersionId?: string;
  ETag?: string;
  ChecksumSHA256?: string;
  ContentType?: string;
  ContentLength?: number;
}

function parseVersionMetadata(
  ref: StorageVersionRef,
  response: ObjectMetadataResponse,
  operation: "head_version" | "get_version"
): VersionedObjectMetadata {
  const validEtag =
    typeof response.ETag === "string" &&
    response.ETag.trim().length >= 1 &&
    response.ETag.length <= 128;
  const validSize =
    Number.isSafeInteger(response.ContentLength) && response.ContentLength! >= 0;

  if (
    response.VersionId !== ref.versionId ||
    !validEtag ||
    typeof response.ChecksumSHA256 !== "string" ||
    !isSha256Base64(response.ChecksumSHA256) ||
    typeof response.ContentType !== "string" ||
    !AUDIO_EXTENSION_BY_MIME_TYPE[response.ContentType] ||
    !validSize
  ) {
    throw new StorageError(
      "Invalid exact-version storage response",
      "invalid_response",
      operation,
      false
    );
  }

  return {
    ...ref,
    etag: response.ETag!,
    checksumSha256: response.ChecksumSHA256!,
    mimeType: response.ContentType!,
    sizeBytes: response.ContentLength!,
  };
}

function normalizeStorageError(
  error: unknown,
  operation: StorageOperation
): StorageError {
  if (error instanceof StorageError) return error;

  const providerError = error as {
    name?: string;
    message?: string;
    $metadata?: { httpStatusCode?: number };
  };
  const name = providerError?.name;
  const message = providerError?.message;
  const statusCode = providerError?.$metadata?.httpStatusCode;

  let code: StorageErrorCode = "upstream_error";
  let retryable = statusCode === undefined || statusCode >= 500 || statusCode === 429;

  if (typeof message === "string" && message.startsWith("Checksum mismatch:")) {
    code = "integrity_mismatch";
    retryable = false;
  } else if (
    statusCode === 404 ||
    name === "NoSuchKey" ||
    name === "NoSuchVersion" ||
    name === "NotFound"
  ) {
    code = "not_found";
    retryable = false;
  } else if (statusCode === 401 || statusCode === 403 || name === "AccessDenied") {
    code = "access_denied";
    retryable = false;
  } else if (statusCode === 409 || statusCode === 412 || name === "Conflict") {
    code = "conflict";
    retryable = false;
  }

  return new StorageError(
    `Storage ${operation} failed`,
    code,
    operation,
    retryable,
    statusCode,
    error
  );
}

export function buildVersionedStorageKey({
  partnerId,
  sessionId,
  uploadId,
  mimeType,
}: VersionedStorageKeyInput): string {
  const ext = AUDIO_EXTENSION_BY_MIME_TYPE[mimeType];
  if (!ext) {
    throw new StorageError(
      "Unsupported audio MIME type",
      "invalid_argument",
      "build_key",
      false
    );
  }
  return `recordings/${partnerId}/${sessionId}/${uploadId}.${ext}`;
}

export async function getVersionedUploadSignedUrl({
  storageKey,
  mimeType,
  checksumSha256,
  expiresInSeconds = 900,
}: VersionedUploadSignedUrlInput): Promise<VersionedUploadSignedUrlResult> {
  if (storageKey.trim().length === 0) {
    throw new StorageError(
      "Storage key is required",
      "invalid_argument",
      "presign_put",
      false
    );
  }
  if (!AUDIO_EXTENSION_BY_MIME_TYPE[mimeType]) {
    throw new StorageError(
      "Unsupported audio MIME type",
      "invalid_argument",
      "presign_put",
      false
    );
  }
  if (
    !Number.isSafeInteger(expiresInSeconds) ||
    expiresInSeconds < 1 ||
    expiresInSeconds > 604800
  ) {
    throw new StorageError(
      "Invalid presigned URL expiration",
      "invalid_argument",
      "presign_put",
      false
    );
  }
  if (!isSha256Base64(checksumSha256)) {
    throw new StorageError(
      "Invalid SHA-256 checksum",
      "invalid_argument",
      "presign_put",
      false
    );
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
    ChecksumSHA256: checksumSha256,
  });
  let uploadUrl: string;
  try {
    uploadUrl = await getSignedUrl(s3, command, {
      expiresIn: expiresInSeconds,
      signableHeaders: new Set(["content-type"]),
      unhoistableHeaders: new Set(["x-amz-checksum-sha256"]),
    });
  } catch (error) {
    throw normalizeStorageError(error, "presign_put");
  }

  return {
    bucket: BUCKET,
    key: storageKey,
    uploadUrl,
    expiresAt: new Date(Date.now() + expiresInSeconds * 1000),
    requiredHeaders: {
      "Content-Type": mimeType,
      "x-amz-checksum-sha256": checksumSha256,
    },
  };
}

export async function headVersion(
  ref: StorageVersionRef
): Promise<VersionedObjectMetadata> {
  validateVersionRef(ref, "head_version");
  try {
    const response = await s3.send(
      new HeadObjectCommand({
        Bucket: ref.bucket,
        Key: ref.key,
        VersionId: ref.versionId,
        ChecksumMode: "ENABLED",
      })
    );

    return parseVersionMetadata(ref, response, "head_version");
  } catch (error) {
    throw normalizeStorageError(error, "head_version");
  }
}

export async function getVersion(
  ref: StorageVersionRef
): Promise<VersionedObject> {
  validateVersionRef(ref, "get_version");
  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: ref.bucket,
        Key: ref.key,
        VersionId: ref.versionId,
        ChecksumMode: "ENABLED",
      })
    );
    const metadata = parseVersionMetadata(ref, response, "get_version");

    if (!response.Body) {
      throw new StorageError(
        "Invalid exact-version storage response",
        "invalid_response",
        "get_version",
        false
      );
    }

    const stream = response.Body as Readable;
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }

    const body = Buffer.concat(chunks);
    const checksumSha256 = createHash("sha256").update(body).digest("base64");
    if (
      body.byteLength !== metadata.sizeBytes ||
      checksumSha256 !== metadata.checksumSha256
    ) {
      throw new StorageError(
        "Exact-version object integrity check failed",
        "integrity_mismatch",
        "get_version",
        false
      );
    }

    return { ...metadata, body };
  } catch (error) {
    throw normalizeStorageError(error, "get_version");
  }
}

export async function deleteVersion(
  ref: StorageVersionRef
): Promise<StorageVersionRef> {
  validateVersionRef(ref, "delete_version");
  try {
    const response = await s3.send(
      new DeleteObjectCommand({
        Bucket: ref.bucket,
        Key: ref.key,
        VersionId: ref.versionId,
      })
    );
    if (response.VersionId !== ref.versionId) {
      throw new StorageError(
        "Invalid exact-version storage response",
        "invalid_response",
        "delete_version",
        false
      );
    }
    return ref;
  } catch (error) {
    throw normalizeStorageError(error, "delete_version");
  }
}

// Fetch audio buffer from R2/S3
export async function getAudioBuffer(storageKey: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  const response = await s3.send(command);

  if (!response.Body) {
    throw new Error(`Empty body for storage key: ${storageKey}`);
  }

  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];

  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

// Upload audio buffer, returns storage key + sha256
export async function uploadAudio(
  sessionId: string,
  audioBuffer: Buffer,
  mimeType: string
): Promise<{ storageKey: string; sha256Hash: string; sizeBytes: number }> {
  const storageKey = buildStorageKey(sessionId, mimeType);
  const sha256Hash = createHash("sha256").update(audioBuffer).digest("hex");

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
      Body: audioBuffer,
      ContentType: mimeType,
      Metadata: {
        sessionId,
        sha256: sha256Hash,
      },
    })
  );

  return {
    storageKey,
    sha256Hash,
    sizeBytes: audioBuffer.byteLength,
  };
}

// Short-lived signed URL for direct browser upload (15 min)
export async function getUploadSignedUrl(
  sessionId: string,
  mimeType: string
): Promise<{ uploadUrl: string; storageKey: string }> {
  const storageKey = buildStorageKey(sessionId, mimeType);

  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
    ContentType: mimeType,
  });

  const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 900 });

  return { uploadUrl, storageKey };
}

// Short-lived signed URL for playback (5 min)
export async function getDownloadSignedUrl(
  storageKey: string
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: storageKey,
  });

  return getSignedUrl(s3, command, { expiresIn: 300 });
}

// Delete audio — called on session delete (privacy)
export async function deleteAudio(storageKey: string): Promise<void> {
  await s3.send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: storageKey,
    })
  );
}
