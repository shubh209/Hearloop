import { createHealthSnapshotCache } from "../health-snapshot-cache";

const HEALTHY = { status: "healthy" as const };

describe("createHealthSnapshotCache", () => {
  it("coalesces two concurrent reads into one load", async () => {
    let resolveLoad!: (body: typeof HEALTHY) => void;
    const load = jest.fn(
      () => new Promise<typeof HEALTHY>((resolve) => (resolveLoad = resolve))
    );
    const cache = createHealthSnapshotCache({
      ttlMs: 60_000,
      now: () => 0,
      load,
    });

    const first = cache.get();
    const second = cache.get();
    resolveLoad(HEALTHY);

    await expect(Promise.all([first, second])).resolves.toEqual([
      HEALTHY,
      HEALTHY,
    ]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reuses a resolved snapshot within 60,000 ms", async () => {
    let time = 10;
    const load = jest.fn().mockResolvedValue(HEALTHY);
    const cache = createHealthSnapshotCache({
      ttlMs: 60_000,
      now: () => time,
      load,
    });

    await cache.get();
    time = 60_009;
    await cache.get();

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("refreshes a snapshot at exactly 60,000 ms", async () => {
    let time = 10;
    const load = jest.fn().mockResolvedValue(HEALTHY);
    const cache = createHealthSnapshotCache({
      ttlMs: 60_000,
      now: () => time,
      load,
    });

    await cache.get();
    time = 60_010;
    await cache.get();

    expect(load).toHaveBeenCalledTimes(2);
  });

  it("retries the load after a rejection", async () => {
    const load = jest
      .fn()
      .mockRejectedValueOnce(new Error("health load failed"))
      .mockResolvedValueOnce(HEALTHY);
    const cache = createHealthSnapshotCache({
      ttlMs: 60_000,
      now: () => 0,
      load,
    });

    await expect(cache.get()).rejects.toThrow("health load failed");
    await expect(cache.get()).resolves.toBe(HEALTHY);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
