// hearloop/apps/api/src/routes/__tests__/public.test.ts
//
// Unit tests for GET /public/session/:token in public.ts.
// Focus: allowed_origins is stored comma-separated (see partner-me.ts /
// partners.ts write paths) but the handler under test used to assume a JSON
// array shape. All DB access is mocked so no real database is required.

const mockExecuteTakeFirst = jest.fn();
const mockGetUploadSignedUrl = jest.fn();
const mockIssueVersionedUploadGrant = jest.fn();
const mockPinVersionedFinalize = jest.fn();
jest.mock('../../lib/db', () => ({
  db: {
    selectFrom: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    insertInto: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    onConflict: jest.fn().mockReturnThis(),
    updateTable: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue([]),
    executeTakeFirst: (...args: unknown[]) => mockExecuteTakeFirst(...args),
  },
}));

jest.mock('../../lib/storage', () => ({
  getUploadSignedUrl: (...args: unknown[]) => mockGetUploadSignedUrl(...args),
  buildStorageKey: jest.requireActual('../../lib/storage').buildStorageKey,
}));

jest.mock('../../lib/upload-grants', () => ({
  ...jest.requireActual('../../lib/upload-grants'),
  issueVersionedUploadGrant: (...args: unknown[]) =>
    mockIssueVersionedUploadGrant(...args),
}));

jest.mock('../../lib/finalize-pinning', () => ({
  ...jest.requireActual('../../lib/finalize-pinning'),
  pinVersionedFinalize: (...args: unknown[]) =>
    mockPinVersionedFinalize(...args),
}));

jest.mock('../../lib/queue', () => ({
  enqueueValidate: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { publicRoutes } from '../public';
import { UploadGrantError } from '../../lib/upload-grants';
import { FinalizePinError } from '../../lib/finalize-pinning';

// Build a minimal Fastify-like mock that captures registered route handlers.
function makeApp() {
  const handlers: Record<string, Function> = {};
  const app: any = {
    get: (path: string, fn: Function) => { handlers[`GET ${path}`] = fn; },
    post: (path: string, fn: Function) => { handlers[`POST ${path}`] = fn; },
  };
  return { app, handlers };
}

function makeReply() {
  const reply: any = {};
  reply.code = jest.fn().mockReturnValue(reply);
  reply.send = jest.fn().mockReturnValue(reply);
  reply.header = jest.fn().mockReturnValue(reply);
  return reply;
}

describe('GET /public/session/:token — allowed_origins parsing', () => {
  beforeEach(() => {
    mockExecuteTakeFirst.mockReset();
  });

  const baseSessionRow = {
    id: 'session-1',
    status: 'created',
    max_duration_sec: 5,
    metadata_json: null,
    expires_at: new Date(Date.now() + 60_000),
    default_config_json: null,
  };

  it('returns the comma-separated origins as a parsed array (no JSON.parse error)', async () => {
    // Arrange: allowed_origins is stored as a comma-separated string — the
    // format every write site (partner-me.ts, partners.ts) actually persists.
    mockExecuteTakeFirst.mockResolvedValue({
      ...baseSessionRow,
      allowed_origins: 'https://a.example.com,https://b.example.com',
    });

    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['GET /public/session/:token'](
      { params: { token: 'tok-1' } },
      reply
    );

    expect(reply.code).not.toHaveBeenCalledWith(500);
    const body = reply.send.mock.calls[0][0];
    expect(body.allowedOrigins).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });

  it('returns an empty array when allowed_origins is null', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      ...baseSessionRow,
      allowed_origins: null,
    });

    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['GET /public/session/:token'](
      { params: { token: 'tok-2' } },
      reply
    );

    const body = reply.send.mock.calls[0][0];
    expect(body.allowedOrigins).toEqual([]);
  });

  it('trims whitespace and drops empty entries, matching parseAllowedOrigins elsewhere', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      ...baseSessionRow,
      allowed_origins: ' https://a.example.com , https://b.example.com ,',
    });

    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['GET /public/session/:token'](
      { params: { token: 'tok-3' } },
      reply
    );

    const body = reply.send.mock.calls[0][0];
    expect(body.allowedOrigins).toEqual([
      'https://a.example.com',
      'https://b.example.com',
    ]);
  });
});

const VERSIONED_BODY = {
  uploadAttemptId: '22222222-2222-4222-8222-222222222222',
  mimeType: 'audio/webm',
  sizeBytes: 4096,
  checksumSha256: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
};

