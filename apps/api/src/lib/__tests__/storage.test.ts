// hearloop/apps/api/src/lib/__tests__/storage.test.ts

import { S3Client } from "@aws-sdk/client-s3";
import { createHash } from "crypto";
import { Readable } from "stream";

const s3Presigner = require("@aws-sdk/s3-request-presigner") as typeof import("@aws-sdk/s3-request-presigner");

let storage: typeof import("../storage");

beforeAll(async () => {
  process.env.STORAGE_REGION = "us-east-2";
  process.env.STORAGE_BUCKET = "test-audio-bucket";
  process.env.STORAGE_ACCESS_KEY_ID = "test-access-key";
  process.env.STORAGE_SECRET_ACCESS_KEY = "test-secret-key";
  storage = await import("../storage");
});

describe("buildStorageKey", () => {
  it("derives the recordings/{sessionId}/audio.{ext} key from the mime type", () => {
    expect(storage.buildStorageKey("session-123", "audio/webm")).toBe(
      "recordings/session-123/audio.webm"
    );
  });
});

describe("buildVersionedStorageKey", () => {
  it("isolates an upload under its partner, session, and upload identifiers", () => {
    expect(
      storage.buildVersionedStorageKey({
        partnerId: "partner-123",
        sessionId: "session-456",
        uploadId: "upload-789",
        mimeType: "audio/webm",
      })
    ).toBe("recordings/partner-123/session-456/upload-789.webm");
  });

  it("uses stable file extensions for supported audio MIME aliases", () => {
    const cases = [
      ["audio/webm", "webm"],
      ["audio/mp4", "mp4"],
      ["audio/mpeg", "mp3"],
      ["audio/ogg", "ogg"],
      ["audio/wav", "wav"],
      ["audio/x-m4a", "m4a"],
      ["audio/m4a", "m4a"],
    ] as const;

    for (const [mimeType, extension] of cases) {
      expect(
        storage.buildVersionedStorageKey({
          partnerId: "partner-123",
          sessionId: "session-456",
          uploadId: "upload-789",
          mimeType,
        })
      ).toBe(`recordings/partner-123/session-456/upload-789.${extension}`);
    }
  });

  it("rejects unsupported MIME types before they can influence an object key", () => {
    expect(() =>
      storage.buildVersionedStorageKey({
        partnerId: "partner-123",
        sessionId: "session-456",
        uploadId: "upload-789",
        mimeType: "audio/../../private",
      })
    ).toThrow(
      expect.objectContaining({
        name: "StorageError",
        code: "invalid_argument",
        operation: "build_key",
        retryable: false,
      })
    );
  });
});

describe("getVersionedUploadSignedUrl", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("signs content type and keeps the SHA-256 checksum in an unhoisted header", async () => {
    const before = Date.now();
    const result = await storage.getVersionedUploadSignedUrl({
      storageKey: "phase1-capability-probe/task3-unit/audio.webm",
      mimeType: "audio/webm",
      checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    });
    const after = Date.now();
    const url = new URL(result.uploadUrl);
    const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders")?.split(";");
    const queryNames = [...url.searchParams.keys()].map((name) => name.toLowerCase());

    expect(result).toMatchObject({
      bucket: "test-audio-bucket",
      key: "phase1-capability-probe/task3-unit/audio.webm",
      requiredHeaders: {
        "Content-Type": "audio/webm",
        "x-amz-checksum-sha256": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      },
    });
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 899_000);
    expect(result.expiresAt.getTime()).toBeLessThanOrEqual(after + 900_000);
    expect(signedHeaders).toEqual(
      expect.arrayContaining(["content-type", "x-amz-checksum-sha256"])
    );
    expect(queryNames).not.toContain("x-amz-checksum-sha256");
  });

  it("rejects a checksum that is not Base64 for exactly 32 bytes", async () => {
    await expect(
      storage.getVersionedUploadSignedUrl({
        storageKey: "phase1-capability-probe/task3-unit/audio.webm",
        mimeType: "audio/webm",
        checksumSha256: "not-a-sha256-checksum",
      })
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "invalid_argument",
      operation: "presign_put",
      retryable: false,
    });
  });

  it("rejects an empty storage key", async () => {
    await expect(
      storage.getVersionedUploadSignedUrl({
        storageKey: "",
        mimeType: "audio/webm",
        checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      })
    ).rejects.toMatchObject({
      code: "invalid_argument",
      operation: "presign_put",
    });
  });

  it("rejects unsupported upload MIME types", async () => {
    await expect(
      storage.getVersionedUploadSignedUrl({
        storageKey: "phase1-capability-probe/task3-unit/audio.bin",
        mimeType: "application/octet-stream",
        checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      })
    ).rejects.toMatchObject({
      code: "invalid_argument",
      operation: "presign_put",
    });
  });

  it("rejects presign expirations outside the SigV4 range", async () => {
    for (const expiresInSeconds of [0, 604801]) {
      await expect(
        storage.getVersionedUploadSignedUrl({
          storageKey: "phase1-capability-probe/task3-unit/audio.webm",
          mimeType: "audio/webm",
          checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
          expiresInSeconds,
        })
      ).rejects.toMatchObject({
        code: "invalid_argument",
        operation: "presign_put",
      });
    }
  });

  it("normalizes presigner failures", async () => {
    const error = Object.assign(new Error("credential provider detail"), {
      name: "ServiceUnavailable",
      $metadata: { httpStatusCode: 503 },
    });
    jest.spyOn(s3Presigner, "getSignedUrl").mockRejectedValue(error);

    await expect(
      storage.getVersionedUploadSignedUrl({
        storageKey: "phase1-capability-probe/task3-unit/audio.webm",
        mimeType: "audio/webm",
        checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      })
    ).rejects.toMatchObject({
      name: "StorageError",
      code: "upstream_error",
      operation: "presign_put",
      retryable: true,
      statusCode: 503,
      cause: error,
    });
  });
});

