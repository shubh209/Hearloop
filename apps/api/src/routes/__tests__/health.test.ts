// hearloop/apps/api/src/routes/__tests__/health.test.ts
//
// Unit tests for health.ts check functions and route handler.
// All external I/O (db, IORedis, Queue) is mocked.

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports
// ---------------------------------------------------------------------------

const mockExecuteQuery = jest.fn();
jest.mock('../../lib/db', () => ({
  db: {
    executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    executeTakeFirstOrThrow: jest.fn(),
  },
}));

const mockPing = jest.fn();
const mockDisconnect = jest.fn();
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    ping: mockPing,
    disconnect: mockDisconnect,
  }));
});

const mockGetJobCounts = jest.fn();
const mockQueueClose = jest.fn();
jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    getJobCounts: mockGetJobCounts,
    close: mockQueueClose,
  })),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import {
  withTimeout,
  checkDatabase,
  checkRedis,
  checkQueues,
  checkPipeline,
  healthRoutes,
  HEALTH_TIMEOUT_MS,
} from '../health';
import { db } from '../../lib/db';

// ---------------------------------------------------------------------------
// withTimeout
// ---------------------------------------------------------------------------

describe('withTimeout', () => {
  jest.useFakeTimers();

  afterEach(() => jest.clearAllTimers());

  it('returns the promise value when it resolves before timeout', async () => {
    const p = Promise.resolve('done');
    const result = await withTimeout(p, 1000, 'fallback');
    expect(result).toBe('done');
  });

  it('returns fallback when promise does not resolve in time', async () => {
    const never = new Promise<string>(() => {/* never resolves */});
    const race = withTimeout(never, 100, 'fallback');
    jest.advanceTimersByTime(200);
    const result = await race;
    expect(result).toBe('fallback');
  });
});

// ---------------------------------------------------------------------------
// checkDatabase
// ---------------------------------------------------------------------------

