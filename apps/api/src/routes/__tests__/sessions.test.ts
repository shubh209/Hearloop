// hearloop/apps/api/src/routes/__tests__/sessions.test.ts
//
// Unit test for POST /sessions/:id/finalize storageKey ownership check
// (ticket 006). All DB access is mocked so no real database is required.

const mockExecuteTakeFirst = jest.fn();
const mockGetUploadSignedUrl = jest.fn();
const mockIssueVersionedUploadGrant = jest.fn();
const mockPinVersionedFinalize = jest.fn();
jest.mock('../../lib/db', () => ({
  db: {
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    selectAll: jest.fn().mockReturnThis(),
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
  deleteAudio: jest.fn(),
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
  enqueueExpireSession: jest.fn(),
}));

import { sessionRoutes } from '../sessions';
import { UploadGrantError } from '../../lib/upload-grants';
import { FinalizePinError } from '../../lib/finalize-pinning';

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
});

describe('POST /sessions/:id/finalize — protocol dispatch', () => {
  const pinBody = {
    uploadId: '55555555-5555-4555-8555-555555555555',
    versionId: 's3-version-abc',
    etag: '"etag-1"',
  };

  beforeEach(() => {
    mockExecuteTakeFirst.mockReset();
    mockPinVersionedFinalize.mockReset();
  });

  it('pins a versioned Session from trusted Partner and Session identity', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      upload_protocol: 'versioned-v1',
      max_duration_sec: 5,
    });
    mockPinVersionedFinalize.mockResolvedValue({
      response: { sessionId: VALID_ID, status: 'submitted' },
      responseStatus: 200,
      replayed: false,
    });
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/finalize'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        headers: { 'idempotency-key': 'final-key-0001' },
        body: pinBody,
      },
      reply
    );

    expect(mockPinVersionedFinalize).toHaveBeenCalledWith({
      partnerId: 'partner-1',
      sessionId: VALID_ID,
      maxDurationSec: 5,
      idempotencyKey: 'final-key-0001',
      body: pinBody,
    });
    expect(reply.code).toHaveBeenCalledWith(200);
    expect(reply.send).toHaveBeenCalledWith({
      sessionId: VALID_ID,
      status: 'submitted',
    });
    expect(reply.header).not.toHaveBeenCalled();
  });

  it('sets Idempotent-Replayed on a versioned replay', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      upload_protocol: 'versioned-v1',
      max_duration_sec: 5,
    });
    mockPinVersionedFinalize.mockResolvedValue({
      response: { sessionId: VALID_ID, status: 'submitted' },
      responseStatus: 200,
      replayed: true,
    });
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/finalize'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        headers: { 'idempotency-key': 'final-key-0001' },
        body: pinBody,
      },
      reply
    );

    expect(reply.header).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it('maps FinalizePinError status and code', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      upload_protocol: 'versioned-v1',
      max_duration_sec: 5,
    });
    mockPinVersionedFinalize.mockRejectedValue(
      new FinalizePinError(422, 'integrity_mismatch')
    );
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/finalize'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
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
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'opened',
      upload_protocol: 'legacy-v0',
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
          storageKey: `recordings/${VALID_ID}/audio.webm`,
          mimeType: 'audio/webm',
          uploadId: pinBody.uploadId,
        },
      },
      reply
    );

    expect(mockPinVersionedFinalize).not.toHaveBeenCalled();
  });

  it('replays a submitted versioned Session through the pin module', async () => {
    mockExecuteTakeFirst.mockResolvedValue({
      id: VALID_ID,
      partner_id: 'partner-1',
      status: 'submitted',
      upload_protocol: 'versioned-v1',
      max_duration_sec: 5,
    });
    mockPinVersionedFinalize.mockResolvedValue({
      response: { sessionId: VALID_ID, status: 'submitted' },
      responseStatus: 200,
      replayed: true,
    });
    const { app, handlers } = makeApp();
    await sessionRoutes(app);
    const reply = makeReply();

    await handlers['POST /sessions/:id/finalize'](
      {
        params: { id: VALID_ID },
        partner: { id: 'partner-1' },
        headers: { 'idempotency-key': 'final-key-0001' },
        body: pinBody,
      },
      reply
    );

    expect(mockPinVersionedFinalize).toHaveBeenCalled();
    expect(reply.header).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });
});
