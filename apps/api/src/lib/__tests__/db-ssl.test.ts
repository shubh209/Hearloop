// hearloop/apps/api/src/lib/__tests__/db-ssl.test.ts
//
// buildSslConfig decides the pg Pool's ssl option. Ticket 006: production
// must verify Neon's cert (rejectUnauthorized: true), not skip verification.

import { buildSslConfig } from "../db-ssl";

describe("buildSslConfig", () => {
  it("requires certificate verification in production", () => {
    expect(buildSslConfig("production")).toEqual({ rejectUnauthorized: true });
  });
});
