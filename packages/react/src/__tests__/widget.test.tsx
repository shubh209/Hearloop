/**
 * @jest-environment jsdom
 */

/**
 * widget.test.tsx — HearloopWidget rendering tests
 *
 * Single responsibility: verify that HearloopWidget renders the correct UI
 * for each state, has correct accessibility attributes, and forwards all
 * UseHearloopOptions fields unchanged to useHearloop.
 *
 * Mock paths are relative to THIS file (__tests__/), so use-hearloop is at
 * ../use-hearloop (one level up from __tests__/).
 *
 * jest.mock factories are self-contained — no outer const/let references.
 */

// Explicitly import jest-dom matchers since setupFilesAfterEnv may not run
// when jest is invoked with --rootDir from the monorepo root.
import "@testing-library/jest-dom";

import * as React from "react";
import { render, screen, act } from "@testing-library/react";
import * as fc from "fast-check";

// ---------------------------------------------------------------------------
// Mock useHearloop — factory is self-contained (jest-test-patterns.md rule 3)
// ---------------------------------------------------------------------------

jest.mock("../use-hearloop", () => ({
  useHearloop: jest.fn().mockReturnValue({
    state: "idle",
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    send: jest.fn(),
    reset: jest.fn(),
    audioBlob: null,
    secondsLeft: 5,
    error: null,
  }),
}));

// Import AFTER mock registration
import { HearloopWidget } from "../widget";
import { useHearloop } from "../use-hearloop";

const mockUseHearloop = useHearloop as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Override the mock return value for a single test. */
function setHookState(overrides: Partial<ReturnType<typeof useHearloop>>) {
  mockUseHearloop.mockReturnValue({
    state: "idle",
    startRecording: jest.fn(),
    stopRecording: jest.fn(),
    send: jest.fn(),
    reset: jest.fn(),
    audioBlob: null,
    secondsLeft: 5,
    error: null,
    ...overrides,
  });
}

/** Click the FAB to open the panel, wrapped in act(). */
function openPanel() {
  const fab = screen.getByRole("button", { name: /open feedback widget/i });
  act(() => {
    fab.click();
  });
}

// Minimal required prop
const BASE_PROPS = { sessionCreateToken: "tok" };

// ---------------------------------------------------------------------------
// beforeEach — reset mock to idle default
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  setHookState({});
});

// ---------------------------------------------------------------------------
// State: idle
// ---------------------------------------------------------------------------

describe("idle state", () => {
  it("renders the FAB", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    const fab = screen.getByRole("button", { name: /open feedback widget/i });
    expect(fab).toBeInTheDocument();
  });

  it("send button is disabled", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    const sendBtn = screen.getByRole("button", { name: /send feedback/i });
    expect(sendBtn).toBeDisabled();
  });

  it('mic label is "Tap to record feedback"', () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    expect(screen.getByText("Tap to record feedback")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// State: recording
// ---------------------------------------------------------------------------

describe("recording state", () => {
  beforeEach(() => {
    setHookState({ state: "recording", secondsLeft: 3 });
  });

  it("renders 7 waveform bars", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    const bars = document.querySelectorAll(".hl-r-bar");
    expect(bars).toHaveLength(7);
  });

  it("shows countdown text", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    expect(screen.getByText(/3s remaining/i)).toBeInTheDocument();
  });

  it("send button is disabled while recording", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    const sendBtn = screen.getByRole("button", { name: /send feedback/i });
    expect(sendBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// State: recorded
// ---------------------------------------------------------------------------

describe("recorded state", () => {
  beforeEach(() => {
    setHookState({ state: "recorded" });
  });

  it("send button is enabled", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    const sendBtn = screen.getByRole("button", { name: /send feedback/i });
    expect(sendBtn).not.toBeDisabled();
  });

  it("shows re-record affordance", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    expect(screen.getByText(/recorded.*tap to re-record/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// State: sending
// ---------------------------------------------------------------------------

describe("sending state", () => {
  beforeEach(() => {
    setHookState({ state: "sending" });
  });

  it('send button shows "Sending…" and is disabled', () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    const sendBtn = screen.getByRole("button", { name: /sending/i });
    expect(sendBtn).toBeDisabled();
    expect(sendBtn).toHaveTextContent(/sending/i);
  });
});

// ---------------------------------------------------------------------------
// State: success
// ---------------------------------------------------------------------------

describe("success state", () => {
  beforeEach(() => {
    setHookState({ state: "success" });
  });

  it("shows success screen", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    expect(screen.getByText(/feedback sent successfully/i)).toBeInTheDocument();
  });

  it("hides the main panel content (mic button not present)", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    expect(screen.queryByText("Tap to record feedback")).not.toBeInTheDocument();
  });

  it('shows "Give more feedback" button', () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    expect(
      screen.getByRole("button", { name: /give more feedback/i })
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// State: error
// ---------------------------------------------------------------------------

describe("error state", () => {
  const ERROR_MSG = "Something went wrong. Please try again.";

  beforeEach(() => {
    setHookState({ state: "error", error: ERROR_MSG });
  });

  it("shows error banner with the error message", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(alert).toHaveTextContent(ERROR_MSG);
  });
});

// ---------------------------------------------------------------------------
// Accessibility
// ---------------------------------------------------------------------------

describe("accessibility", () => {
  it("FAB has aria-label", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    const fab = screen.getByRole("button", { name: /open feedback widget/i });
    expect(fab).toHaveAttribute("aria-label");
  });

  it("panel has role=dialog and aria-label", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    const panel = screen.getByRole("dialog");
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute("aria-label");
  });

  it("mic button has aria-label", () => {
    render(<HearloopWidget {...BASE_PROPS} />);
    openPanel();
    const micBtn = screen.getByRole("button", { name: /start recording feedback/i });
    expect(micBtn).toHaveAttribute("aria-label");
  });
});

// ---------------------------------------------------------------------------
// Property 8 — Widget forwards all UseHearloopOptions fields unchanged
// Feature: react-sdk, Property 8: Widget forwards all UseHearloopOptions fields unchanged
// Validates: Requirements 5.4
// ---------------------------------------------------------------------------

describe("Property 8: Widget forwards all UseHearloopOptions fields unchanged", () => {
  it("passes all UseHearloopOptions fields to useHearloop unchanged", () => {
    // Feature: react-sdk, Property 8: Widget forwards all UseHearloopOptions fields unchanged
    fc.assert(
      fc.property(
        fc.record({
          promptText: fc.string(),
          maxDurationSec: fc.integer({ min: 1, max: 60 }),
          sessionCreateToken: fc.string({ minLength: 1 }),
        }),
        (opts) => {
          // Reset mock before each run so we get a fresh call count
          mockUseHearloop.mockClear();
          mockUseHearloop.mockReturnValue({
            state: "idle",
            startRecording: jest.fn(),
            stopRecording: jest.fn(),
            send: jest.fn(),
            reset: jest.fn(),
            audioBlob: null,
            secondsLeft: opts.maxDurationSec,
            error: null,
          });

          render(<HearloopWidget {...opts} />);

          expect(mockUseHearloop).toHaveBeenCalledWith(
            expect.objectContaining(opts)
          );
        }
      ),
      { numRuns: 100 }
    );
  });
});
