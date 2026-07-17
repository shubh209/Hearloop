const mockExecute = jest.fn();
const mockUpdateChain = {
  set: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  execute: mockExecute,
};

jest.mock("../../lib/db", () => ({
  db: {
    updateTable: jest.fn(() => mockUpdateChain),
  },
}));

import { db } from "../../lib/db";
import { markFailed } from "../helpers/mark-failed";

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateChain.set.mockReturnThis();
  mockUpdateChain.where.mockReturnThis();
  mockExecute.mockResolvedValue([]);
});

it("preserves the caller logger and each job's updated_at behavior", async () => {
  const log = { error: jest.fn() };

  await markFailed("session-touched", "transcription_error", log);
  await markFailed("session-untouched", "analysis_error", log, false);

  expect(log.error).toHaveBeenNthCalledWith(
    1,
    { sessionId: "session-touched", reason: "transcription_error" },
    "session failed"
  );
  expect(log.error).toHaveBeenNthCalledWith(
    2,
    { sessionId: "session-untouched", reason: "analysis_error" },
    "session failed"
  );
  expect(db.updateTable).toHaveBeenNthCalledWith(1, "sessions");
  expect(db.updateTable).toHaveBeenNthCalledWith(2, "sessions");
  expect(mockUpdateChain.set).toHaveBeenNthCalledWith(1, {
    status: "failed",
    failure_reason: "transcription_error",
    updated_at: expect.any(Date),
  });
  expect(mockUpdateChain.set).toHaveBeenNthCalledWith(2, {
    status: "failed",
    failure_reason: "analysis_error",
  });
  expect(mockUpdateChain.where).toHaveBeenNthCalledWith(
    1,
    "id",
    "=",
    "session-touched"
  );
  expect(mockUpdateChain.where).toHaveBeenNthCalledWith(
    2,
    "id",
    "=",
    "session-untouched"
  );
});
