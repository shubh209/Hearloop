import fc from "fast-check";
import {
  hashUploadGrantRequest,
  parseUploadGrantRequest,
  UploadGrantError,
  VersionedUploadGrantRequest,
} from "../upload-grants";

const VALID_BODY: VersionedUploadGrantRequest = {
  uploadAttemptId: "22222222-2222-4222-8222-222222222222",
  mimeType: "audio/webm",
  sizeBytes: 4096,
  checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
};

function expectInvalid(body: unknown, ...idempotencyKeyArgs: unknown[]) {
  const idempotencyKey =
    idempotencyKeyArgs.length === 0 ? "grant-key-0001" : idempotencyKeyArgs[0];
  try {
    parseUploadGrantRequest(idempotencyKey, body);
    throw new Error("expected request to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(UploadGrantError);
    expect(error).toMatchObject({
      statusCode: 400,
      errorCode: "invalid_upload_grant_request",
      message: "invalid_upload_grant_request",
    });
  }
}

describe("parseUploadGrantRequest", () => {
  it("accepts the complete versioned upload-grant contract", () => {
    expect(parseUploadGrantRequest("grant-key-0001", VALID_BODY)).toEqual({
      idempotencyKey: "grant-key-0001",
      request: VALID_BODY,
    });
  });

  it.each([
    [undefined, "missing"],
    ["short", "short"],
    ["x".repeat(129), "long"],
    ["grant key 0001", "space"],
    ["grant-key\n0001", "control"],
    ["gránt-key-0001", "non-ASCII"],
  ])("rejects a %s idempotency key (%s)", (idempotencyKey) => {
    expectInvalid(VALID_BODY, idempotencyKey);
  });

  it.each([
    null,
    [],
    "audio/webm",
    42,
  ])("rejects a non-object body: %p", (body) => {
    expectInvalid(body);
  });

  it.each([
    ["uploadAttemptId", "not-a-uuid"],
    ["uploadAttemptId", "22222222-2222-2222-2222-22222222222"],
    ["mimeType", "audio/aac"],
    ["mimeType", "video/webm"],
    ["sizeBytes", 999],
    ["sizeBytes", 10_485_761],
    ["sizeBytes", 4096.5],
    ["checksumSha256", "not-base64"],
    ["checksumSha256", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"],
    ["checksumSha256", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=="],
  ])("rejects invalid %s", (field, value) => {
    expectInvalid({ ...VALID_BODY, [field]: value });
  });

  it("accepts every MIME type supported by versioned storage", () => {
    const mimeTypes = [
      "audio/webm",
      "audio/mp4",
      "audio/mpeg",
      "audio/ogg",
      "audio/wav",
      "audio/x-m4a",
      "audio/m4a",
    ];

    for (const mimeType of mimeTypes) {
      expect(
        parseUploadGrantRequest("grant-key-0001", {
          ...VALID_BODY,
          mimeType,
        }).request.mimeType
      ).toBe(mimeType);
    }
  });

  it("rejects semantic JSON larger than 1 KiB", () => {
    expectInvalid({ ...VALID_BODY, ignoredPadding: "x".repeat(1024) });
  });
});

describe("hashUploadGrantRequest", () => {
  it("returns a stable lowercase SHA-256 hash", () => {
    expect(hashUploadGrantRequest(VALID_BODY)).toBe(
      "8dd5aeb1a323f95fb03c8fe6dfb7f162ea4222d4eecce206048c9e9560f1f95a"
    );
  });

  it("does not depend on source object insertion order", () => {
    const reordered = {
      checksumSha256: VALID_BODY.checksumSha256,
      sizeBytes: VALID_BODY.sizeBytes,
      mimeType: VALID_BODY.mimeType,
      uploadAttemptId: VALID_BODY.uploadAttemptId,
    };

    expect(hashUploadGrantRequest(reordered)).toBe(
      hashUploadGrantRequest(VALID_BODY)
    );
  });

  it("changes when any authoritative media field changes", () => {
    const checksumB = Buffer.alloc(32, 1).toString("base64");
    const mutations: VersionedUploadGrantRequest[] = [
      { ...VALID_BODY, uploadAttemptId: "33333333-3333-4333-8333-333333333333" },
      { ...VALID_BODY, mimeType: "audio/mp4" },
      { ...VALID_BODY, sizeBytes: 4097 },
      { ...VALID_BODY, checksumSha256: checksumB },
    ];

    for (const mutation of mutations) {
      expect(hashUploadGrantRequest(mutation)).not.toBe(
        hashUploadGrantRequest(VALID_BODY)
      );
    }
  });

  it("is deterministic across valid generated sizes and checksums", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1000, max: 10_485_760 }),
        fc.uint8Array({ minLength: 32, maxLength: 32 }),
        (sizeBytes, checksumBytes) => {
          const request = {
            ...VALID_BODY,
            sizeBytes,
            checksumSha256: Buffer.from(checksumBytes).toString("base64"),
          };
          expect(hashUploadGrantRequest(request)).toBe(
            hashUploadGrantRequest({ ...request })
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
