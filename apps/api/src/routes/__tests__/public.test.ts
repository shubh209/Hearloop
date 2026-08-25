// hearloop/apps/api/src/routes/__tests__/public.test.ts
//
// Unit tests for GET /public/session/:token in public.ts.
// Focus: allowed_origins is stored comma-separated (see partner-me.ts /
// partners.ts write paths) but the handler under test used to assume a JSON
// array shape. All DB access is mocked so no real database is required.

const mockExecuteTakeFirst = jest.fn();
const mockExecuteInsert = jest.fn();
const mockValues = jest.fn();
const mockSet = jest.fn();
const mockWhere = jest.fn();
const mockGetUploadSignedUrl = jest.fn();
const mockIssueVersionedUploadGrant = jest.fn();
const mockLookupPartnerByApiKey = jest.fn();
const mockClaimSessionCreateToken = jest.fn();
const mockEnqueueValidate = jest.fn();
const mockTransactionExecute = jest.fn();
jest.mock('../../lib/db', () => {
  const database = {
    selectFrom: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: function (...args: unknown[]) {
      mockWhere(...args);
      return this;
    },
    executeTakeFirst: (...args: unknown[]) => mockExecuteTakeFirst(...args),
    insertInto: jest.fn().mockReturnThis(),
    values: function (...args: unknown[]) {
      mockValues(...args);
      return this;
    },
    onConflict: jest.fn().mockReturnThis(),
    updateTable: jest.fn().mockReturnThis(),
    set: function (...args: unknown[]) {
      mockSet(...args);
      return this;
    },
    returning: jest.fn().mockReturnThis(),
    execute: (...args: unknown[]) => mockExecuteInsert(...args),
    transaction: jest.fn().mockReturnValue({
      execute: (callback: Function) => mockTransactionExecute(callback, database),
    }),
  };
  return { db: database };
});

jest.mock('../../lib/lookup-api-key', () => ({
  ...jest.requireActual('../../lib/lookup-api-key'),
  lookupPartnerByApiKey: (...args: unknown[]) =>
    mockLookupPartnerByApiKey(...args),
}));

