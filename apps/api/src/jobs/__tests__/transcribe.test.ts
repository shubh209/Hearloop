const mockGetAudioBuffer = jest.fn();
const mockTranscribeAudio = jest.fn();
const mockEnqueueAnalyze = jest.fn();
const mockExecute = jest.fn();
const mockMarkFailed = jest.fn();

const mockUpdateChain = {
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute: mockExecute,
};
const mockInsertChain = {
  values: jest.fn().mockReturnThis(),
  onConflict: jest.fn((callback: Function) => {
    callback({ column: jest.fn().mockReturnThis(), doUpdateSet: jest.fn() });
    return mockInsertChain;
  }),
  execute: mockExecute,
};

jest.mock("../../lib/storage", () => ({
  getAudioBuffer: (...args: unknown[]) => mockGetAudioBuffer(...args),
}));
jest.mock("../../lib/groq", () => ({
  transcribeAudio: (...args: unknown[]) => mockTranscribeAudio(...args),
}));
jest.mock("../../lib/queue", () => ({
  enqueueAnalyze: (...args: unknown[]) => mockEnqueueAnalyze(...args),
}));
jest.mock("../../lib/db", () => ({
  db: {
    updateTable: jest.fn(() => mockUpdateChain),
    insertInto: jest.fn(() => mockInsertChain),
  },
}));
jest.mock("../helpers/mark-failed", () => ({
  markFailed: (...args: unknown[]) => mockMarkFailed(...args),
}));
jest.mock("../../lib/logger", () => ({
  jobLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), error: jest.fn(),
  }),
}));

import { runTranscribeJob, type TranscribeJobPayload } from "../transcribe";

const payload: TranscribeJobPayload = {
  sessionId: "session-1",
  storageKey: "recordings/session-1.webm",
  mimeType: "audio/webm",
  languageHint: "en",
};
const transcript = {
  text: "Helpful staff and quick service.",
  detectedLanguage: "en",
  confidence: 0.98,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateChain.set.mockReturnThis();
  mockUpdateChain.where.mockReturnThis();
  mockInsertChain.values.mockReturnThis();
  mockExecute.mockResolvedValue([]);
  mockGetAudioBuffer.mockResolvedValue(Buffer.from("audio"));
  mockTranscribeAudio.mockResolvedValue(transcript);
  mockEnqueueAnalyze.mockResolvedValue(undefined);
  mockMarkFailed.mockResolvedValue(undefined);
});

describe("runTranscribeJob", () => {
  it("uses the shared failure path when storage fetch fails", async () => {
    mockGetAudioBuffer.mockRejectedValue(new Error("storage unavailable"));

    await expect(runTranscribeJob(payload)).rejects.toThrow("storage unavailable");

    expect(mockMarkFailed).toHaveBeenCalledWith(
      "session-1", "transcription_error", expect.anything()
    );
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
    expect(mockEnqueueAnalyze).not.toHaveBeenCalled();
  });

  it("uses the shared failure path when the transcription provider fails", async () => {
    mockTranscribeAudio.mockRejectedValue(new Error("provider unavailable"));

    await expect(runTranscribeJob(payload)).rejects.toThrow("provider unavailable");

    expect(mockMarkFailed).toHaveBeenCalledWith(
      "session-1", "transcription_error", expect.anything()
    );
    expect(mockEnqueueAnalyze).not.toHaveBeenCalled();
  });

  it("upserts the transcript and enqueues analysis", async () => {
    await runTranscribeJob(payload);

    expect(mockInsertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      session_id: "session-1",
      transcript: transcript.text,
      detected_language: "en",
      confidence: 0.98,
    }));
    expect(mockEnqueueAnalyze).toHaveBeenCalledWith({
      sessionId: "session-1",
      transcript: transcript.text,
      languageHint: "en",
    });
    expect(mockMarkFailed).not.toHaveBeenCalled();
  });

  it("uses the shared failure path when analysis enqueue fails", async () => {
    mockEnqueueAnalyze.mockRejectedValue(new Error("queue unavailable"));

    await expect(runTranscribeJob(payload)).rejects.toThrow("queue unavailable");

    expect(mockMarkFailed).toHaveBeenCalledWith(
      "session-1", "post_transcription_error", expect.anything()
    );
  });
});
