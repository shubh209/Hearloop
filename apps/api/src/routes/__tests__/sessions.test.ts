// hearloop/apps/api/src/routes/__tests__/sessions.test.ts
//
// Unit test for POST /sessions/:id/finalize storageKey ownership check
// (ticket 006). All DB access is mocked so no real database is required.

const mockExecuteTakeFirst = jest.fn();
const mockExecute = jest.fn();
const mockValues = jest.fn();
const mockSet = jest.fn();
const mockGetUploadSignedUrl = jest.fn();
const mockIssueVersionedUploadGrant = jest.fn();
const mockEnqueueValidate = jest.fn();
const mockEnqueueExpireSession = jest.fn();
jest.mock('../../lib/db', () => ({
  db: {
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    selectAll: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
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
    execute: (...args: unknown[]) => mockExecute(...args),
  },
}));

jest.mock('../../lib/storage', () => ({
  getUploadSignedUrl: (...args: unknown[]) => mockGetUploadSignedUrl(...args),
  deleteAudio: jest.fn(),
  buildStorageKey: jest.requireActual('../../lib/storage').buildStorageKey,
}));

jest.mock('../../lib/upload-grants', () => ({
  ...jest.requireActual('../../lib/upload-grants'),
  issueVersionedUploadGrant: (...args: unknown[]) =>
    mockIssueVersionedUploadGrant(...args),
}));

jest.mock('../../lib/queue', () => ({
  enqueueValidate: (...args: unknown[]) => mockEnqueueValidate(...args),
  enqueueExpireSession: (...args: unknown[]) => mockEnqueueExpireSession(...args),
}));

import { sessionRoutes } from '../sessions';
import { UploadGrantError } from '../../lib/upload-grants';

const VALID_ID = '11111111-1111-1111-1111-111111111111';

function makeApp() {
  const handlers: Record<string, Function> = {};
  const app: any = {
    authenticate: jest.fn(),
    get: (path: string, _opts: unknown, fn: Function) => { handlers[`GET ${path}`] = fn; },
    post: (path: string, _opts: unknown, fn: Function) => { handlers[`POST ${path}`] = fn; },
    delete: (path: string, _opts: unknown, fn: Function) => { handlers[`DELETE ${path}`] = fn; },
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
    'recordings/partner-1/11111111-1111-1111-1111-111111111111/22222222-2222-4222-8222-222222222222.webm',
  expiresAt: '2026-08-15T20:15:00.000Z',
  requiredHeaders: {
    'Content-Type': 'audio/webm',
    'x-amz-checksum-sha256':
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  },
};

describe('POST /sessions — authoritative capture metadata', () => {
  beforeEach(() => {
    mockExecute.mockReset().mockResolvedValue(undefined);
    mockValues.mockReset();
    mockEnqueueExpireSession.mockReset().mockResolvedValue(undefined);
  });

  it('retains caller metadata without allowing reserved capture fields to be overridden', async () => {
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions'](
      {
        partner: { id: 'partner-1' },
        body: {
          promptText: 'Authoritative prompt',
          consentRequired: true,
          consentText: 'I consent.',
          metadata: {
            campaign: 'summer-service',
            promptText: 'Caller override',
            consentRequired: false,
            target: { label: 'Caller target' },
          },
        },
      },
      reply
    );

    expect(JSON.parse(mockValues.mock.calls[0][0].metadata_json)).toEqual({
      campaign: 'summer-service',
      promptText: 'Authoritative prompt',
      consentRequired: true,
      consentText: 'I consent.',
      target: null,
    });
    expect(reply.code).toHaveBeenCalledWith(201);
  });
});

