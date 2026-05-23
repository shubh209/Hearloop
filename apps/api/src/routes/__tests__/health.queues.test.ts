// apps/api/src/routes/__tests__/health.queues.test.ts
//
// Unit tests for checkQueues() — task 9.3
// Mocks bullmq Queue and ioredis IORedis so no real Redis connection is needed.

import { checkQueues, QueueDepths } from '../health';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock ioredis — IORedis is used as a constructor inside checkQueues()
const mockDisconnect = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    disconnect: mockDisconnect,
  }));
});

// Mock bullmq — Queue is used as a constructor inside checkQueues()
const mockClose = jest.fn();
const mockGetJobCounts = jest.fn();

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      getJobCounts: mockGetJobCounts,
      close: mockClose,
    })),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Default: close resolves immediately
  mockClose.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Test 1 — Success: all four queues return known counts
// ---------------------------------------------------------------------------

describe('checkQueues() — success', () => {
  it('maps waiting counts from all four queues into a QueueDepths object', async () => {
    // Arrange: each call to getJobCounts returns a different count
    // The four Queue instances are created in order: validate, transcribe, analyze, webhooks
    mockGetJobCounts
      .mockResolvedValueOnce({ waiting: 2, active: 0, completed: 0, failed: 0, delayed: 0 }) // validate
      .mockResolvedValueOnce({ waiting: 0, active: 1, completed: 5, failed: 0, delayed: 0 }) // transcribe
      .mockResolvedValueOnce({ waiting: 1, active: 0, completed: 0, failed: 0, delayed: 0 }) // analyze
      .mockResolvedValueOnce({ waiting: 3, active: 0, completed: 0, failed: 0, delayed: 0 }); // webhooks

    // Act
    const result = await checkQueues();

    // Assert: result is a QueueDepths object with the correct waiting counts
    expect(result).toEqual<QueueDepths>({
      validate: 2,
      transcribe: 0,
      analyze: 1,
      webhooks: 3,
    });
  });

  it('uses the waiting field (not active/completed/failed) for each queue key', async () => {
    // Arrange: waiting is 0 for all queues but other counts are non-zero
    mockGetJobCounts.mockResolvedValue({
      waiting: 0,
      active: 10,
      completed: 100,
      failed: 5,
      delayed: 2,
    });

    const result = await checkQueues();

    expect(result).toEqual<QueueDepths>({
      validate: 0,
      transcribe: 0,
      analyze: 0,
      webhooks: 0,
    });
  });

  it('defaults waiting to 0 when getJobCounts() returns undefined for waiting', async () => {
    // Arrange: waiting field is missing from the response
    mockGetJobCounts.mockResolvedValue({ active: 1 });

    const result = await checkQueues();

    expect(result).toEqual<QueueDepths>({
      validate: 0,
      transcribe: 0,
      analyze: 0,
      webhooks: 0,
    });
  });
});

// ---------------------------------------------------------------------------
// Test 2 — Partial failure: one queue throws
// ---------------------------------------------------------------------------

describe('checkQueues() — partial failure', () => {
  it('returns { status: "error", error: "<message>" } when one queue throws', async () => {
    const errorMessage = 'Redis connection refused';

    // Arrange: first three queues succeed, fourth throws
    mockGetJobCounts
      .mockResolvedValueOnce({ waiting: 1 })
      .mockResolvedValueOnce({ waiting: 0 })
      .mockImplementationOnce(() => { throw new Error(errorMessage); })
      .mockResolvedValueOnce({ waiting: 2 });

    const result = await checkQueues();

    expect(result).toEqual({ status: 'error', error: errorMessage });
  });

  it('returns { status: "error", error: "<message>" } when the first queue throws', async () => {
    const errorMessage = 'Queue not found';

    mockGetJobCounts.mockImplementation(() => { throw new Error(errorMessage); });

    const result = await checkQueues();

    expect(result).toEqual({ status: 'error', error: errorMessage });
  });

  it('uses String(err) for non-Error thrown values', async () => {
    mockGetJobCounts
      .mockResolvedValueOnce({ waiting: 0 })
      .mockImplementationOnce(() => { throw 'plain string error'; })
      .mockResolvedValueOnce({ waiting: 0 })
      .mockResolvedValueOnce({ waiting: 0 });

    const result = await checkQueues();

    expect(result).toEqual({ status: 'error', error: 'plain string error' });
  });
});

// ---------------------------------------------------------------------------
// Test 3 — Cleanup: close() and disconnect() are always called
// ---------------------------------------------------------------------------

describe('checkQueues() — cleanup', () => {
  it('calls queue.close() for all four queues on success', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 0 });

    await checkQueues();

    // Four Queue instances were created, each should have close() called once
    expect(mockClose).toHaveBeenCalledTimes(4);
  });

  it('calls conn.disconnect() on success', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 0 });

    await checkQueues();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('calls queue.close() for all four queues when one queue throws', async () => {
    mockGetJobCounts
      .mockResolvedValueOnce({ waiting: 1 })
      .mockImplementationOnce(() => Promise.reject(new Error('boom')))
      .mockResolvedValueOnce({ waiting: 0 })
      .mockResolvedValueOnce({ waiting: 0 });

    await checkQueues();

    expect(mockClose).toHaveBeenCalledTimes(4);
  });

  it('calls conn.disconnect() when one queue throws', async () => {
    mockGetJobCounts.mockImplementation(() => { throw new Error('boom'); });

    await checkQueues();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('calls conn.disconnect() even when all queues throw', async () => {
    mockGetJobCounts.mockImplementation(() => { throw new Error('all failed'); });

    await checkQueues();

    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('calls queue.close() for all four queues even when all queues throw', async () => {
    mockGetJobCounts.mockImplementation(() => { throw new Error('all failed'); });

    await checkQueues();

    expect(mockClose).toHaveBeenCalledTimes(4);
  });

  it('still calls conn.disconnect() when queue.close() itself throws', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 0 });
    mockClose.mockImplementation(() => Promise.reject(new Error('close failed')));

    await checkQueues();

    // Promise.allSettled swallows close errors — disconnect should still be called
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
