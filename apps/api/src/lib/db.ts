// hearloop/apps/api/src/lib/db.ts

import { Generated, Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

export interface SessionsTable {
  id: Generated<string>;
  partner_id: string;
  public_token: string;
  status: Generated<
    | "created"
    | "opened"
    | "recording"
    | "uploaded"
    | "submitted"
    | "processing"
    | "completed"
    | "failed"
    | "expired"
  >;
  failure_reason: string | null;
  external_event_id: string | null;
  max_duration_sec: number;
  metadata_json: string | null;
  expires_at: Date;
  processing_started_at: Date | null;
  processing_completed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RecordingsTable {
  id: Generated<string>;
  session_id: string;
  storage_key: string;
  mime_type: string;
  duration_ms: number | null;
  size_bytes: number;
  sha256_hash: string;
  created_at: Generated<Date>;
}

export interface AnalysesTable {
  id: Generated<string>;
  session_id: string;
  transcript: string | null;
  detected_language: string | null;
  confidence: "high" | "low" | null;
  sentiment_label: "positive" | "neutral" | "negative" | null;
  sentiment_score: number | null;
  topics_json: string | null;
  moderation_json: string | null;
  model_used: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ApiKeysTable {
  id: Generated<string>;
  partner_id: string;
  key_prefix: string;
  key_hash: string;
  revoked_at: Date | null;
  last_used_at: Date | null;
  created_at: Generated<Date>;
}


export interface PartnersTable {
  id: string;
  name: string;
  email: string | null;
  password_hash: string | null;  // ADD THIS
  status: "active" | "suspended";
  webhook_url: string | null;
  allowed_origins: string | null;
  default_config_json: string | null;
  created_at: Date;
}

export interface WebhookDeliveriesTable {
  id: Generated<string>;
  partner_id: string;
  session_id: string;
  event_type: string;
  payload_json: string;
  status: Generated<"pending" | "delivered" | "failed" | "dead">;
  attempt_count: Generated<number>;
  response_code: number | null;
  last_attempted_at: Date | null;
  created_at: Generated<Date>;
}

export interface SessionCreateTokensTable {
  id: Generated<number>;
  partner_id: string;
  token: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface Database {
  sessions: SessionsTable;
  recordings: RecordingsTable;
  analyses: AnalysesTable;
  api_keys: ApiKeysTable;
  partners: PartnersTable;
  webhook_deliveries: WebhookDeliveriesTable;
  session_create_tokens: SessionCreateTokensTable;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});