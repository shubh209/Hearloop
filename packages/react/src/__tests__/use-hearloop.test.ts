/**
 * @jest-environment jsdom
 *
 * Tests for src/use-hearloop.ts
 *
 * Mock paths are relative to THIS file (__tests__/), so they use one extra ../
 * compared to the module under test (src/use-hearloop.ts).
 *
 * jest.mock factories are self-contained — no outer const/let references.
 */

import * as fc from "fast-check";
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports of the module under test
// ---------------------------------------------------------------------------

// Mock audio-capture — startRecording is the only export used by the hook
// Path is relative to THIS file (src/__tests__/), so one level up to reach src/
jest.mock("../audio-capture", () => ({
  startRecording: jest.fn(),
}));

// Mock api-client — runApiFlow is the only export used by the hook
jest.mock("../api-client", () => ({
  runApiFlow: jest.fn(),
}));

// Now import the hook and the mocked modules
import { useHearloop } from "../use-hearloop";
import { startRecording as mockStartRecordingImport } from "../audio-capture";
import { runApiFlow as mockRunApiFlowImport } from "../api-client";

const mockStartRecording = mockStartRecordingImport as jest.Mock;
const mockRunApiFlow = mockRunApiFlowImport as jest.Mock;

// ---------------------------------------------------------------------------
// MediaRecorder + getUserMedia global mocks
// ---------------------------------------------------------------------------

/** Build a minimal fake MediaRecorder that tracks calls */
function makeFakeMediaRecorder() {
  return {
    start: jest.fn(),
    stop: jest.fn(),
    state: "inactive" as string,
    ondataavailable: null as ((e: { data: Blob }) => void) | null,
    onstop: null as (() => void) | null,
  };
}

/** Build a minimal fake MediaStream with stoppable tracks */
function makeFakeStream() {
  const track = { stop: jest.fn() };
  return {
    getTracks: jest.fn().mockReturnValue([track]),
    _track: track,
  };
}

// ---------------------------------------------------------------------------
// Helper: build a resolved startRecording handle that fires onstop immediately
// ---------------------------------------------------------------------------

/**
 * Sets up mockStartRecording to simulate a successful mic grant.
 * Returns the fake stop handle so tests can trigger onstop manually.
 */
function setupSuccessfulStartRecording(blob: Blob = new Blob(["audio"], { type: "audio/webm" })) {
  let capturedOnStop: ((b: Blob, mimeType: string) => void) | null = null;

  const stopHandle = {
    stop: jest.fn().mockImplementation(() => {
      // Simulate MediaRecorder firing onstop after stop() is called
      if (capturedOnStop) {
        capturedOnStop(blob, "audio/webm");
      }
    }),
  };

  mockStartRecording.mockImplementation((onStop: (b: Blob, mimeType: string) => void) => {
    capturedOnStop = onStop;
    return Promise.resolve(stopHandle);
  });

  return { stopHandle, getBlob: () => blob };
}

// ---------------------------------------------------------------------------
// beforeEach — reset all mocks
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();

  // Default: startRecording rejects (tests that need success override this)
  mockStartRecording.mockRejectedValue(new Error("Not configured"));
  // Default: runApiFlow resolves
  mockRunApiFlow.mockResolvedValue(undefined);
});

// ===========================================================================
// Unit Tests
// ===========================================================================

