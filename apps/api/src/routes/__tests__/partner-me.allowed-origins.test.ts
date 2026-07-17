// hearloop/apps/api/src/routes/__tests__/partner-me.allowed-origins.test.ts
//
// Round-trip test: PATCH /partners/me/settings writes allowedOrigins as a
// comma-separated string (see partner-me.ts), and GET /public/session/:token
// (public.ts, via lib/lookup-api-key.ts's parseAllowedOrigins) must be able
// to read that exact stored format back out correctly. All DB access is
// mocked so no real database is required.

const mockSet = jest.fn();
const mockUpdateTable = jest.fn();
jest.mock('../../lib/db', () => ({
  db: {
    updateTable: (...args: unknown[]) => {
      mockUpdateTable(...args);
      return {
        set: (values: unknown) => {
          mockSet(values);
          return {
            where: () => ({ execute: jest.fn().mockResolvedValue(undefined) }),
          };
        },
      };
    },
    selectFrom: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    executeTakeFirst: jest.fn(),
  },
}));

import { partnerMeRoutes } from '../partner-me';
import { parseAllowedOrigins } from '../../lib/lookup-api-key';

function makeApp() {
  const handlers: Record<string, Function> = {};
  const app: any = {
    authenticatePartner: jest.fn(),
    get: (path: string, _opts: unknown, fn: Function) => { handlers[`GET ${path}`] = fn; },
    patch: (path: string, _opts: unknown, fn: Function) => { handlers[`PATCH ${path}`] = fn; },
    post: (path: string, _opts: unknown, fn: Function) => { handlers[`POST ${path}`] = fn; },
  };
  return { app, handlers };
}

function makeReply() {
  const reply: any = {};
  reply.code = jest.fn().mockReturnValue(reply);
  reply.send = jest.fn().mockReturnValue(reply);
  return reply;
}

describe('PATCH /partners/me/settings → GET /public/session/:token round trip for allowedOrigins', () => {
  beforeEach(() => {
    mockSet.mockReset();
    mockUpdateTable.mockReset();
  });

  it('stores allowedOrigins comma-separated, and parseAllowedOrigins reads it back as the original array', async () => {
    const { app, handlers } = makeApp();
    await partnerMeRoutes(app);
    const reply = makeReply();

    const inputOrigins = ['https://a.example.com', 'https://b.example.com'];

    await handlers['PATCH /partners/me/settings'](
      {
        partner: { id: 'partner-1' },
        body: { allowedOrigins: inputOrigins.join(',') },
      },
      reply
    );

    expect(reply.code).not.toHaveBeenCalledWith(400);
    expect(mockSet).toHaveBeenCalledTimes(1);
    const storedValue = (mockSet.mock.calls[0][0] as Record<string, unknown>)[
      'allowed_origins'
    ] as string;

    // This is the exact string public.ts's GET /public/session/:token
    // handler will read back out of the DB for this partner's sessions.
    expect(parseAllowedOrigins(storedValue)).toEqual(inputOrigins);
  });
});