const VERSIONED_RESPONSE = {
  uploadId: '55555555-5555-4555-8555-555555555555',
  uploadUrl: 'https://storage.example.test/signed-put',
  storageKey:
    'recordings/partner-1/session-1/22222222-2222-4222-8222-222222222222.webm',
  expiresAt: '2026-08-15T20:15:00.000Z',
  requiredHeaders: {
    'Content-Type': 'audio/webm',
    'x-amz-checksum-sha256':
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  },
};

describe('POST /public/session/:token/upload-url — protocol dispatch', () => {
  beforeEach(() => {
    mockExecuteTakeFirst.mockReset();
    mockGetUploadSignedUrl.mockReset();
    mockIssueVersionedUploadGrant.mockReset();
  });

  it('issues a versioned grant using identity resolved from the Session', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      upload_protocol: 'versioned-v1',
    });
    mockIssueVersionedUploadGrant.mockResolvedValue({
      response: VERSIONED_RESPONSE,
      replayed: false,
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/upload-url'](
      {
        params: { token: 'opaque-session-token' },
        headers: { 'idempotency-key': 'grant-key-0001' },
        body: { ...VERSIONED_BODY, partnerId: 'attacker-partner' },
      },
      reply
    );

    expect(mockIssueVersionedUploadGrant).toHaveBeenCalledWith({
      partnerId: 'partner-1',
      sessionId: 'session-1',
      idempotencyKey: 'grant-key-0001',
      body: { ...VERSIONED_BODY, partnerId: 'attacker-partner' },
    });
    expect(reply.code).toHaveBeenCalledWith(201);
    expect(reply.send).toHaveBeenCalledWith(VERSIONED_RESPONSE);
    expect(reply.header).not.toHaveBeenCalledWith(
      'Idempotent-Replayed',
      'true'
    );
  });

  it('marks an equivalent public grant response as replayed', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'recording',
      expires_at: new Date(Date.now() + 60_000),
      upload_protocol: 'versioned-v1',
    });
    mockIssueVersionedUploadGrant.mockResolvedValue({
      response: VERSIONED_RESPONSE,
      replayed: true,
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/upload-url'](
      {
        params: { token: 'opaque-session-token' },
        headers: { 'idempotency-key': 'grant-key-0001' },
        body: VERSIONED_BODY,
      },
      reply
    );

    expect(reply.header).toHaveBeenCalledWith(
      'Idempotent-Replayed',
      'true'
    );
    expect(reply.code).toHaveBeenCalledWith(201);
  });

  it.each([
    [400, 'invalid_upload_grant_request'],
    [409, 'upload_attempt_conflict'],
    [422, 'idempotency_key_reused'],
    [503, 'storage_unavailable'],
  ] as const)('maps public upload-grant error %i %s', async (statusCode, errorCode) => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      upload_protocol: 'versioned-v1',
    });
    mockIssueVersionedUploadGrant.mockRejectedValue(
      new UploadGrantError(statusCode, errorCode)
    );
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/upload-url'](
      {
        params: { token: 'opaque-session-token' },
        headers: { 'idempotency-key': 'grant-key-0001' },
        body: VERSIONED_BODY,
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(statusCode);
    expect(reply.send).toHaveBeenCalledWith({ error: errorCode });
  });

  it('preserves the public legacy upload URL response', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      upload_protocol: 'legacy-v0',
    });
    mockGetUploadSignedUrl.mockResolvedValue({
      uploadUrl: 'https://storage.example.test/legacy',
      storageKey: 'recordings/session-1/audio.webm',
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/upload-url'](
      {
        params: { token: 'opaque-session-token' },
        headers: {},
        body: { mimeType: 'audio/webm' },
      },
      reply
    );

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({
      uploadUrl: 'https://storage.example.test/legacy',
      storageKey: 'recordings/session-1/audio.webm',
      expiresIn: 900,
    });
    expect(mockIssueVersionedUploadGrant).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 404],
    [{ id: 'session-1', partner_id: 'partner-1', status: 'opened', expires_at: new Date(0), upload_protocol: 'versioned-v1' }, 410],
    [{ id: 'session-1', partner_id: 'partner-1', status: 'created', expires_at: new Date(Date.now() + 60_000), upload_protocol: 'versioned-v1' }, 409],
  ])('rejects an unavailable public Session before issuance', async (session, status) => {
    mockExecuteTakeFirst.mockResolvedValue(session);
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/upload-url'](
      {
        params: { token: 'opaque-session-token' },
        headers: { 'idempotency-key': 'grant-key-0001' },
        body: VERSIONED_BODY,
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(status);
    expect(mockIssueVersionedUploadGrant).not.toHaveBeenCalled();
  });
});

