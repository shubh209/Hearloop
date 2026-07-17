// hearloop/apps/api/src/routes/__tests__/sessions.test.ts
//
// Unit test for POST /sessions/:id/finalize storageKey ownership check
// (ticket 006). All DB access is mocked so no real database is required.

const mockExecuteTakeFirst = jest.fn();
jest.mock('../../lib/db', () => ({
  db: {
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    selectAll: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    executeTakeFirst: (...args: unknown[]) => mockExecuteTakeFirst(...args),
  },
}));

jest.mock('../../lib/storage', () => ({
  getUploadSignedUrl: jest.fn(),
  deleteAudio: jest.fn(),
  buildStorageKey: jest.requireActual('../../lib/storage').buildStorageKey,
}));

jest.mock('../../lib/queue', () => ({
  enqueueValidate: jest.fn(),
  enqueueExpireSession: jest.fn(),
}));

import { sessionRoutes } from '../sessions';

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
  return reply;
}

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
