// hearloop/apps/api/src/jobs/__tests__/validate-recording.test.ts
//
// Ticket 001 — validate-recording.ts must throw after markFailed() in every
// failure branch, so a BullMQ job outcome always agrees with
// sessions.status. Prior bug: several branches called markFailed() then
// `return`ed normally, so BullMQ reported the job "completed" while the
// session was "failed".

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that touch the modules under test
// ---------------------------------------------------------------------------

const logMock = {
  info:  jest.fn(),
  warn:  jest.fn(),
  error: jest.fn(),
};

jest.mock("../../lib/logger", () => ({
  jobLogger: jest.fn().mockReturnValue({
    info:  jest.fn(),
    warn:  jest.fn(),
    error: jest.fn(),
  }),
}));

// storage — getAudioBuffer, controllable per test
const mockGetAudioBuffer = jest.fn();
jest.mock("../../lib/storage", () => ({
  getAudioBuffer: (...args: unknown[]) => mockGetAudioBuffer(...args),
}));

// queue — enqueueTranscribe
const mockEnqueueTranscribe = jest.fn();
jest.mock("../../lib/queue", () => ({
  enqueueTranscribe: (...args: unknown[]) => mockEnqueueTranscribe(...args),
}));

// db — mock the Kysely query builder chain used in validate-recording.ts
const mockExecute = jest.fn();

const mockUpdateChain = {
  set:     jest.fn().mockReturnThis(),
  where:   jest.fn().mockReturnThis(),
  execute: mockExecute,
};

jest.mock("../../lib/db", () => ({
  db: {
    updateTable: jest.fn(() => mockUpdateChain),
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { runValidateRecordingJob, type ValidateJobPayload } from "../validate-recording";
import { db } from "../../lib/db";

const BASE_PAYLOAD: ValidateJobPayload = {
  sessionId:  "session-abc",
  storageKey: "recordings/session-abc.webm",
  mimeType:   "audio/webm",
};

/** A minimal valid webm buffer (passes size + header checks). */
function validAudioBuffer(): Buffer {
  const buf = Buffer.alloc(2000, 0);
  buf[0] = 0x1a;
  buf[1] = 0x45;
  return buf;
}

function sessionsFailedSetCalls(): Record<string, unknown>[] {
  return mockUpdateChain.set.mock.calls
    .map((args: [Record<string, unknown>]) => args[0])
    .filter((set) => set?.status === "failed");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateChain.set.mockReturnThis();
  mockUpdateChain.where.mockReturnThis();
  mockExecute.mockResolvedValue([]);
  mockEnqueueTranscribe.mockResolvedValue(undefined);
});

describe("runValidateRecordingJob — failure branches must throw and mark session failed", () => {
  it("throws and marks session failed when storage fetch rejects", async () => {
    mockGetAudioBuffer.mockRejectedValue(new Error("S3 timeout"));

    await expect(runValidateRecordingJob(BASE_PAYLOAD)).rejects.toThrow();

    expect(db.updateTable).toHaveBeenCalledWith("sessions");
    const failedCalls = sessionsFailedSetCalls();
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]).toMatchObject({
      status: "failed",
      failure_reason: "storage_fetch_error",
    });

    // Must not proceed to enqueue transcription
    expect(mockEnqueueTranscribe).not.toHaveBeenCalled();
  });

  it("throws and marks session failed for unsupported mime type", async () => {
    await expect(
      runValidateRecordingJob({ ...BASE_PAYLOAD, mimeType: "audio/unsupported" })
    ).rejects.toThrow();

    const failedCalls = sessionsFailedSetCalls();
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]).toMatchObject({
      status: "failed",
      failure_reason: "unsupported_mime_type",
    });
  });

  it("throws and marks session failed for empty file", async () => {
    mockGetAudioBuffer.mockResolvedValue(Buffer.alloc(0));

    await expect(runValidateRecordingJob(BASE_PAYLOAD)).rejects.toThrow();

    const failedCalls = sessionsFailedSetCalls();
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]).toMatchObject({
      status: "failed",
      failure_reason: "empty_file",
    });
  });

  it("throws and marks session failed for file too small", async () => {
    mockGetAudioBuffer.mockResolvedValue(Buffer.alloc(500));

    await expect(runValidateRecordingJob(BASE_PAYLOAD)).rejects.toThrow();

    const failedCalls = sessionsFailedSetCalls();
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]).toMatchObject({
      status: "failed",
      failure_reason: "file_too_small",
    });
  });

  it("throws and marks session failed for file too large", async () => {
    mockGetAudioBuffer.mockResolvedValue(Buffer.alloc(11 * 1024 * 1024));

    await expect(runValidateRecordingJob(BASE_PAYLOAD)).rejects.toThrow();

    const failedCalls = sessionsFailedSetCalls();
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]).toMatchObject({
      status: "failed",
      failure_reason: "file_too_large",
    });
  });

  it("throws and marks session failed for invalid audio header", async () => {
    const badBuffer = Buffer.alloc(2000, 0); // wrong header bytes for webm
    mockGetAudioBuffer.mockResolvedValue(badBuffer);

    await expect(runValidateRecordingJob(BASE_PAYLOAD)).rejects.toThrow();

    const failedCalls = sessionsFailedSetCalls();
    expect(failedCalls).toHaveLength(1);
    expect(failedCalls[0]).toMatchObject({
      status: "failed",
      failure_reason: "invalid_audio_header",
    });
  });

  it("resolves and enqueues transcription on a valid recording (control case)", async () => {
    mockGetAudioBuffer.mockResolvedValue(validAudioBuffer());

    await expect(runValidateRecordingJob(BASE_PAYLOAD)).resolves.toBeUndefined();

    expect(sessionsFailedSetCalls()).toHaveLength(0);
    expect(mockEnqueueTranscribe).toHaveBeenCalledTimes(1);
  });
});
