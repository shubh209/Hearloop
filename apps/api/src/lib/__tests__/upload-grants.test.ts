import fc from "fast-check";
import {
  createUploadGrantIssuer,
  hashUploadGrantRequest,
  parseUploadGrantRequest,
  UploadGrantDependencies,
  UploadGrantError,
  UploadGrantRow,
  VersionedUploadGrantRequest,
  VersionedUploadGrantResponse,
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

const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "44444444-4444-4444-8444-444444444444";
const GRANT_ID = "55555555-5555-4555-8555-555555555555";
const EXPIRES_AT = new Date("2026-08-15T20:15:00.000Z");

const SIGNED_UPLOAD = {
  bucket: "private-test-bucket",
  key: `recordings/${PARTNER_ID}/${SESSION_ID}/${VALID_BODY.uploadAttemptId}.webm`,
  uploadUrl: "https://storage.example.test/signed-put",
  expiresAt: EXPIRES_AT,
  requiredHeaders: {
    "Content-Type": VALID_BODY.mimeType,
    "x-amz-checksum-sha256": VALID_BODY.checksumSha256,
  },
};

function storedResponse(
  overrides: Partial<VersionedUploadGrantResponse> = {}
): VersionedUploadGrantResponse {
  return {
    uploadId: GRANT_ID,
    uploadUrl: SIGNED_UPLOAD.uploadUrl,
    storageKey: SIGNED_UPLOAD.key,
    expiresAt: EXPIRES_AT.toISOString(),
    requiredHeaders: SIGNED_UPLOAD.requiredHeaders,
    ...overrides,
  };
}

function storedRow(
  overrides: Partial<UploadGrantRow> = {}
): UploadGrantRow {
  return {
    id: GRANT_ID,
    partner_id: PARTNER_ID,
    session_id: SESSION_ID,
    upload_attempt_id: VALID_BODY.uploadAttemptId,
    idempotency_key: "grant-key-0001",
    request_hash: hashUploadGrantRequest(VALID_BODY),
    response_json: JSON.stringify(storedResponse()),
    storage_bucket: SIGNED_UPLOAD.bucket,
    storage_key: SIGNED_UPLOAD.key,
    expected_mime_type: VALID_BODY.mimeType,
    expected_size_bytes: VALID_BODY.sizeBytes,
    expected_checksum_sha256: VALID_BODY.checksumSha256,
    expires_at: EXPIRES_AT,
    ...overrides,
  };
}

function makeDependencies(initialRows: UploadGrantRow[] = []) {
  const rows = [...initialRows];
  const dependencies: UploadGrantDependencies = {
    findByIdempotencyKey: jest.fn(async (sessionId, idempotencyKey) =>
      rows.find(
        (row) =>
          row.session_id === sessionId &&
          row.idempotency_key === idempotencyKey
      )
    ),
    findByAttemptId: jest.fn(async (sessionId, uploadAttemptId) =>
      rows.find(
        (row) =>
          row.session_id === sessionId &&
          row.upload_attempt_id === uploadAttemptId
      )
    ),
    insertGrant: jest.fn(async (row) => {
      rows.push(row);
    }),
    signUpload: jest.fn(async () => SIGNED_UPLOAD),
    createId: jest.fn(() => GRANT_ID),
  };
  return { rows, dependencies };
}

const VALID_INPUT = {
  partnerId: PARTNER_ID,
  sessionId: SESSION_ID,
  idempotencyKey: "grant-key-0001",
  body: VALID_BODY,
};

describe("createUploadGrantIssuer", () => {
  it("persists and returns a new checksum-bound upload grant", async () => {
    const { rows, dependencies } = makeDependencies();
    const issuer = createUploadGrantIssuer(dependencies);

    const result = await issuer.issue(VALID_INPUT);

    expect(result).toEqual({ response: storedResponse(), replayed: false });
    expect(rows).toEqual([
      {
        id: GRANT_ID,
        partner_id: PARTNER_ID,
        session_id: SESSION_ID,
        upload_attempt_id: VALID_BODY.uploadAttemptId,
        idempotency_key: "grant-key-0001",
        request_hash:
          "8dd5aeb1a323f95fb03c8fe6dfb7f162ea4222d4eecce206048c9e9560f1f95a",
        response_json: JSON.stringify(storedResponse()),
        storage_bucket: SIGNED_UPLOAD.bucket,
        storage_key: SIGNED_UPLOAD.key,
        expected_mime_type: "audio/webm",
        expected_size_bytes: 4096,
        expected_checksum_sha256:
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        expires_at: EXPIRES_AT,
      },
    ]);
    expect(dependencies.signUpload).toHaveBeenCalledWith({
      storageKey: SIGNED_UPLOAD.key,
      mimeType: "audio/webm",
      checksumSha256:
        "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      expiresInSeconds: 900,
    });
  });

  it("replays an identical key and request without signing again", async () => {
    const { dependencies } = makeDependencies();
    const issuer = createUploadGrantIssuer(dependencies);

    const first = await issuer.issue(VALID_INPUT);
    const replay = await issuer.issue(VALID_INPUT);

    expect(replay).toEqual({ response: first.response, replayed: true });
    expect(dependencies.signUpload).toHaveBeenCalledTimes(1);
    expect(dependencies.insertGrant).toHaveBeenCalledTimes(1);
  });

  it("converges a different key for the same attempt and media", async () => {
    const { dependencies } = makeDependencies([storedRow()]);
    const issuer = createUploadGrantIssuer(dependencies);

    const result = await issuer.issue({
      ...VALID_INPUT,
      idempotencyKey: "grant-key-0002",
    });

    expect(result).toEqual({ response: storedResponse(), replayed: true });
    expect(dependencies.signUpload).not.toHaveBeenCalled();
  });

  it("rejects the same idempotency key with different content", async () => {
    const { dependencies } = makeDependencies([storedRow()]);
    const issuer = createUploadGrantIssuer(dependencies);

    await expect(
      issuer.issue({
        ...VALID_INPUT,
        body: { ...VALID_BODY, sizeBytes: 4097 },
      })
    ).rejects.toMatchObject({
      statusCode: 422,
      errorCode: "idempotency_key_reused",
    });
  });

  it.each([
    { mimeType: "audio/mp4" },
    { sizeBytes: 4097 },
    { checksumSha256: Buffer.alloc(32, 1).toString("base64") },
  ])("rejects changed media for the same upload attempt: %p", async (change) => {
    const { dependencies } = makeDependencies([storedRow()]);
    const issuer = createUploadGrantIssuer(dependencies);

    await expect(
      issuer.issue({
        ...VALID_INPUT,
        idempotencyKey: "grant-key-0002",
        body: { ...VALID_BODY, ...change },
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "upload_attempt_conflict",
    });
  });

  it("reloads and replays the stored winner after an insert race", async () => {
    const { rows, dependencies } = makeDependencies();
    const winner = storedRow({
      id: "66666666-6666-4666-8666-666666666666",
      response_json: JSON.stringify(
        storedResponse({ uploadId: "66666666-6666-4666-8666-666666666666" })
      ),
    });
    (dependencies.insertGrant as jest.Mock).mockImplementationOnce(async () => {
      rows.push(winner);
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    });
    const issuer = createUploadGrantIssuer(dependencies);

    const result = await issuer.issue(VALID_INPUT);

    expect(result).toEqual({
      response: storedResponse({
        uploadId: "66666666-6666-4666-8666-666666666666",
      }),
      replayed: true,
    });
  });

  it("returns 422 when an insert race exposes changed key content", async () => {
    const { rows, dependencies } = makeDependencies();
    const changed = { ...VALID_BODY, sizeBytes: 4097 };
    (dependencies.insertGrant as jest.Mock).mockImplementationOnce(async () => {
      rows.push(
        storedRow({
          upload_attempt_id: "77777777-7777-4777-8777-777777777777",
          request_hash: hashUploadGrantRequest(changed),
        })
      );
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    });
    const issuer = createUploadGrantIssuer(dependencies);

    await expect(issuer.issue(VALID_INPUT)).rejects.toMatchObject({
      statusCode: 422,
      errorCode: "idempotency_key_reused",
    });
  });

  it("returns 409 when an insert race exposes changed attempt content", async () => {
    const { rows, dependencies } = makeDependencies();
    const changed = { ...VALID_BODY, sizeBytes: 4097 };
    (dependencies.insertGrant as jest.Mock).mockImplementationOnce(async () => {
      rows.push(
        storedRow({
          idempotency_key: "grant-key-0002",
          request_hash: hashUploadGrantRequest(changed),
        })
      );
      throw Object.assign(new Error("duplicate"), { code: "23505" });
    });
    const issuer = createUploadGrantIssuer(dependencies);

    await expect(issuer.issue(VALID_INPUT)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "upload_attempt_conflict",
    });
  });

  it("does not mask non-unique database failures", async () => {
    const { dependencies } = makeDependencies();
    const databaseFailure = new Error("database unavailable");
    (dependencies.insertGrant as jest.Mock).mockRejectedValueOnce(databaseFailure);
    const issuer = createUploadGrantIssuer(dependencies);

    await expect(issuer.issue(VALID_INPUT)).rejects.toBe(databaseFailure);
  });

  it("maps storage failures without exposing provider details", async () => {
    const { dependencies } = makeDependencies();
    (dependencies.signUpload as jest.Mock).mockRejectedValueOnce(
      new Error(
        `provider failed for ${SIGNED_UPLOAD.bucket} ${SIGNED_UPLOAD.key} ${VALID_BODY.checksumSha256}`
      )
    );
    const issuer = createUploadGrantIssuer(dependencies);

    await expect(issuer.issue(VALID_INPUT)).rejects.toMatchObject({
      statusCode: 503,
      errorCode: "storage_unavailable",
      message: "storage_unavailable",
    });
  });

  it("rejects a corrupt stored response without leaking parser details", async () => {
    const { dependencies } = makeDependencies([
      storedRow({ response_json: "not-json-private-storage-key" }),
    ]);
    const issuer = createUploadGrantIssuer(dependencies);

    await expect(issuer.issue(VALID_INPUT)).rejects.toMatchObject({
      statusCode: 503,
      errorCode: "storage_unavailable",
      message: "storage_unavailable",
    });
  });
});
