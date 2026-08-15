import type { Generated } from "kysely";

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
  upload_protocol: Generated<"legacy-v0" | "versioned-v1">;
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
  storage_bucket: string | null;
  object_version_id: string | null;
  etag: string | null;
  checksum_sha256: string | null;
  upload_grant_id: string | null;
  pinned_at: Date | null;
  created_at: Generated<Date>;
}

export interface UploadGrantsTable {
  id: Generated<string>;
  partner_id: string;
  session_id: string;
  upload_attempt_id: string;
  idempotency_key: string;
  request_hash: string;
  response_json: string;
  storage_bucket: string;
  storage_key: string;
  expected_mime_type: string;
  expected_size_bytes: number;
  expected_checksum_sha256: string;
  expires_at: Date;
  state: Generated<"available" | "cleanup_claimed" | "pinned" | "cleaned">;
  cleanup_lease_token: string | null;
  cleanup_lease_until: Date | null;
  cleanup_attempts: Generated<number>;
  pinned_at: Date | null;
  cleaned_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FinalizeReceiptsTable {
  id: Generated<string>;
  partner_id: string;
  session_id: string;
  upload_grant_id: string;
  idempotency_key: string;
  request_hash: string;
  status: "verifying" | "completed";
  response_status: number | null;
  response_json: string | null;
  verification_lease_token: string | null;
  verification_lease_until: Date | null;
  expires_at: Generated<Date>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
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
  type: Generated<"secret" | "public">;
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
  password_hash: string | null;
  status: "active" | "suspended";
  webhook_url: string | null;
  allowed_origins: string | null;
  default_config_json: string | null;
  business_context: string | null;
  website_url: string | null;
  business_context_source:
    | "manual"
    | "template"
    | "import"
    | "import_edited"
    | null;
  created_at: Date;
}

export interface WebhookDeliveriesTable {
  id: Generated<string>;
  partner_id: string;
  session_id: string;
  event_type: string;
  event_id: Generated<string>;
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

export interface CaptureLinksTable {
  id: string;
  partner_id: string;
  token: string;
  target_label: string | null;
  target_key: string | null;
  active: Generated<boolean>;
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
  capture_links: CaptureLinksTable;
  upload_grants: UploadGrantsTable;
  finalize_receipts: FinalizeReceiptsTable;
}
