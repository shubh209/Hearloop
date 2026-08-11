const mockDisconnect = jest.fn();
const mockClose = jest.fn();
const mockGetJobCounts = jest.fn();

jest.mock("ioredis", () =>
  jest.fn().mockImplementation(() => ({ disconnect: mockDisconnect }))
);

jest.mock("bullmq", () => ({
  Queue: jest.fn(),
  Worker: jest.fn(),
}));

import { Queue } from "bullmq";
import { QUEUE_NAMES, getWaitingJobCounts, withQueue } from "../queue";

beforeEach(() => {
  jest.clearAllMocks();
  mockClose.mockResolvedValue(undefined);
  (Queue as unknown as jest.Mock).mockImplementation((name: string) => ({
    name,
    getJobCounts: mockGetJobCounts,
    close: mockClose,
  }));
});

describe("getWaitingJobCounts", () => {
  it("reads waiting counts from the QUEUE_NAMES registry on one connection", async () => {
    mockGetJobCounts
      .mockResolvedValueOnce({ waiting: 2 })
      .mockResolvedValueOnce({ waiting: 0 })
      .mockResolvedValueOnce({ waiting: 1 })
      .mockResolvedValueOnce({ waiting: 3 });

    await expect(getWaitingJobCounts()).resolves.toEqual({
      validate: 2,
      transcribe: 0,
      analyze: 1,
      webhooks: 3,
    });

    expect((Queue as unknown as jest.Mock).mock.calls.map(([name]) => name)).toEqual([
      QUEUE_NAMES["validate-recording"],
      QUEUE_NAMES.transcribe,
      QUEUE_NAMES.analyze,
      QUEUE_NAMES["deliver-webhook"],
    ]);
    expect(mockClose).toHaveBeenCalledTimes(4);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it("closes queues and disconnects when a count throws", async () => {
    mockGetJobCounts.mockRejectedValue(new Error("boom"));

    await expect(getWaitingJobCounts()).rejects.toThrow("boom");
    expect(mockClose).toHaveBeenCalledTimes(4);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});

describe("withQueue", () => {
  it("opens the named queue, runs the callback, then closes", async () => {
    const result = await withQueue("import-business-context", async (queue) => {
      expect((queue as { name: string }).name).toBe(
        QUEUE_NAMES["import-business-context"]
      );
      return "ok";
    });

    expect(result).toBe("ok");
    expect(mockClose).toHaveBeenCalledTimes(1);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
