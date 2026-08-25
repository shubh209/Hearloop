import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Recorder from "../Recorder";

const TOKEN = "session-public-token";
const trackStop = jest.fn();
const stream = { getTracks: () => [{ stop: trackStop }, { stop: trackStop }] } as unknown as MediaStream;

class FakeMediaRecorder {
  static isTypeSupported = () => true;
  state = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, _options: MediaRecorderOptions) {}

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) });
    this.onstop?.();
  }
}

function jsonResponse(body: unknown, ok = true) {
  return Promise.resolve({ ok, json: async () => body } as Response);
}

async function reachPreview() {
  render(<Recorder sessionToken={TOKEN} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to start/i }));
  await screen.findByRole("button", { name: /record/i });
  fireEvent.click(screen.getByRole("button", { name: /record/i }));
  const stopHint = screen.getByText(/tap to stop early/i);
  fireEvent.click(stopHint.previousElementSibling as HTMLButtonElement);
  await screen.findByRole("button", { name: /send feedback/i });
}

beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: jest.fn().mockResolvedValue(stream) },
  });
  Object.defineProperty(global, "MediaRecorder", {
    configurable: true,
    value: FakeMediaRecorder,
  });
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: jest.fn().mockReturnValue("blob:preview"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: jest.fn(),
  });
});

test("submits Hosted capture through config, open, upload, and finalize in order", async () => {
  const fetchMock = jest
    .fn()
    .mockImplementationOnce(() => jsonResponse({ allowedOrigins: [] }))
    .mockImplementationOnce(() => jsonResponse({}))
    .mockImplementationOnce(() => jsonResponse({ uploadUrl: "https://storage.test/upload", storageKey: "recordings/a.webm" }))
    .mockImplementationOnce(() => jsonResponse({}))
    .mockImplementationOnce(() => jsonResponse({}));
  global.fetch = fetchMock;
  await reachPreview();

  fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

  await screen.findByText(/thank you for your feedback/i);
  expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
    `/api/public/session/${TOKEN}`,
    `/api/public/session/${TOKEN}/open`,
    `/api/public/session/${TOKEN}/upload-url`,
    "https://storage.test/upload",
    `/api/public/session/${TOKEN}/finalize`,
  ]);
});

test("does not use client-side origin comparison as capture authorization", async () => {
  const fetchMock = jest
    .fn()
    .mockImplementationOnce(() => jsonResponse({ allowedOrigins: ["https://partner.example"] }))
    .mockImplementationOnce(() => jsonResponse({}))
    .mockImplementationOnce(() => jsonResponse({ uploadUrl: "https://storage.test/upload", storageKey: "recordings/a.webm" }))
    .mockImplementationOnce(() => jsonResponse({}))
    .mockImplementationOnce(() => jsonResponse({}));
  global.fetch = fetchMock;
  await reachPreview();

  fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

  await screen.findByText(/thank you for your feedback/i);
  expect(fetchMock).toHaveBeenCalledTimes(5);
});

test("shows microphone denial and allows the End user to return to idle", async () => {
  (navigator.mediaDevices.getUserMedia as jest.Mock).mockRejectedValueOnce(new Error("denied"));
  render(<Recorder sessionToken={TOKEN} />);

  fireEvent.click(screen.getByRole("button", { name: /tap to start/i }));

  expect(await screen.findByText(/microphone access denied/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /try again/i }));
  expect(screen.getByRole("button", { name: /tap to start/i })).toBeInTheDocument();
});

test("surfaces MediaRecorder construction failures instead of leaving the recorder ready", async () => {
  class ThrowingMediaRecorder {
    static isTypeSupported = () => true;
    constructor() {
      throw new Error("recorder unavailable");
    }
  }
  Object.defineProperty(global, "MediaRecorder", { configurable: true, value: ThrowingMediaRecorder });
  render(<Recorder sessionToken={TOKEN} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to start/i }));
  const record = await screen.findByRole("button", { name: /record/i });

  fireEvent.click(record);

  expect(await screen.findByText(/unable to start recording/i)).toBeInTheDocument();
});

test("Cancel clears preview resources and makes no network request", async () => {
  global.fetch = jest.fn();
  await reachPreview();

  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /tap to start/i })).toBeInTheDocument();
});

test("Cancel during recording stops every media track and makes no network request", async () => {
  global.fetch = jest.fn();
  render(<Recorder sessionToken={TOKEN} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to start/i }));
  fireEvent.click(await screen.findByRole("button", { name: /record/i }));
  trackStop.mockClear();

  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

  expect(trackStop).toHaveBeenCalledTimes(2);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /tap to start/i })).toBeInTheDocument();
});