jest.mock('../../lib/session-create-token', () => ({
  claimSessionCreateToken: (...args: unknown[]) =>
    mockClaimSessionCreateToken(...args),
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

jest.mock('../../lib/queue', () => ({
  enqueueValidate: (...args: unknown[]) => mockEnqueueValidate(...args),
}));

jest.mock('../../lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { publicRoutes } from '../public';
import { UploadGrantError } from '../../lib/upload-grants';

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

describe('POST /public/sessions/create-token — Widget embed key origin boundary', () => {
  beforeEach(() => {
    mockExecuteInsert.mockReset().mockResolvedValue(undefined);
    mockLookupPartnerByApiKey.mockReset().mockResolvedValue({
      keyId: 'key-1',
      partnerId: 'partner-1',
      name: 'Partner One',
      webhookUrl: null,
      allowedOrigins: 'https://allowed.example.com',
      businessContext: null,
      keyType: 'public',
    });
  });

  it('issues a token when the request Origin is allowlisted', async () => {
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/sessions/create-token'](
      {
        headers: { origin: 'https://allowed.example.com' },
        body: { embedKey: 'pk-live_browser-safe-key' },
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.header).toHaveBeenCalledWith(
      'Access-Control-Allow-Origin',
      'https://allowed.example.com'
    );
  });

  it.each([
    ['missing', {}],
    ['disallowed', { origin: 'https://attacker.example.com' }],
  ])('rejects a %s Origin', async (_caseName, headers) => {
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/sessions/create-token'](
      {
        headers,
        body: { embedKey: 'pk-live_browser-safe-key' },
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'origin_not_allowed' });
    expect(mockExecuteInsert).not.toHaveBeenCalled();
  });
});

describe('POST /public/sessions — Session-create token claim boundary', () => {
  beforeEach(() => {
    mockExecuteTakeFirst.mockReset().mockResolvedValue(undefined);
    mockExecuteInsert.mockReset().mockResolvedValue(undefined);
    mockValues.mockReset();
    mockClaimSessionCreateToken
      .mockReset()
      .mockResolvedValueOnce({ partnerId: 'partner-1' })
      .mockResolvedValueOnce(null);
  });

  it('creates one Session when two requests receive one winning claim', async () => {
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const winnerReply = makeReply();
    const loserReply = makeReply();

    await Promise.all([
      handlers['POST /public/sessions'](
        {
          headers: { authorization: 'Bearer single-use-token' },
          body: {},
        },
        winnerReply
      ),
      handlers['POST /public/sessions'](
        {
          headers: { authorization: 'Bearer single-use-token' },
          body: {},
        },
        loserReply
      ),
    ]);

    expect(mockClaimSessionCreateToken).toHaveBeenNthCalledWith(
      1,
      'single-use-token',
      expect.any(Date)
    );
    expect(mockClaimSessionCreateToken).toHaveBeenNthCalledWith(
      2,
      'single-use-token',
      expect.any(Date)
    );
    expect(winnerReply.code).toHaveBeenCalledWith(201);
    expect(loserReply.code).toHaveBeenCalledWith(401);
    expect(mockExecuteInsert).toHaveBeenCalledTimes(1);
  });

  it('persists prompt and consent authority even when no custom prompt exists', async () => {
    mockClaimSessionCreateToken.mockReset().mockResolvedValue({ partnerId: 'partner-1' });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/sessions'](
      {
        headers: { authorization: 'Bearer single-use-token' },
        body: { consentRequired: true, consentText: 'Audio processing consent.' },
      },
      reply
    );

    const insertedSession = mockValues.mock.calls[0][0];
    expect(JSON.parse(insertedSession.metadata_json)).toEqual({
      consentRequired: true,
      consentText: 'Audio processing consent.',
      target: null,
    });
    expect(reply.code).toHaveBeenCalledWith(201);
  });
});

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

  it('returns the persisted Session capture config instead of current Partner defaults', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      ...baseSessionRow,
      metadata_json: JSON.stringify({
        promptText: 'Persisted prompt',
        consentRequired: true,
        consentText: 'Persisted consent',
      }),
      default_config_json: JSON.stringify({
        promptText: 'Changed Partner prompt',
        consentRequired: false,
      }),
      allowed_origins: null,
    });

    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['GET /public/session/:token'](
      { params: { token: 'tok-config' } },
      reply
    );

    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({
      promptText: 'Persisted prompt',
      consentRequired: true,
      consentText: 'Persisted consent',
    }));
  });
});