describe("headVersion", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns complete metadata for the exact requested object version", async () => {
    const send = jest
      .spyOn(S3Client.prototype as any, "send")
      .mockResolvedValue({
        $metadata: { httpStatusCode: 200 },
        VersionId: "version-123",
        ETag: '"etag-123"',
        ChecksumSHA256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        ContentType: "audio/webm",
        ContentLength: 2048,
      });

    const result = await storage.headVersion({
      bucket: "test-audio-bucket",
      key: "recordings/partner/session/upload.webm",
      versionId: "version-123",
    });

    expect(result).toEqual({
      bucket: "test-audio-bucket",
      key: "recordings/partner/session/upload.webm",
      versionId: "version-123",
      etag: '"etag-123"',
      checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      mimeType: "audio/webm",
      sizeBytes: 2048,
    });
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "test-audio-bucket",
      Key: "recordings/partner/session/upload.webm",
      VersionId: "version-123",
      ChecksumMode: "ENABLED",
    });
  });

  it("rejects references outside the configured exact-version boundary", async () => {
    const invalidRefs = [
      {
        bucket: "another-bucket",
        key: "recordings/partner/session/upload.webm",
        versionId: "version-123",
      },
      { bucket: "test-audio-bucket", key: "", versionId: "version-123" },
      {
        bucket: "test-audio-bucket",
        key: "recordings/partner/session/upload.webm",
        versionId: "",
      },
      {
        bucket: "test-audio-bucket",
        key: "recordings/partner/session/upload.webm",
        versionId: "v".repeat(1025),
      },
    ];

    for (const ref of invalidRefs) {
      jest.spyOn(S3Client.prototype as any, "send").mockResolvedValue({});
      await expect(storage.headVersion(ref)).rejects.toMatchObject({
        code: "invalid_argument",
        operation: "head_version",
        retryable: false,
      });
      jest.restoreAllMocks();
    }
  });

  it("rejects incomplete or mismatched exact-version metadata", async () => {
    const validResponse = {
      $metadata: { httpStatusCode: 200 },
      VersionId: "version-123",
      ETag: '"etag-123"',
      ChecksumSHA256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      ContentType: "audio/webm",
      ContentLength: 2048,
    };
    const invalidResponses = [
      { ...validResponse, VersionId: "different-version" },
      { ...validResponse, ETag: "" },
      { ...validResponse, ChecksumSHA256: "invalid" },
      { ...validResponse, ContentType: "application/octet-stream" },
      { ...validResponse, ContentLength: -1 },
    ];

    for (const response of invalidResponses) {
      jest
        .spyOn(S3Client.prototype as any, "send")
        .mockResolvedValue(response);

      const rejection = storage.headVersion({
        bucket: "test-audio-bucket",
        key: "recordings/partner/session/upload.webm",
        versionId: "version-123",
      });
      await expect(rejection).rejects.toMatchObject({
        code: "invalid_response",
        operation: "head_version",
        retryable: false,
      });
      await expect(rejection).rejects.not.toThrow(/version-123|recordings\//);
      jest.restoreAllMocks();
    }
  });

  it("normalizes S3 failures without exposing the object reference", async () => {
    const cases = [
      ["NoSuchVersion", 404, "not_found", false],
      ["AccessDenied", 403, "access_denied", false],
      ["Conflict", 409, "conflict", false],
      ["ServiceUnavailable", 503, "upstream_error", true],
    ] as const;

    for (const [name, statusCode, code, retryable] of cases) {
      const error = Object.assign(new Error("provider detail"), {
        name,
        $metadata: { httpStatusCode: statusCode },
      });
      jest
        .spyOn(S3Client.prototype as any, "send")
        .mockRejectedValue(error);

      const rejection = storage.headVersion({
        bucket: "test-audio-bucket",
        key: "recordings/secret-object.webm",
        versionId: "secret-version",
      });
      await expect(rejection).rejects.toMatchObject({
        name: "StorageError",
        code,
        operation: "head_version",
        retryable,
        statusCode,
        cause: error,
      });
      await expect(rejection).rejects.not.toThrow(/secret-object|secret-version/);
      jest.restoreAllMocks();
    }
  });
});

