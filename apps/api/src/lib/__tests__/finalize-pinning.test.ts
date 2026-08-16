import fc from "fast-check";
import { StorageError } from "../storage";
import {
  createFinalizePinner,
  hashFinalizePinRequest,
  parseFinalizePinRequest,
  FinalizePinDependencies,
  FinalizePinError,
  FinalizeGrantRow,
  FinalizeReceiptRow,
  RecordingPinRow,
  VersionedFinalizePinRequest,
} from "../finalize-pinning";

const VALID_BODY = {
  uploadId: "55555555-5555-4555-8555-555555555555",
  versionId: "s3-version-abc",
  etag: '"etag-1"',
};

const VALID_REQUEST: VersionedFinalizePinRequest = {
  ...VALID_BODY,
  languageHint: "",
  promptText: "",
  durationMs: null,
};

function expectInvalid(body: unknown, ...idempotencyKeyArgs: unknown[]) {
  const idempotencyKey =
    idempotencyKeyArgs.length === 0 ? "final-key-0001" : idempotencyKeyArgs[0];
  try {
    parseFinalizePinRequest(idempotencyKey, body);
    throw new Error("expected request to be rejected");
  } catch (error) {
    expect(error).toBeInstanceOf(FinalizePinError);
    expect(error).toMatchObject({
      statusCode: 400,
      errorCode: "invalid_finalize_request",
      message: "invalid_finalize_request",
    });
  }
}

describe("parseFinalizePinRequest", () => {
  it("accepts the complete versioned finalize contract", () => {
    expect(parseFinalizePinRequest("final-key-0001", VALID_BODY)).toEqual({
      idempotencyKey: "final-key-0001",
      request: VALID_REQUEST,
    });
  });

  it("normalizes optional language, prompt, and duration", () => {
    expect(
      parseFinalizePinRequest("final-key-0001", {
        ...VALID_BODY,
        languageHint: "en",
        promptText: "How was service?",
        durationMs: 1500,
      }).request
    ).toEqual({
      ...VALID_BODY,
      languageHint: "en",
      promptText: "How was service?",
      durationMs: 1500,
    });
  });

  it.each([
    [undefined, "missing"],
    ["short", "short"],
    ["x".repeat(129), "long"],
    ["final key 0001", "space"],
    ["final-key\n0001", "control"],
    ["finál-key-0001", "non-ASCII"],
  ])("rejects a %s idempotency key (%s)", (idempotencyKey) => {
    expectInvalid(VALID_BODY, idempotencyKey);
  });

  it.each([null, [], "audio/webm", 42])(
    "rejects a non-object body: %p",
    (body) => {
      expectInvalid(body);
    }
  );

  it.each([
    ["uploadId", "not-a-uuid"],
    ["uploadId", "55555555-5555-5555-8555-55555555555"],
    ["versionId", ""],
    ["etag", ""],
    ["etag", "x".repeat(129)],
    ["languageHint", 1],
    ["promptText", 1],
    ["durationMs", 1.5],
    ["durationMs", -1],
  ])("rejects invalid %s", (field, value) => {
    expectInvalid({ ...VALID_BODY, [field]: value });
  });

  it("rejects a versionId longer than 1024 UTF-8 bytes", () => {
    expectInvalid({ ...VALID_BODY, versionId: "é".repeat(513) });
  });

  it("rejects semantic JSON larger than 1 KiB", () => {
    expectInvalid({ ...VALID_BODY, ignoredPadding: "x".repeat(1024) });
  });
});

