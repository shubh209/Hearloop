// hearloop/apps/api/src/routes/__tests__/partners.test.ts
//
// Unit test for POST /partners/register password-length validation
// (ticket 006: floor raised from 6 to 10 for a SaaS admin account).
// All DB access is mocked so no real database is required.

jest.mock('../../lib/db', () => ({
  db: {
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    executeTakeFirst: jest.fn(),
    insertInto: jest.fn().mockReturnThis(),
    values: jest.fn().mockReturnThis(),
    execute: jest.fn(),
  },
}));

jest.mock('../../lib/create-api-key', () => ({
  createApiKeyForPartner: jest.fn(),
}));

jest.mock('../../lib/partner-session', () => ({
  signPartnerSession: jest.fn(),
}));

import { partnerRoutes } from '../partners';

function makeApp() {
  const handlers: Record<string, Function> = {};
  const app: any = {
    post: (path: string, ...rest: unknown[]) => {
      const fn = rest[rest.length - 1] as Function;
      handlers[`POST ${path}`] = fn;
    },
    patch: (path: string, ...rest: unknown[]) => {
      const fn = rest[rest.length - 1] as Function;
      handlers[`PATCH ${path}`] = fn;
    },
    get: (path: string, ...rest: unknown[]) => {
      const fn = rest[rest.length - 1] as Function;
      handlers[`GET ${path}`] = fn;
    },
  };
  return { app, handlers };
}

function makeReply() {
  const reply: any = {};
  reply.code = jest.fn().mockReturnValue(reply);
  reply.send = jest.fn().mockReturnValue(reply);
  return reply;
}

describe('POST /partners/register — password length', () => {
  it('rejects a password shorter than 10 characters', async () => {
    const { app, handlers } = makeApp();
    await partnerRoutes(app);
    const reply = makeReply();

    await handlers['POST /partners/register'](
      {
        body: {
          name: 'Acme',
          email: 'a@example.com',
          password: 'short123',
        },
      },
      reply
    );

    expect(reply.code).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('10'),
      })
    );
  });
});