describe('POST /public/capture/:linkToken/session — persisted capture authority', () => {
  beforeEach(() => {
    mockExecuteInsert.mockReset().mockResolvedValue(undefined);
    mockValues.mockReset();
    mockWhere.mockReset();
  });

  it('persists Partner consent defaults and Capture-link Target together', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      partner_id: 'partner-1',
      target_label: 'North Ave — Oil Change',
      target_key: 'north-ave-oil-change',
      active: true,
      default_config_json: JSON.stringify({
        promptText: 'How was the service?',
        consentRequired: true,
        consentText: 'I consent.',
      }),
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/capture/:linkToken/session'](
      { params: { linkToken: 'capture-link-token' } },
      reply
    );

    expect(JSON.parse(mockValues.mock.calls[0][0].metadata_json)).toEqual({
      promptText: 'How was the service?',
      consentRequired: true,
      consentText: 'I consent.',
      target: {
        label: 'North Ave — Oil Change',
        key: 'north-ave-oil-change',
        source: 'capture-link',
      },
    });
  });

  it('rejects a Target key without a Target label before Session persistence', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      partner_id: 'partner-1',
      target_label: null,
      target_key: 'orphaned-target-key',
      active: true,
      default_config_json: null,
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/capture/:linkToken/session'](
      { params: { linkToken: 'capture-link-token' } },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ error: 'invalid_session_config' });
    expect(mockValues).not.toHaveBeenCalled();
  });

  it('mints fresh Sessions with stable trusted Partner and Target attribution', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      partner_id: 'partner-a',
      target_label: 'North Ave — Oil Change',
      target_key: 'north-ave-oil-change',
      active: true,
      default_config_json: null,
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const firstReply = makeReply();
    const secondReply = makeReply();

    await handlers['POST /public/capture/:linkToken/session'](
      { params: { linkToken: 'stable-capture-link-token' } },
      firstReply
    );
    await handlers['POST /public/capture/:linkToken/session'](
      { params: { linkToken: 'stable-capture-link-token' } },
      secondReply
    );

    const first = firstReply.send.mock.calls[0][0];
    const second = secondReply.send.mock.calls[0][0];
    expect(firstReply.code).toHaveBeenCalledWith(201);
    expect(secondReply.code).toHaveBeenCalledWith(201);
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.sessionToken).not.toBe(second.sessionToken);
    expect(mockValues.mock.calls.map(([session]) => session.partner_id)).toEqual([
      'partner-a',
      'partner-a',
    ]);
    expect(
      mockValues.mock.calls.map(([session]) => JSON.parse(session.metadata_json).target)
    ).toEqual([
      {
        label: 'North Ave — Oil Change',
        key: 'north-ave-oil-change',
        source: 'capture-link',
      },
      {
        label: 'North Ave — Oil Change',
        key: 'north-ave-oil-change',
        source: 'capture-link',
      },
    ]);
  });

  it.each([
    ['malformed', undefined],
    ['deactivated', {
      partner_id: 'partner-a',
      target_label: null,
      target_key: null,
      active: false,
      default_config_json: null,
    }],
  ])('returns the same 404 for a %s Capture-link token', async (_caseName, row) => {
    mockExecuteTakeFirst.mockResolvedValue(row);
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const reply = makeReply();

    await handlers['POST /public/capture/:linkToken/session'](
      { params: { linkToken: 'unusable-capture-link-token' } },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(404);
    expect(reply.send).toHaveBeenCalledWith({ error: 'capture_link_not_found' });
    expect(mockWhere).toHaveBeenCalledWith(
      'capture_links.token',
      '=',
      'unusable-capture-link-token'
    );
    expect(mockValues).not.toHaveBeenCalled();
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
    mockExecuteInsert.mockReset().mockResolvedValue(undefined);
    mockValues.mockReset();
    mockSet.mockReset();
    mockWhere.mockReset();
    mockTransactionExecute
      .mockReset()
      .mockImplementation((callback, database) => callback(database));
    mockEnqueueValidate.mockReset().mockResolvedValue(undefined);
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

  it.each([undefined, false])(
    'rejects missing or false consent before any persistence when consent is required (%s)',
    async (consentGiven) => {
      mockExecuteTakeFirst.mockResolvedValue({
        id: 'session-1',
        partner_id: 'partner-1',
        status: 'opened',
        expires_at: new Date(Date.now() + 60_000),
        max_duration_sec: 5,
        metadata_json: JSON.stringify({ consentRequired: true }),
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
            consentGiven,
          },
        },
        reply
      );

      expect(reply.code).toHaveBeenCalledWith(400);
      expect(reply.send).toHaveBeenCalledWith({ error: 'consent_required' });
      expect(mockValues).not.toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
      expect(mockEnqueueValidate).not.toHaveBeenCalled();
    }
  );

  it.each([
    ['required consent given', JSON.stringify({ consentRequired: true }), true],
    ['consent not required', JSON.stringify({ consentRequired: false }), undefined],
  ])('finalizes when %s', async (_caseName, metadataJson, consentGiven) => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      max_duration_sec: 5,
      metadata_json: metadataJson,
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
          consentGiven,
        },
      },
      reply
    );

    expect(mockValues).toHaveBeenCalledTimes(1);
    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ status: 'submitted' }));
    expect(mockEnqueueValidate).toHaveBeenCalledTimes(1);
  });

  it.each(['submitted', 'processing']) (
    'returns durable %s status on replay without another Recording write or Pipeline start',
    async (status) => {
      mockExecuteTakeFirst.mockResolvedValue({
        id: 'session-1',
        partner_id: 'partner-1',
        status,
        expires_at: new Date(Date.now() + 60_000),
        max_duration_sec: 5,
        metadata_json: JSON.stringify({ consentRequired: true }),
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
            consentGiven: true,
          },
        },
        reply
      );

      expect(reply.send).toHaveBeenCalledWith({ sessionId: 'session-1', status });
      expect(mockValues).not.toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
      expect(mockEnqueueValidate).not.toHaveBeenCalled();
    }
  );

  it('allows only one concurrent request to start validation for an opened Session', async () => {
    const sharedSession = {
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      max_duration_sec: 5,
      metadata_json: JSON.stringify({ consentRequired: true }),
    };
    let executeCount = 0;
    mockExecuteTakeFirst.mockImplementation(async () => {
      executeCount += 1;
      if (executeCount <= 2) {
        return { ...sharedSession };
      }
      if (executeCount > 4) {
        return { ...sharedSession };
      }
      const acceptedStateConstraint = mockWhere.mock.calls.at(-1);
      if (
        acceptedStateConstraint?.[0] !== 'status' ||
        acceptedStateConstraint?.[1] !== 'in' ||
        JSON.stringify(acceptedStateConstraint?.[2]) !==
          JSON.stringify(['opened', 'recording', 'uploaded'])
      ) {
        sharedSession.status = 'submitted';
        return { id: sharedSession.id };
      }
      if (sharedSession.status === 'opened') {
        sharedSession.status = 'submitted';
        return { id: sharedSession.id };
      }
      return undefined;
    });
    const effectiveQueueJobs: Array<{
      jobId: string;
      storageKey: string;
      mimeType: string;
    }> = [];
    const effectiveRecordings = new Map<string, unknown>();
    mockExecuteInsert.mockImplementation(async () => {
      const recording = mockValues.mock.calls.at(-1)?.[0];
      effectiveRecordings.set(recording.session_id, recording);
    });
    mockEnqueueValidate.mockImplementation(async ({ sessionId, storageKey, mimeType }) => {
      effectiveQueueJobs.push({
        jobId: `validate-${sessionId}`,
        storageKey,
        mimeType,
      });
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const replies = [makeReply(), makeReply()];
    const requests = [
      {
        params: { token: 'tok-1' },
        body: {
          storageKey: 'recordings/session-1/audio.webm',
          mimeType: 'audio/webm',
          consentGiven: true,
        },
      },
      {
        params: { token: 'tok-1' },
        body: {
          storageKey: 'recordings/session-1/audio.ogg',
          mimeType: 'audio/ogg',
          consentGiven: true,
        },
      },
    ];

    await Promise.all(
      replies.map((reply, index) =>
        handlers['POST /public/session/:token/finalize'](requests[index], reply)
      )
    );

    expect(effectiveQueueJobs).toHaveLength(1);
    expect(effectiveQueueJobs[0].jobId).toBe('validate-session-1');
    expect(sharedSession.status).toBe('submitted');
    expect(mockValues).toHaveBeenCalledTimes(1);
    expect(effectiveRecordings.size).toBe(1);
    expect(effectiveRecordings.get('session-1')).toEqual(
      expect.objectContaining({
        session_id: 'session-1',
        storage_key: effectiveQueueJobs[0].storageKey,
        mime_type: effectiveQueueJobs[0].mimeType,
      })
    );
    for (const reply of replies) {
      expect(reply.send).toHaveBeenCalledWith({
        sessionId: 'session-1',
        status: 'submitted',
      });
    }
  });

  it('returns processing when the winning finalize advances before the loser responds', async () => {
    const sharedSession = {
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      max_duration_sec: 5,
      metadata_json: JSON.stringify({ consentRequired: true }),
    };
    let executeCount = 0;
    let releaseDurableRead: () => void = () => undefined;
    const winnerProcessing = new Promise<void>((resolve) => {
      releaseDurableRead = resolve;
    });
    mockExecuteTakeFirst.mockImplementation(async () => {
      executeCount += 1;
      if (executeCount <= 2) {
        return { ...sharedSession };
      }
      if (executeCount === 5) {
        await winnerProcessing;
        return { ...sharedSession };
      }
      if (executeCount > 5) {
        return { ...sharedSession };
      }
      if (sharedSession.status === 'opened') {
        sharedSession.status = 'submitted';
        return { id: sharedSession.id };
      }
      return undefined;
    });
    mockEnqueueValidate.mockImplementation(async () => {
      sharedSession.status = 'processing';
      releaseDurableRead();
    });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const replies = [makeReply(), makeReply()];
    const request = {
      params: { token: 'tok-1' },
      body: {
        storageKey: 'recordings/session-1/audio.webm',
        mimeType: 'audio/webm',
        consentGiven: true,
      },
    };

    await Promise.all(
      replies.map((reply) =>
        handlers['POST /public/session/:token/finalize'](request, reply)
      )
    );

    expect(replies.map((reply) => reply.send.mock.calls.at(-1)?.[0].status)).toEqual([
      'submitted',
      'processing',
    ]);
  });

  it('recovers a pending validation handoff after enqueue rejects', async () => {
    const openedSession = {
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      max_duration_sec: 5,
      metadata_json: JSON.stringify({ consentRequired: true }),
    };
    let executeCount = 0;
    mockExecuteTakeFirst.mockImplementation(async () => {
      executeCount += 1;
      if (executeCount === 1) return openedSession;
      if (executeCount === 2) return { id: 'session-1' };
      const submittedSet = mockSet.mock.calls.find(
        ([value]) => value.status === 'submitted'
      )?.[0];
      if (executeCount === 3) {
        return {
          ...openedSession,
          status: 'submitted',
          metadata_json: submittedSet.metadata_json,
        };
      }
      if (executeCount === 4) {
        return {
          storage_key: 'recordings/session-1/audio.webm',
          mime_type: 'audio/webm',
        };
      }
      const latestMetadata = mockSet.mock.calls
        .map(([value]) => value.metadata_json)
        .filter(Boolean)
        .at(-1);
      return {
        ...openedSession,
        status: 'submitted',
        metadata_json: latestMetadata,
      };
    });
    const effectiveQueueJobs: string[] = [];
    mockEnqueueValidate
      .mockRejectedValueOnce(new Error('queue unavailable'))
      .mockImplementationOnce(async ({ sessionId }) => {
        effectiveQueueJobs.push(`validate-${sessionId}`);
      });
    const { app, handlers } = makeApp();
    await publicRoutes(app);
    const request = {
      params: { token: 'tok-1' },
      body: {
        storageKey: 'recordings/session-1/audio.webm',
        mimeType: 'audio/webm',
        consentGiven: true,
      },
    };

    await expect(
      handlers['POST /public/session/:token/finalize'](request, makeReply())
    ).rejects.toThrow('queue unavailable');
    await handlers['POST /public/session/:token/finalize'](request, makeReply());
    await handlers['POST /public/session/:token/finalize'](request, makeReply());

    expect(effectiveQueueJobs).toEqual(['validate-session-1']);
    expect(mockEnqueueValidate).toHaveBeenCalledTimes(2);
    expect(mockValues).toHaveBeenCalledTimes(1);
  });

  it('enqueues the persisted prompt instead of caller-controlled finalize metadata', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      max_duration_sec: 5,
      metadata_json: JSON.stringify({
        promptText: 'Persisted capture prompt',
        consentRequired: false,
      }),
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
          promptText: 'Caller-controlled prompt',
        },
      },
      reply
    );

    expect(mockEnqueueValidate).toHaveBeenCalledWith(expect.objectContaining({
      promptText: 'Persisted capture prompt',
    }));
  });

  it('fails closed before persistence when consent authority is malformed', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: 'session-1',
      partner_id: 'partner-1',
      status: 'opened',
      expires_at: new Date(Date.now() + 60_000),
      max_duration_sec: 5,
      metadata_json: '{',
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
          consentGiven: true,
        },
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(500);
    expect(reply.send).toHaveBeenCalledWith({ error: 'invalid_session_config' });
    expect(mockValues).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockEnqueueValidate).not.toHaveBeenCalled();
  });
});