test("a delayed stop from a cancelled recorder cannot replace a newer recording", async () => {
  const recorders: DelayedStopMediaRecorder[] = [];
  class DelayedStopMediaRecorder extends FakeMediaRecorder {
    pendingStop: (() => void) | null = null;

    constructor(stream: MediaStream, options: MediaRecorderOptions) {
      super(stream, options);
      recorders.push(this);
    }

    stop() {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["old voice"], { type: "audio/webm" }) });
      this.pendingStop = this.onstop;
    }
  }
  Object.defineProperty(global, "MediaRecorder", {
    configurable: true,
    value: DelayedStopMediaRecorder,
  });
  render(<Recorder sessionToken={TOKEN} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to start/i }));
  fireEvent.click(await screen.findByRole("button", { name: /record/i }));
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

  fireEvent.click(screen.getByRole("button", { name: /tap to start/i }));
  fireEvent.click(await screen.findByRole("button", { name: /record/i }));
  await act(async () => recorders[0].pendingStop?.());

  expect(screen.getByText(/tap to stop early/i)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /send feedback/i })).not.toBeInTheDocument();
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});

test("Cancel is visible while permission is pending and stops a late stream without network", async () => {
  let resolveStream!: (value: MediaStream) => void;
  (navigator.mediaDevices.getUserMedia as jest.Mock).mockReturnValueOnce(
    new Promise<MediaStream>((resolve) => { resolveStream = resolve; })
  );
  global.fetch = jest.fn();
  render(<Recorder sessionToken={TOKEN} />);
  fireEvent.click(screen.getByRole("button", { name: /tap to start/i }));

  fireEvent.click(await screen.findByRole("button", { name: /cancel/i }));
  await act(async () => resolveStream(stream));

  await waitFor(() => expect(trackStop).toHaveBeenCalledTimes(2));
  expect(global.fetch).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /tap to start/i })).toBeInTheDocument();
});

test("a finalize failure keeps the audio preview available for retry", async () => {
  global.fetch = jest
    .fn()
    .mockImplementationOnce(() => jsonResponse({ allowedOrigins: [] }))
    .mockImplementationOnce(() => jsonResponse({}))
    .mockImplementationOnce(() => jsonResponse({ uploadUrl: "https://storage.test/upload", storageKey: "recordings/a.webm" }))
    .mockImplementationOnce(() => jsonResponse({}))
    .mockImplementationOnce(() => jsonResponse({}, false));
  await reachPreview();

  fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

  expect(await screen.findByText(/finalize failed/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /send feedback/i })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  expect(document.querySelector("audio")).toHaveAttribute("src", "blob:preview");
});

test("a lost finalize response retries only the identical idempotent finalize request", async () => {
  const fetchMock = jest
    .fn()
    .mockImplementationOnce(() => jsonResponse({ allowedOrigins: [] }))
    .mockImplementationOnce(() => jsonResponse({}))
    .mockImplementationOnce(() => jsonResponse({ uploadUrl: "https://storage.test/upload", storageKey: "recordings/a.webm" }))
    .mockImplementationOnce(() => jsonResponse({}))
    .mockRejectedValueOnce(new Error("finalize response lost"))
    .mockImplementationOnce(() => jsonResponse({}));
  global.fetch = fetchMock;
  await reachPreview();

  fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));
  expect(await screen.findByText(/finalize response lost/i)).toBeInTheDocument();
  const firstFinalizeOptions = fetchMock.mock.calls[4][1];

  fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

  await screen.findByText(/thank you for your feedback/i);
  expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
    `/api/public/session/${TOKEN}`,
    `/api/public/session/${TOKEN}/open`,
    `/api/public/session/${TOKEN}/upload-url`,
    "https://storage.test/upload",
    `/api/public/session/${TOKEN}/finalize`,
    `/api/public/session/${TOKEN}/finalize`,
  ]);
  expect(fetchMock.mock.calls[5][1]).toEqual(firstFinalizeOptions);
});

test("a rejected open preserves preview and stops before requesting upload", async () => {
  const fetchMock = jest
    .fn()
    .mockImplementationOnce(() => jsonResponse({ allowedOrigins: [] }))
    .mockImplementationOnce(() => jsonResponse({ error: "invalid_session_state" }, false));
  global.fetch = fetchMock;
  await reachPreview();

  fireEvent.click(screen.getByRole("button", { name: /send feedback/i }));

  expect(await screen.findByText(/unable to open this capture/i)).toBeInTheDocument();
  expect(fetchMock.mock.calls.map(([input]) => input)).toEqual([
    `/api/public/session/${TOKEN}`,
    `/api/public/session/${TOKEN}/open`,
  ]);
  expect(screen.getByRole("button", { name: /send feedback/i })).toBeInTheDocument();
  expect(document.querySelector("audio")).toHaveAttribute("src", "blob:preview");
});