describe("useHearloop — unit tests", () => {
  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  describe("initial state", () => {
    it('state is "idle", secondsLeft is 5 (default), audioBlob is null, error is null', () => {
      const { result } = renderHook(() => useHearloop({}));
      expect(result.current.state).toBe("idle");
      expect(result.current.secondsLeft).toBe(5);
      expect(result.current.audioBlob).toBeNull();
      expect(result.current.error).toBeNull();
    });

    it("secondsLeft reflects custom maxDurationSec", () => {
      const { result } = renderHook(() => useHearloop({ maxDurationSec: 10 }));
      expect(result.current.secondsLeft).toBe(10);
    });
  });

  // -------------------------------------------------------------------------
  // startRecording — success
  // -------------------------------------------------------------------------

  describe("startRecording()", () => {
    it('transitions to "recording" on mic grant', async () => {
      setupSuccessfulStartRecording();

      const { result } = renderHook(() => useHearloop({ sessionCreateToken: "tok" }));

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.state).toBe("recording");
      expect(result.current.error).toBeNull();
    });

    it('transitions to "error" on mic denial with correct message', async () => {
      mockStartRecording.mockRejectedValue(
        new Error("Microphone access denied. Please allow mic access and try again.")
      );

      const { result } = renderHook(() => useHearloop({}));

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.state).toBe("error");
      expect(result.current.error).toBe(
        "Microphone access denied. Please allow mic access and try again."
      );
    });

    it('transitions to "error" when MediaRecorder is not available', async () => {
      mockStartRecording.mockRejectedValue(
        new Error("MediaRecorder is not supported in this browser.")
      );

      const { result } = renderHook(() => useHearloop({}));

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.state).toBe("error");
      expect(result.current.error).toBe(
        "MediaRecorder is not supported in this browser."
      );
    });
  });

  // -------------------------------------------------------------------------
  // stopRecording — transitions to "recorded"
  // -------------------------------------------------------------------------

  describe("stopRecording()", () => {
    it('transitions to "recorded" and the audioBlob is set', async () => {
      const blob = new Blob(["audio-data"], { type: "audio/webm" });
      const { stopHandle } = setupSuccessfulStartRecording(blob);

      const { result } = renderHook(() => useHearloop({ sessionCreateToken: "tok" }));

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.state).toBe("recording");

      await act(async () => {
        result.current.stopRecording();
      });

      // stopHandle.stop() fires the onStop callback which sets audioBlob + "recorded"
      expect(stopHandle.stop).toHaveBeenCalled();
      expect(result.current.state).toBe("recorded");
      expect(result.current.audioBlob).toBe(blob);
    });
  });

  // -------------------------------------------------------------------------
  // send() — auth guard
  // -------------------------------------------------------------------------

  describe("send() — auth guard", () => {
    it('transitions to "error" with correct message when no auth provided, without calling fetch', async () => {
      // Define fetch on global so we can spy on it
      const mockFetch = jest.fn();
      (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

      const { result } = renderHook(() => useHearloop({}));

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.state).toBe("error");
      expect(result.current.error).toBe(
        "No authentication provided. Pass sessionCreateToken or apiKey."
      );
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockRunApiFlow).not.toHaveBeenCalled();

      // Cleanup
      delete (global as unknown as { fetch?: jest.Mock }).fetch;
    });
  });

  // -------------------------------------------------------------------------
  // send() — success
  // -------------------------------------------------------------------------

  describe("send() — success", () => {
    it('transitions to "success" when runApiFlow resolves', async () => {
      const blob = new Blob(["audio"], { type: "audio/webm" });
      setupSuccessfulStartRecording(blob);
      mockRunApiFlow.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useHearloop({ sessionCreateToken: "tok" })
      );

      // Record first
      await act(async () => {
        await result.current.startRecording();
      });
      await act(async () => {
        result.current.stopRecording();
      });

      expect(result.current.state).toBe("recorded");

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.state).toBe("success");
      expect(mockRunApiFlow).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // send() — failure preserves audioBlob
  // -------------------------------------------------------------------------

  describe("send() — failure", () => {
    it('transitions to "error" and preserves audioBlob when runApiFlow rejects', async () => {
      const blob = new Blob(["audio"], { type: "audio/webm" });
      setupSuccessfulStartRecording(blob);
      mockRunApiFlow.mockRejectedValue(new Error("Failed to create session."));

      const { result } = renderHook(() =>
        useHearloop({ sessionCreateToken: "tok" })
      );

      await act(async () => {
        await result.current.startRecording();
      });
      await act(async () => {
        result.current.stopRecording();
      });

      expect(result.current.state).toBe("recorded");

      await act(async () => {
        await result.current.send();
      });

      expect(result.current.state).toBe("error");
      expect(result.current.error).toBe("Failed to create session.");
      // audioBlob must be preserved — not cleared on failure
      expect(result.current.audioBlob).toBe(blob);
    });
  });

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------

  describe("reset()", () => {
    it('from "error" returns to "idle" with audioBlob: null, error: null', async () => {
      mockStartRecording.mockRejectedValue(
        new Error("Microphone access denied. Please allow mic access and try again.")
      );

      const { result } = renderHook(() => useHearloop({ maxDurationSec: 7 }));

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.state).toBe("error");

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toBe("idle");
      expect(result.current.audioBlob).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.secondsLeft).toBe(7);
    });

    it('from "success" returns to "idle"', async () => {
      const blob = new Blob(["audio"], { type: "audio/webm" });
      setupSuccessfulStartRecording(blob);
      mockRunApiFlow.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useHearloop({ sessionCreateToken: "tok", maxDurationSec: 5 })
      );

      await act(async () => {
        await result.current.startRecording();
      });
      await act(async () => {
        result.current.stopRecording();
      });
      await act(async () => {
        await result.current.send();
      });

      expect(result.current.state).toBe("success");

      act(() => {
        result.current.reset();
      });

      expect(result.current.state).toBe("idle");
    });
  });

  // -------------------------------------------------------------------------
  // Countdown
  // -------------------------------------------------------------------------

  describe("countdown", () => {
    it("decrements secondsLeft each second and auto-stops at 0", async () => {
      jest.useFakeTimers();

      const blob = new Blob(["audio"], { type: "audio/webm" });
      const { stopHandle } = setupSuccessfulStartRecording(blob);

      const { result } = renderHook(() =>
        useHearloop({ sessionCreateToken: "tok", maxDurationSec: 3 })
      );

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.state).toBe("recording");
      expect(result.current.secondsLeft).toBe(3);

      // Advance 1 second
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.secondsLeft).toBe(2);

      // Advance 1 more second
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.secondsLeft).toBe(1);

      // Advance final second — should trigger auto-stop
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(result.current.secondsLeft).toBe(0);
      expect(stopHandle.stop).toHaveBeenCalled();
      // After auto-stop fires onStop callback, state should be "recorded"
      expect(result.current.state).toBe("recorded");

      jest.useRealTimers();
    });
  });

  // -------------------------------------------------------------------------
  // Unmount cleanup
  // -------------------------------------------------------------------------

  describe("unmount cleanup", () => {
    it('unmount during "recording" calls stop handle and releases stream', async () => {
      const blob = new Blob(["audio"], { type: "audio/webm" });
      const { stopHandle } = setupSuccessfulStartRecording(blob);

      const { result, unmount } = renderHook(() =>
        useHearloop({ sessionCreateToken: "tok" })
      );

      await act(async () => {
        await result.current.startRecording();
      });

      expect(result.current.state).toBe("recording");

      act(() => {
        unmount();
      });

      // The cleanup effect should have called stop on the handle
      expect(stopHandle.stop).toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// Property-Based Tests
// ===========================================================================

// ---------------------------------------------------------------------------
// Property 1: Initial state reflects options defaults
// Feature: react-sdk, Property 1: Initial state reflects options defaults
// Validates: Requirements 3.1, 4.1
// ---------------------------------------------------------------------------

describe("Property 1: Initial state reflects options defaults", () => {
  it("state is idle, secondsLeft matches maxDurationSec, audioBlob and error are null", () => {
    // Feature: react-sdk, Property 1: Initial state reflects options defaults
    fc.assert(
      fc.property(
        fc.record({
          maxDurationSec: fc.option(fc.integer({ min: 1, max: 60 }), { nil: undefined }),
          promptText: fc.option(fc.string(), { nil: undefined }),
        }),
        (opts) => {
          const { result } = renderHook(() => useHearloop(opts));
          expect(result.current.state).toBe("idle");
          expect(result.current.secondsLeft).toBe(opts.maxDurationSec ?? 5);
          expect(result.current.audioBlob).toBeNull();
          expect(result.current.error).toBeNull();
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Reset always restores idle invariant
// Feature: react-sdk, Property 2: Reset always restores idle invariant
// Validates: Requirements 3.6
// ---------------------------------------------------------------------------

describe("Property 2: Reset always restores idle invariant", () => {
  it("reset() always returns to idle with cleared audioBlob, error, and correct secondsLeft", () => {
    // Feature: react-sdk, Property 2: Reset always restores idle invariant
    fc.assert(
      fc.property(
        fc.record({ maxDurationSec: fc.integer({ min: 1, max: 60 }) }),
        (opts) => {
          const { result } = renderHook(() => useHearloop(opts));

          act(() => {
            result.current.reset();
          });

          expect(result.current.state).toBe("idle");
          expect(result.current.audioBlob).toBeNull();
          expect(result.current.error).toBeNull();
          expect(result.current.secondsLeft).toBe(opts.maxDurationSec);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Missing auth always produces error without network calls
// Feature: react-sdk, Property 3: Missing auth always produces error without network calls
// Validates: Requirements 2.5
// ---------------------------------------------------------------------------

describe("Property 3: Missing auth always produces error without network calls", () => {
  it("send() with no auth sets error state and never calls runApiFlow or fetch", async () => {
    // Feature: react-sdk, Property 3: Missing auth always produces error without network calls
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          promptText: fc.option(fc.string(), { nil: undefined }),
          maxDurationSec: fc.option(fc.integer({ min: 1, max: 60 }), { nil: undefined }),
          // Explicitly no sessionCreateToken or apiKey
        }),
        async (opts) => {
          jest.clearAllMocks();

          // Define fetch on global so we can track calls
          const mockFetch = jest.fn();
          (global as unknown as { fetch: jest.Mock }).fetch = mockFetch;

          const { result } = renderHook(() => useHearloop(opts));

          await act(async () => {
            await result.current.send();
          });

          expect(result.current.state).toBe("error");
          expect(result.current.error).toBeTruthy();
          expect(mockFetch).not.toHaveBeenCalled();
          expect(mockRunApiFlow).not.toHaveBeenCalled();

          delete (global as unknown as { fetch?: jest.Mock }).fetch;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Auth routing determined by credential presence
// Feature: react-sdk, Property 4: Auth routing determined by credential presence
// Validates: Requirements 2.2, 2.3
// ---------------------------------------------------------------------------

describe("Property 4: Auth routing determined by credential presence", () => {
  it("runApiFlow is called with sessionCreateToken when provided (no apiKey exchange needed)", async () => {
    // Feature: react-sdk, Property 4: Auth routing determined by credential presence
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (token) => {
          jest.clearAllMocks();

          const blob = new Blob(["audio"], { type: "audio/webm" });
          setupSuccessfulStartRecording(blob);
          mockRunApiFlow.mockResolvedValue(undefined);

          const { result } = renderHook(() =>
            useHearloop({ sessionCreateToken: token })
          );

          await act(async () => {
            await result.current.startRecording();
          });
          await act(async () => {
            result.current.stopRecording();
          });
          await act(async () => {
            await result.current.send();
          });

          expect(mockRunApiFlow).toHaveBeenCalledTimes(1);
          // runApiFlow should be called with auth containing sessionCreateToken
          const callArgs = mockRunApiFlow.mock.calls[0];
          expect(callArgs[1]).toMatchObject({ sessionCreateToken: token });
        }
      ),
      { numRuns: 100 }
    );
  });

  it("runApiFlow is called with apiKey when only apiKey is provided", async () => {
    // Feature: react-sdk, Property 4: Auth routing determined by credential presence
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1 }),
        async (apiKey) => {
          jest.clearAllMocks();

          const blob = new Blob(["audio"], { type: "audio/webm" });
          setupSuccessfulStartRecording(blob);
          mockRunApiFlow.mockResolvedValue(undefined);

          const { result } = renderHook(() =>
            useHearloop({ apiKey })
          );

          await act(async () => {
            await result.current.startRecording();
          });
          await act(async () => {
            result.current.stopRecording();
          });
          await act(async () => {
            await result.current.send();
          });

          expect(mockRunApiFlow).toHaveBeenCalledTimes(1);
          const callArgs = mockRunApiFlow.mock.calls[0];
          expect(callArgs[1]).toMatchObject({ apiKey });
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5 (Property 7 in design): audioBlob preserved intact through any API failure
// Feature: react-sdk, Property 7: audioBlob preserved intact through any API failure
// Validates: Requirements 3.8
// ---------------------------------------------------------------------------

describe("Property 5 (design Property 7): audioBlob preserved intact through any API failure", () => {
  it("audioBlob is reference-equal to original blob after runApiFlow rejects", async () => {
    // Feature: react-sdk, Property 7: audioBlob preserved intact through any API failure
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 1, maxLength: 1000 }),
        async (audioData) => {
          jest.clearAllMocks();

          const blob = new Blob([audioData], { type: "audio/webm" });
          setupSuccessfulStartRecording(blob);
          mockRunApiFlow.mockRejectedValue(new Error("Failed to create session."));

          const { result } = renderHook(() =>
            useHearloop({ sessionCreateToken: "tok" })
          );

          await act(async () => {
            await result.current.startRecording();
          });
          await act(async () => {
            result.current.stopRecording();
          });

          expect(result.current.audioBlob).toBe(blob);

          await act(async () => {
            await result.current.send();
          });

          expect(result.current.state).toBe("error");
          // audioBlob must be reference-equal to the original blob
          expect(result.current.audioBlob).toBe(blob);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6 (design Property 6): Countdown is bounded and triggers auto-stop
// Feature: react-sdk, Property 6: Countdown is bounded and triggers auto-stop
// Validates: Requirements 3.4, 4.2
// ---------------------------------------------------------------------------

describe("Property 6 (design Property 6): Countdown is bounded and triggers auto-stop", () => {
  it("secondsLeft never goes below 0 and hook transitions to recorded when countdown reaches 0", async () => {
    // Feature: react-sdk, Property 6: Countdown is bounded and triggers auto-stop
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 10 }),
        async (maxDurationSec) => {
          jest.useFakeTimers();
          jest.clearAllMocks();

          const blob = new Blob(["audio"], { type: "audio/webm" });
          setupSuccessfulStartRecording(blob);

          const { result } = renderHook(() =>
            useHearloop({ sessionCreateToken: "tok", maxDurationSec })
          );

          await act(async () => {
            await result.current.startRecording();
          });

          expect(result.current.state).toBe("recording");

          const snapshots: number[] = [];

          // Advance one tick at a time and record secondsLeft
          for (let i = 0; i < maxDurationSec; i++) {
            await act(async () => {
              jest.advanceTimersByTime(1000);
            });
            snapshots.push(result.current.secondsLeft);
          }

          // secondsLeft must never go below 0
          expect(snapshots.every((s) => s >= 0)).toBe(true);
          // After maxDurationSec ticks, should be at 0 and state should be "recorded"
          expect(result.current.secondsLeft).toBe(0);
          expect(result.current.state).toBe("recorded");

          jest.useRealTimers();
        }
      ),
      { numRuns: 100 }
    );
  });
});
