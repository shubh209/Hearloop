const mockSelectExecuteTakeFirst = jest.fn();
const mockUpdateExecuteTakeFirst = jest.fn();
const mockSet = jest.fn();

jest.mock("../db", () => ({
  db: {
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    executeTakeFirst: (...args: unknown[]) =>
      mockSelectExecuteTakeFirst(...args),
    updateTable: jest.fn().mockReturnValue({
      set: (...args: unknown[]) => {
        mockSet(...args);
        return {
          where: jest.fn().mockReturnThis(),
          returning: jest.fn().mockReturnThis(),
          executeTakeFirst: (...args: unknown[]) =>
            mockUpdateExecuteTakeFirst(...args),
        };
      },
    }),
  },
}));

jest.mock("../queue", () => ({ enqueueValidate: jest.fn() }));

import { acknowledgeLegacyValidationHandoff } from "../legacy-finalize-handoff";
import {
  readLegacyValidationHandoff,
  writeLegacyValidationHandoff,
} from "../session-capture-config";

const BASE_METADATA = JSON.stringify({
  promptText: "How was your visit?",
  consentRequired: true,
  target: {
    label: "North Ave — Oil Change",
    key: "north-ave-oil-change",
    source: "capture-link",
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateExecuteTakeFirst.mockResolvedValue({ id: "session-1" });
});

it("durably acknowledges a pending legacy validation handoff", async () => {
  const pendingMetadata = writeLegacyValidationHandoff(BASE_METADATA, {
    state: "pending",
    languageHint: "en-US",
  });
  mockSelectExecuteTakeFirst.mockResolvedValueOnce({
    id: "session-1",
    metadata_json: pendingMetadata,
  });

  await acknowledgeLegacyValidationHandoff("session-1");

  const acknowledgedMetadata = mockSet.mock.calls[0][0].metadata_json;
  expect(readLegacyValidationHandoff(acknowledgedMetadata)).toEqual({
    state: "enqueued",
    languageHint: "en-US",
  });
  expect(JSON.parse(acknowledgedMetadata)).toEqual(
    expect.objectContaining({
      promptText: "How was your visit?",
      consentRequired: true,
      target: expect.objectContaining({ key: "north-ave-oil-change" }),
    })
  );
});

it("preserves a non-legacy Session with no handoff marker", async () => {
  mockSelectExecuteTakeFirst.mockResolvedValueOnce({
    id: "session-1",
    metadata_json: BASE_METADATA,
  });

  await acknowledgeLegacyValidationHandoff("session-1");

  expect(mockSet).not.toHaveBeenCalled();
});

it("accepts a concurrent acknowledgement after its own conditional update loses", async () => {
  const pendingMetadata = writeLegacyValidationHandoff(BASE_METADATA, {
    state: "pending",
  });
  const enqueuedMetadata = writeLegacyValidationHandoff(BASE_METADATA, {
    state: "enqueued",
  });
  mockSelectExecuteTakeFirst
    .mockResolvedValueOnce({ id: "session-1", metadata_json: pendingMetadata })
    .mockResolvedValueOnce({ id: "session-1", metadata_json: enqueuedMetadata });
  mockUpdateExecuteTakeFirst.mockResolvedValueOnce(undefined);

  await expect(
    acknowledgeLegacyValidationHandoff("session-1")
  ).resolves.toBeUndefined();
});

it("rejects completion while a lost acknowledgement remains pending", async () => {
  const pendingMetadata = writeLegacyValidationHandoff(BASE_METADATA, {
    state: "pending",
  });
  mockSelectExecuteTakeFirst.mockResolvedValue({
    id: "session-1",
    metadata_json: pendingMetadata,
  });
  mockUpdateExecuteTakeFirst.mockResolvedValueOnce(undefined);

  await expect(
    acknowledgeLegacyValidationHandoff("session-1")
  ).rejects.toThrow("validation_handoff_acknowledgement_failed");
});
