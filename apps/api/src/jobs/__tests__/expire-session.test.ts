const mockExecuteTakeFirst = jest.fn();
const mockExecute = jest.fn();
const mockDeleteAudio = jest.fn();

const mockSelectChain = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  executeTakeFirst: mockExecuteTakeFirst,
};
const mockUpdateChain = {
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute: mockExecute,
};

jest.mock("../../lib/db", () => ({
  db: {
    selectFrom: jest.fn(() => mockSelectChain),
    updateTable: jest.fn(() => mockUpdateChain),
  },
}));
jest.mock("../../lib/storage", () => ({
  deleteAudio: (...args: unknown[]) => mockDeleteAudio(...args),
}));
jest.mock("../../lib/logger", () => ({
  jobLogger: jest.fn().mockReturnValue({
    info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn(),
  }),
}));

import { runExpireSessionJob } from "../expire-session";
import { db } from "../../lib/db";

beforeEach(() => {
  jest.clearAllMocks();
  mockSelectChain.select.mockReturnThis();
  mockSelectChain.where.mockReturnThis();
  mockUpdateChain.set.mockReturnThis();
  mockUpdateChain.where.mockReturnThis();
  mockExecute.mockResolvedValue([]);
  mockDeleteAudio.mockResolvedValue(undefined);
});

describe("runExpireSessionJob", () => {
  it.each([
    ["a missing Session", undefined],
    ["a terminal Session", { id: "session-1", status: "completed" }],
  ])("skips %s", async (_caseName, session) => {
    mockExecuteTakeFirst.mockResolvedValue(session);

    await runExpireSessionJob({ sessionId: "session-1" });

    expect(mockDeleteAudio).not.toHaveBeenCalled();
    expect(db.updateTable).not.toHaveBeenCalled();
  });

  it("deletes the exact persisted legacy storage key before expiring", async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ id: "session-1", status: "created" })
      .mockResolvedValueOnce({ storage_key: "recordings/session-1.webm" });

    await runExpireSessionJob({ sessionId: "session-1" });

    expect(mockDeleteAudio).toHaveBeenCalledWith("recordings/session-1.webm");
    expect(mockUpdateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "expired",
    }));
  });

  it("still expires the Session when legacy audio deletion fails", async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ id: "session-1", status: "created" })
      .mockResolvedValueOnce({ storage_key: "recordings/session-1.webm" });
    mockDeleteAudio.mockRejectedValue(new Error("storage unavailable"));

    await expect(runExpireSessionJob({ sessionId: "session-1" })).resolves.toBeUndefined();

    expect(mockUpdateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "expired",
      updated_at: expect.any(Date),
    }));
    expect(mockExecute).toHaveBeenCalledTimes(1);
  });

  it("marks an active Session expired when no recording exists", async () => {
    mockExecuteTakeFirst
      .mockResolvedValueOnce({ id: "session-1", status: "opened" })
      .mockResolvedValueOnce(undefined);

    await runExpireSessionJob({ sessionId: "session-1" });

    expect(mockDeleteAudio).not.toHaveBeenCalled();
    expect(mockUpdateChain.set).toHaveBeenCalledWith(expect.objectContaining({
      status: "expired",
    }));
  });
});
