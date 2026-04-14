// hearloop/apps/api/src/lib/db.ts

import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";

export interface SessionsTable {
  id: string;
  partner_id: string;
  public_token: string;
  status:
    | "created"
    | "opened"
    | "recording"
    | "uploaded"
    | "submitted"
    | "processing"
    | "completed"
    | "failed"
    | "expired";
  failure_reason: string | null;
  external_event_id: string | null;
  max_duration_sec: number;
  metadata_json: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

export interface RecordingsTable {
  id: string;
  session_id: string;
  storage_key: string;
  mime_type: string;
  duration_ms: number | null;
  size_bytes: number;
  sha256_hash: string;
  created_at: Date;
}

export interface AnalysesTable {
  id: string;
  session_id: string;
  transcript: string | null;
  detected_language: string | null;
  confidence: "high" | "low" | null;
  sentiment_label: "positive" | "neutral" | "negative" | null;
  sentiment_score: number | null;
  topics_json: string | null;
  moderation_json: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PartnersTable {
  id: string;
  name: string;
  status: "active" | "suspended";
  webhook_url: string | null;
  allowed_origins: string | null;
  default_config_json: string | null;
  created_at: Date;
}

export interface WebhookDeliveriesTable {
  id: string;
  partner_id: string;
  session_id: string;
  event_type: string;
  payload_json: string;
  status: "pending" | "delivered" | "failed" | "dead";
  attempt_count: number;
  response_code: number | null;
  last_attempted_at: Date | null;
  created_at: Date;
}

export interface Database {
  sessions: SessionsTable;
  recordings: RecordingsTable;
  analyses: AnalysesTable;
  partners: PartnersTable;
  webhook_deliveries: WebhookDeliveriesTable;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
});