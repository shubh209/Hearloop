export interface HealthSnapshotCacheOptions<T> {
  ttlMs: number;
  now: () => number;
  load: () => Promise<T>;
}

export interface HealthSnapshotCache<T> {
  get(): Promise<T>;
}

export function createHealthSnapshotCache<T>({
  ttlMs,
  now,
  load,
}: HealthSnapshotCacheOptions<T>): HealthSnapshotCache<T> {
  let snapshot: { at: number; body: T } | null = null;
  let inFlight: Promise<T> | null = null;

  return {
    get(): Promise<T> {
      const currentTime = now();
      if (snapshot && currentTime - snapshot.at < ttlMs) {
        return Promise.resolve(snapshot.body);
      }

      if (inFlight) return inFlight;

      inFlight = load().then(
        (body) => {
          snapshot = { at: now(), body };
          inFlight = null;
          return body;
        },
        (error) => {
          inFlight = null;
          throw error;
        }
      );

      return inFlight;
    },
  };
}
