import {
  buildSessionMetadata,
  InvalidSessionCaptureConfigError,
  isFinalizeConsentValid,
  readLegacyValidationHandoff,
  readSessionCaptureConfig,
  writeLegacyValidationHandoff,
} from "../session-capture-config";

describe("Session capture configuration", () => {
  it("retains caller metadata while reserved capture fields remain authoritative", () => {
    const metadataJson = buildSessionMetadata({
      metadata: {
        campaign: "summer-service",
        consentRequired: false,
        promptText: "Caller-controlled prompt",
        target: { label: "Caller target" },
      },
      promptText: "How was your visit?",
      consentRequired: true,
      consentText: "I agree to audio processing.",
      target: {
        label: "North Ave — Oil Change",
        key: "north-ave-oil-change",
        source: "capture-link",
      },
    });

    expect(JSON.parse(metadataJson)).toEqual({
      campaign: "summer-service",
      promptText: "How was your visit?",
      consentRequired: true,
      consentText: "I agree to audio processing.",
      target: {
        label: "North Ave — Oil Change",
        key: "north-ave-oil-change",
        source: "capture-link",
      },
    });
  });

  it("persists an explicit non-required authority when no custom prompt exists", () => {
    expect(JSON.parse(buildSessionMetadata({}))).toEqual({
      consentRequired: false,
      target: null,
    });
  });

  it("keeps the internal validation handoff authoritative and preserves capture metadata", () => {
    const metadataJson = buildSessionMetadata({
      metadata: {
        campaign: "summer-service",
        _hearloopValidationHandoff: {
          state: "enqueued",
          languageHint: "attacker-controlled",
        },
      },
      promptText: "How was your visit?",
      consentRequired: true,
    });

    expect(readLegacyValidationHandoff(metadataJson)).toBeNull();

    const pendingJson = writeLegacyValidationHandoff(metadataJson, {
      state: "pending",
      languageHint: "en-US",
    });
    expect(readLegacyValidationHandoff(pendingJson)).toEqual({
      state: "pending",
      languageHint: "en-US",
    });
    expect(readSessionCaptureConfig(pendingJson)).toEqual({
      promptText: "How was your visit?",
      consentRequired: true,
      consentText: undefined,
      target: null,
    });

    const enqueuedJson = writeLegacyValidationHandoff(pendingJson, {
      state: "enqueued",
      languageHint: "en-US",
    });
    expect(readLegacyValidationHandoff(enqueuedJson)).toEqual({
      state: "enqueued",
      languageHint: "en-US",
    });
    expect(JSON.parse(enqueuedJson)).toEqual(expect.objectContaining({
      campaign: "summer-service",
      promptText: "How was your visit?",
      consentRequired: true,
    }));
  });

  it.each([
    [true, undefined, false],
    [true, false, false],
    [true, true, true],
    [false, undefined, true],
  ])(
    "evaluates consentRequired=%s and consentGiven=%s as %s",
    (consentRequired, consentGiven, expected) => {
      expect(
        isFinalizeConsentValid({ consentRequired }, consentGiven)
      ).toBe(expected);
    }
  );

  it("treats missing persisted metadata as consent not required", () => {
    expect(readSessionCaptureConfig(null)).toEqual({
      consentRequired: false,
      target: null,
    });
  });

  it.each([
    ["invalid JSON", "{"],
    ["non-object JSON", "[]"],
    ["invalid consentRequired", JSON.stringify({ consentRequired: "yes" })],
    ["invalid consentText", JSON.stringify({ consentRequired: true, consentText: 7 })],
    [
      "invalid Target",
      JSON.stringify({
        consentRequired: false,
        target: { label: "North", key: "north", source: "widget" },
      }),
    ],
  ])("rejects %s as malformed authority", (_caseName, metadataJson) => {
    expect(() => readSessionCaptureConfig(metadataJson)).toThrow(
      InvalidSessionCaptureConfigError
    );
  });
});
