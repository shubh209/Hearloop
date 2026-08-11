const mockWithQueue = jest.fn();

jest.mock("../queue", () => ({
  withQueue: (...args: unknown[]) => mockWithQueue(...args),
}));

import { partnerHasActiveImport } from "../import-job-status";

beforeEach(() => {
  mockWithQueue.mockReset();
});

it("looks up import jobs through withQueue, not a fresh IORedis client", async () => {
  mockWithQueue.mockImplementation(async (_name, fn) =>
    fn({
      getJobs: async () => [{ data: { partnerId: "partner-1" } }],
    })
  );

  await expect(partnerHasActiveImport("partner-1")).resolves.toBe(true);
  expect(mockWithQueue).toHaveBeenCalledWith(
    "import-business-context",
    expect.any(Function)
  );
});