describe("hashFinalizePinRequest", () => {
  it("returns a stable lowercase SHA-256 hash", () => {
    expect(hashFinalizePinRequest(VALID_REQUEST)).toBe(
      "a7e71e9f963436537e0c113d56411fdf80a2060d30ef0963d160b82e6b56698d"
    );
  });

  it("does not depend on source object insertion order", () => {
    const reordered: VersionedFinalizePinRequest = {
      durationMs: VALID_REQUEST.durationMs,
      promptText: VALID_REQUEST.promptText,
      languageHint: VALID_REQUEST.languageHint,
      etag: VALID_REQUEST.etag,
      versionId: VALID_REQUEST.versionId,
      uploadId: VALID_REQUEST.uploadId,
    };

    expect(hashFinalizePinRequest(reordered)).toBe(
      hashFinalizePinRequest(VALID_REQUEST)
    );
  });

  it("changes when any authoritative field changes", () => {
    const mutations: VersionedFinalizePinRequest[] = [
      {
        ...VALID_REQUEST,
        uploadId: "66666666-6666-4666-8666-666666666666",
      },
      { ...VALID_REQUEST, versionId: "other-version" },
      { ...VALID_REQUEST, etag: '"etag-2"' },
      { ...VALID_REQUEST, languageHint: "en" },
      { ...VALID_REQUEST, promptText: "changed" },
      { ...VALID_REQUEST, durationMs: 1 },
    ];

    for (const mutation of mutations) {
      expect(hashFinalizePinRequest(mutation)).not.toBe(
        hashFinalizePinRequest(VALID_REQUEST)
      );
    }
  });

  it("is deterministic across generated optional fields", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 16 }),
        fc.string({ maxLength: 32 }),
        fc.option(fc.integer({ min: 0, max: 60_000 }), { nil: null }),
        (languageHint, promptText, durationMs) => {
          const request = {
            ...VALID_REQUEST,
            languageHint,
            promptText,
            durationMs,
          };
          expect(hashFinalizePinRequest(request)).toBe(
            hashFinalizePinRequest({ ...request })
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});

const PARTNER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const CHECKSUM = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
const NOW = new Date("2026-08-15T18:00:00.000Z");
const HEAD_METADATA = {
  bucket: "hearloop-audio-prod",
  key: `recordings/${PARTNER_ID}/${SESSION_ID}/attempt.webm`,
  versionId: VALID_BODY.versionId,
  etag: '"etag-1"',
  checksumSha256: CHECKSUM,
  mimeType: "audio/webm",
  sizeBytes: 4096,
};

const PIN_INPUT = {
  partnerId: PARTNER_ID,
  sessionId: SESSION_ID,
  maxDurationSec: 5,
  idempotencyKey: "final-key-0001",
  body: VALID_BODY,
};

function grantRow(overrides: Partial<FinalizeGrantRow> = {}): FinalizeGrantRow {
  return {
    id: VALID_BODY.uploadId,
    partner_id: PARTNER_ID,
    session_id: SESSION_ID,
    storage_bucket: HEAD_METADATA.bucket,
    storage_key: HEAD_METADATA.key,
    expected_mime_type: "audio/webm",
    expected_size_bytes: 4096,
    expected_checksum_sha256: CHECKSUM,
    state: "available",
    ...overrides,
  };
}

function receiptRow(
  overrides: Partial<FinalizeReceiptRow> = {}
): FinalizeReceiptRow {
  return {
    id: "receipt-1",
    partner_id: PARTNER_ID,
    session_id: SESSION_ID,
    upload_grant_id: VALID_BODY.uploadId,
    idempotency_key: "final-key-0001",
    request_hash: hashFinalizePinRequest(VALID_REQUEST),
    status: "completed",
    response_status: 200,
    response_json: JSON.stringify({
      sessionId: SESSION_ID,
      status: "submitted",
    }),
    verification_lease_until: null,
    ...overrides,
  };
}

function makeDependencies(options?: {
  grants?: FinalizeGrantRow[];
  receipts?: FinalizeReceiptRow[];
  recordings?: RecordingPinRow[];
}): {
  persistCalls: unknown[];
  enqueueCalls: unknown[];
  deletedReceipts: string[];
  dependencies: FinalizePinDependencies;
} {
  const grants = options?.grants ?? [grantRow()];
  const receipts = options?.receipts ?? [];
  const recordings = options?.recordings ?? [];
  const persistCalls: unknown[] = [];
  const enqueueCalls: unknown[] = [];
  const deletedReceipts: string[] = [];

  const dependencies: FinalizePinDependencies = {
    now: () => NOW,
    createId: () => "generated-id",
    findReceipt: jest.fn(async (sessionId, idempotencyKey) =>
      receipts.find(
        (row) =>
          row.session_id === sessionId && row.idempotency_key === idempotencyKey
      )
    ),
    insertVerifyingReceipt: jest.fn(async (row) => {
      receipts.push({
        id: row.id,
        partner_id: row.partner_id,
        session_id: row.session_id,
        upload_grant_id: row.upload_grant_id,
        idempotency_key: row.idempotency_key,
        request_hash: row.request_hash,
        status: "verifying",
        response_status: null,
        response_json: null,
        verification_lease_until: row.verification_lease_until,
      });
    }),
    completeReceipt: jest.fn(async (id, responseStatus, responseJson) => {
      const row = receipts.find((candidate) => candidate.id === id);
      if (row) {
        row.status = "completed";
        row.response_status = responseStatus;
        row.response_json = responseJson;
        row.verification_lease_until = null;
      }
    }),
    deleteReceipt: jest.fn(async (id) => {
      deletedReceipts.push(id);
      const index = receipts.findIndex((row) => row.id === id);
      if (index >= 0) receipts.splice(index, 1);
    }),
    findGrant: jest.fn(async (partnerId, sessionId, uploadId) =>
      grants.find(
        (row) =>
          row.partner_id === partnerId &&
          row.session_id === sessionId &&
          row.id === uploadId
      )
    ),
    findRecording: jest.fn(async (sessionId) =>
      recordings.find((row) => row.session_id === sessionId)
    ),
    persistPin: jest.fn(async (input) => {
      persistCalls.push(input);
    }),
    headVersion: jest.fn(async () => HEAD_METADATA),
    enqueueValidate: jest.fn(async (payload) => {
      enqueueCalls.push(payload);
    }),
  };

  return { persistCalls, enqueueCalls, deletedReceipts, dependencies };
}

describe("createFinalizePinner", () => {
  it("pins a matching VersionId and enqueues validation", async () => {
    const { persistCalls, enqueueCalls, dependencies } = makeDependencies();
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).resolves.toEqual({
      response: { sessionId: SESSION_ID, status: "submitted" },
      responseStatus: 200,
      replayed: false,
    });

    expect(dependencies.headVersion).toHaveBeenCalledWith({
      bucket: HEAD_METADATA.bucket,
      key: HEAD_METADATA.key,
      versionId: VALID_BODY.versionId,
    });
    expect(persistCalls).toHaveLength(1);
    expect(enqueueCalls).toEqual([
      {
        sessionId: SESSION_ID,
        storageKey: HEAD_METADATA.key,
        mimeType: "audio/webm",
        maxDurationSec: 5,
      },
    ]);
    expect(dependencies.completeReceipt).toHaveBeenCalledWith(
      "generated-id",
      200,
      JSON.stringify({ sessionId: SESSION_ID, status: "submitted" })
    );
  });

  it("replays a completed receipt with the same hash", async () => {
    const { persistCalls, enqueueCalls, dependencies } = makeDependencies({
      receipts: [receiptRow()],
    });
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).resolves.toEqual({
      response: { sessionId: SESSION_ID, status: "submitted" },
      responseStatus: 200,
      replayed: true,
    });
    expect(dependencies.headVersion).not.toHaveBeenCalled();
    expect(persistCalls).toHaveLength(0);
    expect(enqueueCalls).toHaveLength(0);
  });

  it("returns 422 when the same key hashes to a different request", async () => {
    const { dependencies } = makeDependencies({
      receipts: [
        receiptRow({
          request_hash: hashFinalizePinRequest({
            ...VALID_REQUEST,
            versionId: "other-version",
          }),
        }),
      ],
    });
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).rejects.toMatchObject({
      statusCode: 422,
      errorCode: "idempotency_key_reused",
    });
  });

  it("returns 409 when a verifying lease is still live", async () => {
    const { dependencies } = makeDependencies({
      receipts: [
        receiptRow({
          status: "verifying",
          response_status: null,
          response_json: null,
          verification_lease_until: new Date(NOW.getTime() + 15_000),
        }),
      ],
    });
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "upload_attempt_conflict",
    });
  });

  it("takes over an expired verifying lease", async () => {
    const { persistCalls, dependencies } = makeDependencies({
      receipts: [
        receiptRow({
          id: "stale-receipt",
          status: "verifying",
          response_status: null,
          response_json: null,
          verification_lease_until: new Date(NOW.getTime() - 1_000),
        }),
      ],
    });
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).resolves.toMatchObject({
      replayed: false,
      responseStatus: 200,
    });
    expect(dependencies.insertVerifyingReceipt).not.toHaveBeenCalled();
    expect(persistCalls).toHaveLength(1);
    expect(dependencies.completeReceipt).toHaveBeenCalledWith(
      "stale-receipt",
      200,
      JSON.stringify({ sessionId: SESSION_ID, status: "submitted" })
    );
  });

  it("returns 400 when the grant is missing or not owned", async () => {
    const { dependencies } = makeDependencies({ grants: [] });
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: "invalid_finalize_request",
    });
  });

  it.each(["cleaned", "cleanup_claimed"] as const)(
    "returns 409 when the grant is %s",
    async (state) => {
      const { dependencies } = makeDependencies({
        grants: [grantRow({ state })],
      });
      const pinner = createFinalizePinner(dependencies);

      await expect(pinner.pin(PIN_INPUT)).rejects.toMatchObject({
        statusCode: 409,
        errorCode: "upload_attempt_conflict",
      });
    }
  );

  it("returns 409 when another VersionId already won the Session", async () => {
    const { dependencies } = makeDependencies({
      recordings: [
        {
          id: "recording-1",
          session_id: SESSION_ID,
          upload_grant_id: "66666666-6666-4666-8666-666666666666",
          object_version_id: "other-version",
        },
      ],
    });
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: "upload_attempt_conflict",
    });
  });

  it("maps a missing object to 422 integrity_mismatch and deletes the verifying receipt", async () => {
    const { persistCalls, enqueueCalls, deletedReceipts, dependencies } =
      makeDependencies();
    (dependencies.headVersion as jest.Mock).mockRejectedValueOnce(
      new StorageError("missing", "not_found", "head_version", false, 404)
    );
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).rejects.toMatchObject({
      statusCode: 422,
      errorCode: "integrity_mismatch",
      message: "integrity_mismatch",
    });
    expect(persistCalls).toHaveLength(0);
    expect(enqueueCalls).toHaveLength(0);
    expect(deletedReceipts).toEqual(["generated-id"]);
  });

  it("maps grant metadata mismatch to 422 integrity_mismatch", async () => {
    const { deletedReceipts, dependencies } = makeDependencies();
    (dependencies.headVersion as jest.Mock).mockResolvedValueOnce({
      ...HEAD_METADATA,
      checksumSha256: Buffer.alloc(32, 1).toString("base64"),
    });
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).rejects.toMatchObject({
      statusCode: 422,
      errorCode: "integrity_mismatch",
    });
    expect(deletedReceipts).toEqual(["generated-id"]);
  });

  it("maps retryable storage failures to 503 without echoing provider details", async () => {
    const { dependencies } = makeDependencies();
    (dependencies.headVersion as jest.Mock).mockRejectedValueOnce(
      new StorageError(
        `upstream ${HEAD_METADATA.bucket} ${VALID_BODY.versionId}`,
        "upstream_error",
        "head_version",
        true,
        500
      )
    );
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).rejects.toMatchObject({
      statusCode: 503,
      errorCode: "storage_unavailable",
      message: "storage_unavailable",
    });
  });

  it("replays when an insert race exposes the same completed hash", async () => {
    const { persistCalls, dependencies } = makeDependencies();
    (dependencies.insertVerifyingReceipt as jest.Mock).mockImplementationOnce(
      async () => {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      }
    );
    (dependencies.findReceipt as jest.Mock)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(receiptRow());
    const pinner = createFinalizePinner(dependencies);

    await expect(pinner.pin(PIN_INPUT)).resolves.toEqual({
      response: { sessionId: SESSION_ID, status: "submitted" },
      responseStatus: 200,
      replayed: true,
    });
    expect(persistCalls).toHaveLength(0);
  });
});
