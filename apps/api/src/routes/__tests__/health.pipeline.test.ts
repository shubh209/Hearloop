// apps/api/src/routes/__tests__/health.pipeline.test.ts
//
// Unit tests for checkPipeline() in routes/health.ts.
// Mocks ../lib/db so no real database connection is needed.

import { checkPipeline } from '../health';
import { db } from '../../lib/db';

// ---------------------------------------------------------------------------
// Mock the db module
// ---------------------------------------------------------------------------

// We need to mock the entire Kysely query builder chain:
//   db.selectFrom('sessions').select([...]).where(...).executeTakeFirstOrThrow()
// We build a chainable mock where each method returns `this` (or the builder),
// and executeTakeFirstOrThrow() is the terminal that we control per test.

const mockExecuteTakeFirstOrThrow = jest.fn();

const mockBuilder = {
  select: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  executeTakeFirstOrThrow: mockExecuteTakeFirstOrThrow,
};

jest.mock('../../lib/db', () => ({
  db: {
    selectFrom: jest.fn(),
  },
}));

// Also mock kysely's sql tag — checkPipeline uses sql<...>`...` for the WHERE
// clause and the SELECT expressions. We just need it to not throw; the actual
// SQL string is irrelevant for unit tests.
jest.mock('kysely', () => {
  const actual = jest.requireActual('kysely');
  const sqlResult = {
    compile: () => ({ sql: '', parameters: [] }),
    as: () => sqlResult,
  };
  const sqlTag = () => sqlResult;
  return {
    ...actual,
    sql: new Proxy(sqlTag, {
      get(target, prop) {
        if (prop === 'raw') return () => sqlResult;
        return (target as any)[prop];
      },
      apply(target, thisArg, args) {
        return sqlResult;
      },
    }),
  };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  // Re-attach the chain after clearAllMocks resets return values
  mockBuilder.select.mockReturnThis();
  mockBuilder.where.mockReturnThis();
  // Wire selectFrom to return the builder (can't do this in the factory due to hoisting)
  (db.selectFrom as jest.Mock).mockReturnValue(mockBuilder);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkPipeline()', () => {
  // -------------------------------------------------------------------------
  // 1. Success with data
  // -------------------------------------------------------------------------
  it('returns ok status with computed stats when db returns session data', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      total: '10',
      completed: '8',
      failed: '1',
      avg_latency_ms: 1500,
    });

    const result = await checkPipeline();

    expect(result).toEqual({
      status: 'ok',
      completionRate24h: 0.8,   // 8/10 = 0.80
      avgLatencyMs: 1500,
      failedLast24h: 1,
    });
  });

  // -------------------------------------------------------------------------
  // 2. Zero sessions — completionRate24h should be 1.0
  // -------------------------------------------------------------------------
  it('returns completionRate24h of 1.0 when there are zero sessions', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      total: '0',
      completed: '0',
      failed: '0',
      avg_latency_ms: null,
    });

    const result = await checkPipeline();

    expect(result.status).toBe('ok');
    expect(result.completionRate24h).toBe(1.0);
    expect(result.avgLatencyMs).toBeNull();
    expect(result.failedLast24h).toBe(0);
  });

  // -------------------------------------------------------------------------
  // 3. Sessions exist but none completed with timestamps — avgLatencyMs null
  // -------------------------------------------------------------------------
  it('returns avgLatencyMs of null when no completed sessions have timestamps', async () => {
    mockExecuteTakeFirstOrThrow.mockResolvedValueOnce({
      total: '5',
      completed: '0',
      failed: '2',
      avg_latency_ms: null,
    });

    const result = await checkPipeline();

    expect(result.status).toBe('ok');
    expect(result.avgLatencyMs).toBeNull();
    expect(result.failedLast24h).toBe(2);
    // completionRate24h = 0/5 = 0.0
    expect(result.completionRate24h).toBe(0.0);
  });

  // -------------------------------------------------------------------------
  // 4. DB throws — should return error shape
  // -------------------------------------------------------------------------
  it('returns error status with message when db throws', async () => {
    mockExecuteTakeFirstOrThrow.mockRejectedValueOnce(
      new Error('connection refused')
    );

    const result = await checkPipeline();

    expect(result.status).toBe('error');
    expect(result.error).toBe('connection refused');
    // No pipeline stats fields on error
    expect(result.completionRate24h).toBeUndefined();
    expect(result.avgLatencyMs).toBeUndefined();
    expect(result.failedLast24h).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // 4b. DB throws a non-Error value
  // -------------------------------------------------------------------------
  it('returns error status with stringified message when db throws a non-Error', async () => {
    mockExecuteTakeFirstOrThrow.mockRejectedValueOnce('db exploded');

    const result = await checkPipeline();

    expect(result.status).toBe('error');
    expect(result.error).toBe('db exploded');
  });
});
