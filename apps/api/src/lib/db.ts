import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import { buildSslConfig } from "./db-ssl";
import type { Database } from "./db-schema";

export type { Database } from "./db-schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: buildSslConfig(process.env.NODE_ENV),
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});
