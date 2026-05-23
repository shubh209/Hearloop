/**
 * Unit tests for checkRedis()
 *
 * Mocks the `ioredis` module so no real Redis connection is made.
 * Covers:
 *   1. Success — ping returns 'PONG' with non-zero latency
 *   2. Zero-latency retry — ping returns 'PONG' but Date.now() returns the
 *      same value twice on the first call, so ping() is called a second time
 *   3. Non-PONG response — ping returns 'LOADING'
 *   4. Throw — ping throws an Error
 *   5. Cleanup — disconnect() is called in all cases
 */

import IORedis from 'ioredis';
import { checkRedis } from '../health';

// ---------------------------------------------------------------------------
// Mock ioredis
// ---------------------------------------------------------------------------

jest.mock('ioredis');

const MockIORedis = IORedis as jest.MockedClass<typeof IORedis>;

/** Helper: build a mock IORedis instance with controllable ping and disconnect */
function makeMockConn(pingImpl: () => Promise<string>) {
  const conn = {
    ping: jest.fn(pingImpl),
    disconnect: jest.fn(),
  };
  MockIORedis.mockImplementation(() => conn as unknown as IORedis);
  return conn;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkRedis()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Restore real Date.now between tests
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Success
  // -------------------------------------------------------------------------
  it('returns { status: "ok", latencyMs: n } where n >= 0 when ping returns PONG', async () => {
    const conn = makeMockConn(() => Promise.resolve('PONG'));

    // Make Date.now() advance by 5ms on the second call so latencyMs > 0
    let callCount = 0;
    const base = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      // first call: start; second call: after ping → 5ms elapsed
      return callCount === 1 ? base : base + 5;
    });

    const result = await checkRedis();

    expect(result.status).toBe('ok');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(conn.ping).toHaveBeenCalledTimes(1);
  });

  // -------------------------------------------------------------------------
  // 2. Zero-latency retry
  // -------------------------------------------------------------------------
  it('calls ping() twice when Date.now() returns the same value on the first measurement', async () => {
    const conn = makeMockConn(() => Promise.resolve('PONG'));

    // Date.now() sequence:
    //   call 1 → start of first ping measurement
    //   call 2 → end of first ping measurement  (same value → latencyMs === 0)
    //   call 3 → start of second ping measurement
    //   call 4 → end of second ping measurement  (advance by 3ms)
    const base = 2_000_000;
    let callCount = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      if (callCount <= 2) return base;       // first measurement: 0ms
      if (callCount === 3) return base;      // second start
      return base + 3;                       // second end: 3ms
    });

    const result = await checkRedis();

    expect(conn.ping).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('ok');
    expect(result.latencyMs).toBe(3);
  });

  // -------------------------------------------------------------------------
  // 3. Non-PONG response
  // -------------------------------------------------------------------------
  it('returns { status: "error", error: "unexpected PING response: LOADING" } when ping returns LOADING', async () => {
    makeMockConn(() => Promise.resolve('LOADING'));

    // Ensure latencyMs > 0 so we don't trigger the retry path
    const base = 3_000_000;
    let callCount = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount === 1 ? base : base + 2;
    });

    const result = await checkRedis();

    expect(result.status).toBe('error');
    expect(result.error).toBe('unexpected PING response: LOADING');
  });

  // -------------------------------------------------------------------------
  // 4. Throw
  // -------------------------------------------------------------------------
  it('returns { status: "error", error: "connection refused" } when ping throws', async () => {
    makeMockConn(() => Promise.reject(new Error('connection refused')));

    const result = await checkRedis();

    expect(result.status).toBe('error');
    expect(result.error).toBe('connection refused');
  });

  // -------------------------------------------------------------------------
  // 5. Cleanup — disconnect() called in all cases
  // -------------------------------------------------------------------------
  it('calls conn.disconnect() on success', async () => {
    const conn = makeMockConn(() => Promise.resolve('PONG'));

    const base = 4_000_000;
    let callCount = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount === 1 ? base : base + 1;
    });

    await checkRedis();

    expect(conn.disconnect).toHaveBeenCalledTimes(1);
  });

  it('calls conn.disconnect() when ping returns a non-PONG response', async () => {
    const conn = makeMockConn(() => Promise.resolve('LOADING'));

    const base = 5_000_000;
    let callCount = 0;
    jest.spyOn(Date, 'now').mockImplementation(() => {
      callCount++;
      return callCount === 1 ? base : base + 1;
    });

    await checkRedis();

    expect(conn.disconnect).toHaveBeenCalledTimes(1);
  });

  it('calls conn.disconnect() when ping throws', async () => {
    const conn = makeMockConn(() => Promise.reject(new Error('connection refused')));

    await checkRedis();

    expect(conn.disconnect).toHaveBeenCalledTimes(1);
  });
});
