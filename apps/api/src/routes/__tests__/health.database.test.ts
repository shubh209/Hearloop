// hearloop/apps/api/src/routes/__tests__/health.database.test.ts
//
// Unit tests for checkDatabase() in health.ts.
// Mocks lib/db so no real database connection is required.

import { checkDatabase } from '../health';

// Mock kysely's sql tag so sql`SELECT 1`.compile(db) returns a dummy object
// without needing real Kysely internals on the mock db.
jest.mock('kysely', () => {
  const actual = jest.requireActual('kysely');
  const sqlTag = () => ({ compile: () => ({ sql: 'SELECT 1', parameters: [] }) });
  return { ...actual, sql: sqlTag };
});

// Mock the entire lib/db module so db.executeQuery never touches a real DB.
jest.mock('../../lib/db', () => ({
  db: {
    executeQuery: jest.fn(),
  },
}));

// Also mock ioredis and bullmq to prevent connection attempts during module load.
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    ping: jest.fn(),
    disconnect: jest.fn(),
  }));
});

jest.mock('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => ({
    getJobCounts: jest.fn(),
    close: jest.fn(),
  })),
}));

// Import the mocked db after jest.mock is hoisted.
import { db } from '../../lib/db';

const mockDb = db as jest.Mocked<typeof db>;

describe('checkDatabase()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns status "ok" and a non-negative latencyMs on success', async () => {
    // Arrange: executeQuery resolves successfully.
    (mockDb.executeQuery as jest.Mock).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });

    // Act
    const result = await checkDatabase();

    // Assert
    expect(result.status).toBe('ok');
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.error).toBeUndefined();
  });

  it('returns status "error", the thrown message, and a non-negative latencyMs on failure', async () => {
    // Arrange: executeQuery throws a specific error.
    const errorMessage = 'connect ECONNREFUSED 127.0.0.1:5432';
    (mockDb.executeQuery as jest.Mock).mockRejectedValueOnce(new Error(errorMessage));

    // Act
    const result = await checkDatabase();

    // Assert
    expect(result.status).toBe('error');
    expect(result.error).toBe(errorMessage);
    expect(typeof result.latencyMs).toBe('number');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
