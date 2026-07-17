// hearloop/apps/api/src/routes/__tests__/public.test.ts
//
// Unit tests for GET /public/session/:token in public.ts.
// Focus: allowed_origins is stored comma-separated (see partner-me.ts /
// partners.ts write paths) but the handler under test used to assume a JSON
// array shape. All DB access is mocked so no real database is required.

const mockExecuteTakeFirst = jest.fn();
jest.mock('../../lib/db', () => ({
  db: {
    selectFrom: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    executeTakeFirst: (...args: unknown[]) => mockExecuteTakeFirst(...args),
  },
}));

jest.mock('../../lib/storage', () => ({
  getUploadSignedUrl: jest.fn(),
}));

jest.mock('../../lib/queue', () => ({
  enqueueValidate: jest.fn(),
}));

jest.mock('../../lib/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

import { publicRoutes } from '../public';

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