describe('POST /public/session/:token/finalize — storageKey ownership check', () => {
  beforeEach(() => {
    mockExecuteTakeFirst.mockReset();
  });

  it('rejects a storageKey that does not match this session\'s expected key', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      max_duration_sec: 5,
    });

    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/finalize'](
      {
        params: { token: 'tok-1' },
        body: {
          storageKey: 'recordings/someone-elses-session/audio.webm',
          mimeType: 'audio/webm',
        },
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(400);
  });
});

describe('POST /public/session/:token/finalize — protocol dispatch', () => {
  const pinBody = {
    uploadId: '55555555-5555-4555-8555-555555555555',
    versionId: 's3-version-abc',
    etag: '"etag-1"',
  };
  const openedVersioned = {
    id: 'session-1',
    partner_id: 'partner-1',
    status: 'opened',
    expires_at: new Date(Date.now() + 60_000),
    max_duration_sec: 5,
    upload_protocol: 'versioned-v1',
  };

  beforeEach(() => {
    mockExecuteTakeFirst.mockReset();
    mockPinVersionedFinalize.mockReset();
  });

  it('pins a versioned Session from the token-resolved Partner and Session', async () => {
    mockExecuteTakeFirst.mockResolvedValue(openedVersioned);
    mockPinVersionedFinalize.mockResolvedValue({
      response: { sessionId: 'session-1', status: 'submitted' },
      responseStatus: 200,
      replayed: false,
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/finalize'](
      {
        params: { token: 'tok-1' },
        headers: { 'idempotency-key': 'final-key-0001' },
        body: pinBody,
      },
      reply
    );

    expect(mockPinVersionedFinalize).toHaveBeenCalledWith({
      partnerId: 'partner-1',
      sessionId: 'session-1',
      maxDurationSec: 5,
      idempotencyKey: 'final-key-0001',
      body: pinBody,
    });
    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      sessionId: 'session-1',
      status: 'submitted',
    });
  });

  it('sets Idempotent-Replayed on a versioned replay', async () => {
    mockExecuteTakeFirst.mockResolvedValue(openedVersioned);
    mockPinVersionedFinalize.mockResolvedValue({
      response: { sessionId: 'session-1', status: 'submitted' },
      responseStatus: 200,
      replayed: true,
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/finalize'](
      {
        params: { token: 'tok-1' },
        headers: { 'idempotency-key': 'final-key-0001' },
        body: pinBody,
      },
      reply
    );

    expect(reply.header).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it('maps FinalizePinError status and code', async () => {
    mockExecuteTakeFirst.mockResolvedValue(openedVersioned);
    mockPinVersionedFinalize.mockRejectedValue(
      new FinalizePinError(422, 'integrity_mismatch')
    );
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/finalize'](
      {
        params: { token: 'tok-1' },
        headers: { 'idempotency-key': 'final-key-0001' },
        body: pinBody,
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(422);
    expect(reply.send).toHaveBeenCalledWith({ error: 'integrity_mismatch' });
  });

  it('does not pin when extra JSON appears on a legacy-v0 Session', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      ...openedVersioned,
      upload_protocol: 'legacy-v0',
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/finalize'](
      {
        params: { token: 'tok-1' },
        body: {
          storageKey: 'recordings/session-1/audio.webm',
          mimeType: 'audio/webm',
          uploadId: pinBody.uploadId,
        },
      },
      reply
    );

    expect(mockPinVersionedFinalize).not.toHaveBeenCalled();
  });

  it('does not pin an expired Session', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      ...openedVersioned,
      expires_at: new Date(0),
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/finalize'](
      {
        params: { token: 'tok-1' },
        headers: { 'idempotency-key': 'final-key-0001' },
        body: pinBody,
      },
      reply
    );

    expect(mockPinVersionedFinalize).not.toHaveBeenCalled();
    expect(reply.code).toHaveBeenCalledWith(410);
  });

  it('replays a submitted versioned Session through the pin module', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      ...openedVersioned,
      status: 'submitted',
    });
    mockPinVersionedFinalize.mockResolvedValue({
      response: { sessionId: 'session-1', status: 'submitted' },
      responseStatus: 200,
      replayed: true,
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/session/:token/finalize'](
      {
        params: { token: 'tok-1' },
        headers: { 'idempotency-key': 'final-key-0001' },
        body: pinBody,
      },
      reply
    );

    expect(mockPinVersionedFinalize).toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });
});
