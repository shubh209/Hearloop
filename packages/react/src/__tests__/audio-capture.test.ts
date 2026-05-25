import * as fc from "fast-check";
import { selectMimeType, createMediaRecorder } from "../audio-capture";

// ---------------------------------------------------------------------------
// Unit tests — selectMimeType
// ---------------------------------------------------------------------------

describe("selectMimeType", () => {
  it('returns "audio/webm;codecs=opus" when isTypeSupported returns true for it', () => {
    const isTypeSupported = (_mime: string) => true;
    expect(selectMimeType(isTypeSupported)).toBe("audio/webm;codecs=opus");
  });

  it('returns "audio/mp4" when isTypeSupported returns false for all webm variants but true for mp4', () => {
    const isTypeSupported = (mime: string) => mime === "audio/mp4";
    expect(selectMimeType(isTypeSupported)).toBe("audio/mp4");
  });

  it('returns "" when isTypeSupported returns false for everything', () => {
    const isTypeSupported = (_mime: string) => false;
    expect(selectMimeType(isTypeSupported)).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Unit tests — createMediaRecorder
// ---------------------------------------------------------------------------

describe("createMediaRecorder", () => {
  it("retries with audio/mp4 when new MediaRecorder throws on the first attempt", () => {
    const stream = {} as MediaStream;
    let callCount = 0;

    // Replace global MediaRecorder with a constructor that throws on first call
    const OriginalMediaRecorder = (global as unknown as { MediaRecorder: unknown }).MediaRecorder;
    (global as unknown as { MediaRecorder: unknown }).MediaRecorder = jest.fn(
      (_stream: MediaStream, options: { mimeType: string }) => {
        callCount++;
        if (callCount === 1) {
          throw new Error("NotSupportedError");
        }
        // Second call succeeds — return a minimal recorder-like object
        return { mimeType: options.mimeType };
      }
    );

    const recorder = createMediaRecorder(stream, "audio/webm;codecs=opus");

    expect(callCount).toBe(2);
    expect((recorder as unknown as { mimeType: string }).mimeType).toBe("audio/mp4");

    // Restore
    (global as unknown as { MediaRecorder: unknown }).MediaRecorder = OriginalMediaRecorder;
  });
});

// ---------------------------------------------------------------------------
// Property 5 — MIME type selection is deterministic and exhaustive
// Feature: react-sdk, Property 5: MIME type selection is deterministic and exhaustive
// Validates: Requirements 4.4
// ---------------------------------------------------------------------------

describe("Property 5: MIME type selection is deterministic and exhaustive", () => {
  const VALID_MIME_TYPES = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "",
  ] as const;

  it("always returns a member of the known MIME type set", () => {
    // Feature: react-sdk, Property 5: MIME type selection is deterministic and exhaustive
    fc.assert(
      fc.property(
        // One boolean per candidate: webm;codecs=opus, webm, ogg;codecs=opus, mp4
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (supportsWebmOpus, supportsWebm, supportsOggOpus, supportsMp4) => {
          const supportMap: Record<string, boolean> = {
            "audio/webm;codecs=opus": supportsWebmOpus,
            "audio/webm": supportsWebm,
            "audio/ogg;codecs=opus": supportsOggOpus,
            "audio/mp4": supportsMp4,
          };
          const isTypeSupported = (mime: string) => supportMap[mime] ?? false;
          const result = selectMimeType(isTypeSupported);
          expect(VALID_MIME_TYPES).toContain(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns the first supported MIME type in priority order", () => {
    // Feature: react-sdk, Property 5: MIME type selection is deterministic and exhaustive
    const CANDIDATES = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ] as const;

    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (supportsWebmOpus, supportsWebm, supportsOggOpus, supportsMp4) => {
          const supportMap: Record<string, boolean> = {
            "audio/webm;codecs=opus": supportsWebmOpus,
            "audio/webm": supportsWebm,
            "audio/ogg;codecs=opus": supportsOggOpus,
            "audio/mp4": supportsMp4,
          };
          const isTypeSupported = (mime: string) => supportMap[mime] ?? false;
          const result = selectMimeType(isTypeSupported);

          // The result must be the first candidate that is supported
          const expectedFirst = CANDIDATES.find((c) => supportMap[c]) ?? "";
          expect(result).toBe(expectedFirst);
        }
      ),
      { numRuns: 100 }
    );
  });
});