describe("getVersion", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns bytes and metadata for the exact requested object version", async () => {
    const body = Buffer.from("exact version bytes");
    const checksumSha256 = createHash("sha256").update(body).digest("base64");
    const send = jest
      .spyOn(S3Client.prototype as any, "send")
      .mockResolvedValue({
        $metadata: { httpStatusCode: 200 },
        VersionId: "version-456",
        ETag: '"etag-456"',
        ChecksumSHA256: checksumSha256,
        ContentType: "audio/webm",
        ContentLength: body.byteLength,
        Body: Readable.from([body]),
      });

    const result = await storage.getVersion({
      bucket: "test-audio-bucket",
      key: "recordings/partner/session/upload.webm",
      versionId: "version-456",
    });

    expect(result).toEqual({
      bucket: "test-audio-bucket",
      key: "recordings/partner/session/upload.webm",
      versionId: "version-456",
      etag: '"etag-456"',
      checksumSha256,
      mimeType: "audio/webm",
      sizeBytes: body.byteLength,
      body,
    });
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "test-audio-bucket",
      Key: "recordings/partner/session/upload.webm",
      VersionId: "version-456",
      ChecksumMode: "ENABLED",
    });
  });

  it("rejects bytes that do not match the exact version's length or checksum", async () => {
    const body = Buffer.from("exact version bytes");
    const actualChecksum = createHash("sha256").update(body).digest("base64");
    const otherChecksum = createHash("sha256")
      .update(Buffer.from("other bytes"))
      .digest("base64");
    const invalidResponses = [
      { ContentLength: body.byteLength + 1, ChecksumSHA256: actualChecksum },
      { ContentLength: body.byteLength, ChecksumSHA256: otherChecksum },
    ];

    for (const invalid of invalidResponses) {
      jest
        .spyOn(S3Client.prototype as any, "send")
        .mockResolvedValue({
          $metadata: { httpStatusCode: 200 },
          VersionId: "version-456",
          ETag: '"etag-456"',
          ContentType: "audio/webm",
          ...invalid,
          Body: Readable.from([body]),
        });

      await expect(
        storage.getVersion({
          bucket: "test-audio-bucket",
          key: "recordings/partner/session/upload.webm",
          versionId: "version-456",
        })
      ).rejects.toMatchObject({
        code: "integrity_mismatch",
        operation: "get_version",
        retryable: false,
      });
      jest.restoreAllMocks();
    }
  });

  it("rejects an exact GET response with no body", async () => {
    const emptyChecksum = createHash("sha256").update(Buffer.alloc(0)).digest("base64");
    jest
      .spyOn(S3Client.prototype as any, "send")
      .mockResolvedValue({
        $metadata: { httpStatusCode: 200 },
        VersionId: "version-456",
        ETag: '"etag-456"',
        ChecksumSHA256: emptyChecksum,
        ContentType: "audio/webm",
        ContentLength: 0,
      });

    await expect(
      storage.getVersion({
        bucket: "test-audio-bucket",
        key: "recordings/partner/session/upload.webm",
        versionId: "version-456",
      })
    ).rejects.toMatchObject({
      code: "invalid_response",
      operation: "get_version",
    });
  });

  it("normalizes an SDK stream checksum failure as an integrity mismatch", async () => {
    const body = {
      async *[Symbol.asyncIterator]() {
        throw new Error("Checksum mismatch: provider validation failed");
      },
    };
    jest
      .spyOn(S3Client.prototype as any, "send")
      .mockResolvedValue({
        $metadata: { httpStatusCode: 200 },
        VersionId: "version-456",
        ETag: '"etag-456"',
        ChecksumSHA256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        ContentType: "audio/webm",
        ContentLength: 20,
        Body: body,
      });

    await expect(
      storage.getVersion({
        bucket: "test-audio-bucket",
        key: "recordings/partner/session/upload.webm",
        versionId: "version-456",
      })
    ).rejects.toMatchObject({
      code: "integrity_mismatch",
      operation: "get_version",
      retryable: false,
    });
  });
});

describe("deleteVersion", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("deletes only the exact requested object version", async () => {
    const send = jest
      .spyOn(S3Client.prototype as any, "send")
      .mockResolvedValue({
        $metadata: { httpStatusCode: 204 },
        VersionId: "version-789",
      });
    const ref = {
      bucket: "test-audio-bucket",
      key: "recordings/partner/session/upload.webm",
      versionId: "version-789",
    };

    await expect(storage.deleteVersion(ref)).resolves.toEqual(ref);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: "test-audio-bucket",
      Key: "recordings/partner/session/upload.webm",
      VersionId: "version-789",
    });
  });

  it("rejects a DELETE response that does not confirm the requested version", async () => {
    for (const VersionId of [undefined, "different-version"]) {
      jest
        .spyOn(S3Client.prototype as any, "send")
        .mockResolvedValue({
          $metadata: { httpStatusCode: 204 },
          VersionId,
        });

      await expect(
        storage.deleteVersion({
          bucket: "test-audio-bucket",
          key: "recordings/partner/session/upload.webm",
          versionId: "version-789",
        })
      ).rejects.toMatchObject({
        code: "invalid_response",
        operation: "delete_version",
        retryable: false,
      });
      jest.restoreAllMocks();
    }
  });
});