describe('POST /sessions/:id/upload-url — protocol dispatch', () => {
  beforeEach(() => {
    mockExecuteTakeFirst.mockReset();
    mockGetUploadSignedUrl.mockReset();
    mockIssueVersionedUploadGrant.mockReset();
  });

  it('issues a versioned grant from trusted Partner and Session identity', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      upload_protocol: 'versioned-v1',
    });
    mockIssueVersionedUploadGrant.mockResolvedValue({
      response: VERSIONED_RESPONSE,
      replayed: false,
    });
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/upload-url'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        headers: { 'idempotency-key': 'grant-key-0001' },
        body: { ...VERSIONED_BODY, partnerId: 'attacker-partner' },
      },
      reply
    );

    expect(mockIssueVersionedUploadGrant).toHaveBeenCalledWith({
      partnerId: 'partner-1',
      sessionId: VALID_ID,
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

  it('marks an equivalent grant response as replayed', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'recording',
      upload_protocol: 'versioned-v1',
    });
    mockIssueVersionedUploadGrant.mockResolvedValue({
      response: VERSIONED_RESPONSE,
      replayed: true,
    });
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/upload-url'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
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
  ] as const)('maps upload-grant error %i %s', async (statusCode, errorCode) => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      upload_protocol: 'versioned-v1',
    });
    mockIssueVersionedUploadGrant.mockRejectedValue(
      new UploadGrantError(statusCode, errorCode)
    );
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/upload-url'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        headers: { 'idempotency-key': 'grant-key-0001' },
        body: VERSIONED_BODY,
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(statusCode);
    expect(reply.send).toHaveBeenCalledWith({ error: errorCode });
  });

  it('preserves the legacy upload URL response', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      upload_protocol: 'legacy-v0',
    });
    mockGetUploadSignedUrl.mockResolvedValue({
      uploadUrl: 'https://storage.example.test/legacy',
      storageKey: `recordings/${VALID_ID}/audio.webm`,
    });
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/upload-url'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        headers: {},
        body: { mimeType: 'audio/webm' },
      },
      reply
    );

    expect(reply.code).not.toHaveBeenCalled();
    expect(reply.send).toHaveBeenCalledWith({
      uploadUrl: 'https://storage.example.test/legacy',
      storageKey: `recordings/${VALID_ID}/audio.webm`,
      expiresIn: 900,
    });
    expect(mockIssueVersionedUploadGrant).not.toHaveBeenCalled();
  });

  it.each([
    ['not-a-uuid', undefined, 400],
    [VALID_ID, undefined, 404],
    [VALID_ID, { id: VALID_ID, partner_id: 'partner-1', status: 'created', upload_protocol: 'versioned-v1' }, 409],
  ])('rejects invalid identity or state before issuance', async (id, session, status) => {
    mockExecuteTakeFirst.mockResolvedValue(session);
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/upload-url'](
      {
        params: { id },
        partner: { id: 'partner-1' },
        headers: { 'idempotency-key': 'grant-key-0001' },
        body: VERSIONED_BODY,
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(status);
    expect(mockIssueVersionedUploadGrant).not.toHaveBeenCalled();
  });
});

describe('POST /sessions/:id/finalize — storageKey ownership check', () => {
  beforeEach(() => {
    mockExecuteTakeFirst.mockReset();
    mockExecute.mockReset().mockResolvedValue(undefined);
    mockValues.mockReset();
    mockSet.mockReset();
    mockEnqueueValidate.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a storageKey that does not match this session's expected key", async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      max_duration_sec: 5,
    });

    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/finalize'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        body: {
          storageKey: 'recordings/someone-elses-session/audio.webm',
          mimeType: 'audio/webm',
        },
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(400);
  });

  it('rejects required consent before any persistence or Pipeline enqueue', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      max_duration_sec: 5,
      metadata_json: JSON.stringify({ consentRequired: true }),
    });
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/finalize'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        body: {
          storageKey: `recordings/${VALID_ID}/audio.webm`,
          mimeType: 'audio/webm',
          consentGiven: false,
        },
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({ error: 'consent_required' });
    expect(mockValues).not.toHaveBeenCalled();
    expect(mockSet).not.toHaveBeenCalled();
    expect(mockEnqueueValidate).not.toHaveBeenCalled();
  });

  it('fails closed before persistence when consent authority is malformed', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      max_duration_sec: 5,
      metadata_json: JSON.stringify({ consentRequired: 'yes' }),
    });
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/finalize'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        body: {
          storageKey: `recordings/${VALID_ID}/audio.webm`,
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
