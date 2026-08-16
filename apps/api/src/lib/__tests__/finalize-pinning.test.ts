import fc from "fast-check";
import {
  hashFinalizePinRequest,
  parseFinalizePinRequest,
  FinalizePinError,
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