describe('checkDatabase', () => {
  beforeEach(() => mockExecuteQuery.mockReset());

  it('returns ok with non-negative latencyMs on success', async () => {
    mockExecuteQuery.mockResolvedValue({});
    const result = await checkDatabase();
    expect(result.status).toBe('ok');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns error with latencyMs and message on throw', async () => {
    mockExecuteQuery.mockRejectedValue(new Error('connection refused'));
    const result = await checkDatabase();
    expect(result.status).toBe('error');
    expect(result.error).toBe('connection refused');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// checkRedis
// ---------------------------------------------------------------------------

describe('checkRedis', () => {
  beforeEach(() => {
    mockPing.mockReset();
    mockDisconnect.mockReset();
  });

  it('returns ok with latencyMs when PING returns PONG', async () => {
    mockPing.mockResolvedValue('PONG');
    const result = await checkRedis();
    expect(result.status).toBe('ok');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns error when PING returns unexpected value', async () => {
    mockPing.mockResolvedValue('LOADING');
    const result = await checkRedis();
    expect(result.status).toBe('error');
    expect(result.error).toMatch(/unexpected PING response/);
  });

  it('returns error when PING throws', async () => {
    mockPing.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await checkRedis();
    expect(result.status).toBe('error');
    expect(result.error).toBe('ECONNREFUSED');
  });

  it('always calls disconnect regardless of outcome', async () => {
    mockPing.mockResolvedValue('PONG');
    await checkRedis();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);

    mockDisconnect.mockReset();
    mockPing.mockRejectedValue(new Error('fail'));
    await checkRedis();
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });

  it('does not throw if disconnect itself throws', async () => {
    mockPing.mockResolvedValue('PONG');
    mockDisconnect.mockImplementation(() => { throw new Error('disconnect failed'); });
    await expect(checkRedis()).resolves.not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// checkQueues
// ---------------------------------------------------------------------------

describe('checkQueues', () => {
  beforeEach(() => {
    mockGetJobCounts.mockReset();
    mockQueueClose.mockReset().mockResolvedValue(undefined);
    mockDisconnect.mockReset();
  });

  it('returns QueueDepths with waiting counts on success', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 3, active: 1, completed: 0, failed: 0, delayed: 0, paused: 0 });
    const result = await checkQueues();
    expect(result).toEqual({ validate: 3, transcribe: 3, analyze: 3, webhooks: 3 });
  });

  it('returns error when any getJobCounts throws', async () => {
    mockGetJobCounts
      .mockResolvedValueOnce({ waiting: 0 })
      .mockRejectedValueOnce(new Error('redis timeout'));
    const result = await checkQueues();
    expect((result as any).status).toBe('error');
    expect((result as any).error).toBe('redis timeout');
  });

  it('always closes queues and disconnects regardless of outcome', async () => {
    mockGetJobCounts.mockResolvedValue({ waiting: 0 });
    await checkQueues();
    expect(mockQueueClose).toHaveBeenCalledTimes(4);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);

    mockQueueClose.mockReset().mockResolvedValue(undefined);
    mockDisconnect.mockReset();
    mockGetJobCounts.mockRejectedValue(new Error('fail'));
    await checkQueues();
    expect(mockQueueClose).toHaveBeenCalledTimes(4);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// checkPipeline
// ---------------------------------------------------------------------------

describe('checkPipeline', () => {
  const mockDb = db as any;

  beforeEach(() => {
    mockDb.selectFrom.mockReturnThis();
    mockDb.select.mockReturnThis();
    mockDb.where.mockReturnThis();
  });

  it('returns ok with computed stats on success', async () => {
    mockDb.executeTakeFirstOrThrow.mockResolvedValue({
      total: '4',
      completed: '3',
      failed: '1',
      avg_latency_ms: 1200,
    });
    const result = await checkPipeline();
    expect(result.status).toBe('ok');
    expect(result.completionRate24h).toBe(0.75);
    expect(result.avgLatencyMs).toBe(1200);
    expect(result.failedLast24h).toBe(1);
  });

  it('returns completionRate24h of 1.0 when total is 0', async () => {
    mockDb.executeTakeFirstOrThrow.mockResolvedValue({
      total: '0',
      completed: '0',
      failed: '0',
      avg_latency_ms: null,
    });
    const result = await checkPipeline();
    expect(result.status).toBe('ok');
    expect(result.completionRate24h).toBe(1.0);
    expect(result.avgLatencyMs).toBeNull();
  });

  it('returns avgLatencyMs as null when no completed sessions with timestamps', async () => {
    mockDb.executeTakeFirstOrThrow.mockResolvedValue({
      total: '2',
      completed: '2',
      failed: '0',
      avg_latency_ms: null,
    });
    const result = await checkPipeline();
    expect(result.avgLatencyMs).toBeNull();
  });

  it('returns error when query throws', async () => {
    mockDb.executeTakeFirstOrThrow.mockRejectedValue(new Error('DB down'));
    const result = await checkPipeline();
    expect(result.status).toBe('error');
    expect(result.error).toBe('DB down');
  });
});

// ---------------------------------------------------------------------------
// healthRoutes — route handler
// ---------------------------------------------------------------------------

describe('healthRoutes handler', () => {
  // Build a minimal Fastify-like mock
  const makeApp = (checkOverrides: Record<string, jest.Mock> = {}) => {
    let handler: Function;
    const app = {
      get: (_path: string, fn: Function) => { handler = fn; },
      getHandler: () => handler,
    };
    return app;
  };

  const makeReply = () => {
    const reply: any = {};
    reply.code = jest.fn().mockReturnValue(reply);
    reply.send = jest.fn().mockReturnValue(reply);
    return reply;
  };

  // Helper: run the route handler with mocked check functions
  const runHandler = async (
    dbResult: any,
    redisResult: any,
    queuesResult: any,
    pipelineResult: any
  ) => {
    // Patch the module-level check functions via jest.spyOn
    const spyDb = jest.spyOn(require('../health'), 'checkDatabase').mockResolvedValue(dbResult);
    const spyRedis = jest.spyOn(require('../health'), 'checkRedis').mockResolvedValue(redisResult);
    const spyQueues = jest.spyOn(require('../health'), 'checkQueues').mockResolvedValue(queuesResult);
    const spyPipeline = jest.spyOn(require('../health'), 'checkPipeline').mockResolvedValue(pipelineResult);

    const app: any = { get: jest.fn() };
    let capturedHandler: Function = async () => {};
    app.get.mockImplementation((_path: string, fn: Function) => { capturedHandler = fn; });

    await healthRoutes(app);
    const reply = makeReply();
    await capturedHandler({}, reply);

    spyDb.mockRestore();
    spyRedis.mockRestore();
    spyQueues.mockRestore();
    spyPipeline.mockRestore();

    return reply;
  };

  it('returns healthy when all checks pass', async () => {
    const reply = await runHandler(
      { status: 'ok', latencyMs: 10 },
      { status: 'ok', latencyMs: 4 },
      { validate: 0, transcribe: 0, analyze: 0, webhooks: 0 },
      { status: 'ok', completionRate24h: 1.0, avgLatencyMs: null, failedLast24h: 0 }
    );
    expect(reply.code).toHaveBeenCalledWith(200);
    const body = reply.send.mock.calls[0][0];
    expect(body.status).toBe('healthy');
  });

  it('returns degraded when database check fails', async () => {
    const reply = await runHandler(
      { status: 'error', error: 'connection refused', latencyMs: 5000 },
      { status: 'ok', latencyMs: 4 },
      { validate: 0, transcribe: 0, analyze: 0, webhooks: 0 },
      { status: 'ok', completionRate24h: 1.0, avgLatencyMs: null, failedLast24h: 0 }
    );
    expect(reply.code).toHaveBeenCalledWith(200);
    const body = reply.send.mock.calls[0][0];
    expect(body.status).toBe('degraded');
  });

  it('returns degraded when queue check fails', async () => {
    const reply = await runHandler(
      { status: 'ok', latencyMs: 10 },
      { status: 'ok', latencyMs: 4 },
      { status: 'error', error: 'redis timeout' },
      { status: 'ok', completionRate24h: 1.0, avgLatencyMs: null, failedLast24h: 0 }
    );
    expect(reply.code).toHaveBeenCalledWith(200);
    const body = reply.send.mock.calls[0][0];
    expect(body.status).toBe('degraded');
  });

  it('always returns HTTP 200 even when all checks fail', async () => {
    const err = { status: 'error', error: 'down' };
    const reply = await runHandler(err, err, err, err);
    expect(reply.code).toHaveBeenCalledWith(200);
    const body = reply.send.mock.calls[0][0];
    expect(body.status).toBe('degraded');
  });

  it('response always contains all four check fields', async () => {
    const ok = { status: 'ok', latencyMs: 1 };
    const depths = { validate: 0, transcribe: 0, analyze: 0, webhooks: 0 };
    const pipeline = { status: 'ok', completionRate24h: 1.0, avgLatencyMs: null, failedLast24h: 0 };
    const reply = await runHandler(ok, ok, depths, pipeline);
    const body = reply.send.mock.calls[0][0];
    expect(body.checks).toHaveProperty('database');
    expect(body.checks).toHaveProperty('redis');
    expect(body.checks).toHaveProperty('queueDepths');
    expect(body.checks).toHaveProperty('pipeline');
  });
});
