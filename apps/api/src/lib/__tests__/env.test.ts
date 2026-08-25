// hearloop/apps/api/src/lib/__tests__/env.test.ts
//
// Unit tests for validateEnv() in lib/env.ts.
// Validates Requirements 3.1, 3.2, 3.3, 3.4.

import { validateEnv } from '../env';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All required env vars needed for a fully valid environment. */
const VALID_ENV: Record<string, string> = {
  DATABASE_URL:              'postgres://localhost/hearloop',
  REDIS_URL:                 'redis://localhost:6379',
  BEDROCK_REGION:            'us-east-2',
  GROQ_API_KEY:              'gsk_test_key',
  WEBHOOK_SIGNING_SECRET:    'super-secret',
  PARTNER_SESSION_SECRET:    'test-partner-session-secret-at-least-32-characters',
  STORAGE_REGION:            'us-east-2',
  STORAGE_BUCKET:            'hearloop-audio-prod',
  STORAGE_ACCESS_KEY_ID:     'AKIAIOSFODNN7EXAMPLE',
  STORAGE_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  CLOUDWATCH_REGION:         'us-east-2',
  CLOUDWATCH_NAMESPACE:      'Hearloop/Pipeline',
  // Satisfy the ALIASED bedrock credential check via STORAGE_* aliases
  BEDROCK_ACCESS_KEY_ID:     'AKIAIOSFODNN7EXAMPLE',
  BEDROCK_SECRET_ACCESS_KEY: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let savedEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  // Snapshot the real env so we can restore it after each test
  savedEnv = { ...process.env };
  // Clear all env vars and apply the valid baseline
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, VALID_ENV);
});

afterEach(() => {
  // Restore original env
  for (const key of Object.keys(process.env)) {
    delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
  jest.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Requirement 3.1 — CLOUDWATCH_REGION is required
// ---------------------------------------------------------------------------

describe('validateEnv() — CLOUDWATCH_REGION (Requirement 3.1)', () => {
  it('calls process.exit(1) when CLOUDWATCH_REGION is absent', () => {
    delete process.env.CLOUDWATCH_REGION;

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('process.exit called'); }) as never);

    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when CLOUDWATCH_REGION is an empty string', () => {
    process.env.CLOUDWATCH_REGION = '';

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('process.exit called'); }) as never);

    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.2 — CLOUDWATCH_NAMESPACE is required
// ---------------------------------------------------------------------------

describe('validateEnv() — CLOUDWATCH_NAMESPACE (Requirement 3.2)', () => {
  it('calls process.exit(1) when CLOUDWATCH_NAMESPACE is absent', () => {
    delete process.env.CLOUDWATCH_NAMESPACE;

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('process.exit called'); }) as never);

    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('calls process.exit(1) when CLOUDWATCH_NAMESPACE is an empty string', () => {
    process.env.CLOUDWATCH_NAMESPACE = '';

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('process.exit called'); }) as never);

    expect(() => validateEnv()).toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.3 — happy path: both vars present and non-empty
// ---------------------------------------------------------------------------

describe('validateEnv() — happy path (Requirement 3.3)', () => {
  it('completes without error when CLOUDWATCH_REGION and CLOUDWATCH_NAMESPACE are both present', () => {
    // VALID_ENV already includes both; just confirm no exit is called
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('process.exit called'); }) as never);

    expect(() => validateEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Requirement 3.4 — CLOUDWATCH_ACCESS_KEY_ID must NOT be in REQUIRED
// ---------------------------------------------------------------------------

describe('validateEnv() — no separate CloudWatch credential entry (Requirement 3.4)', () => {
  it('does not call process.exit(1) when CLOUDWATCH_ACCESS_KEY_ID is absent', () => {
    // Ensure the key is definitely not set
    delete process.env.CLOUDWATCH_ACCESS_KEY_ID;

    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation((() => { throw new Error('process.exit called'); }) as never);

    // Should pass cleanly — no separate CloudWatch credential is required
    expect(() => validateEnv()).not.toThrow();
    expect(exitSpy).not.toHaveBeenCalled();
  });
});
