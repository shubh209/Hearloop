-- 007_capture_links.sql
-- Durable, reusable capture links for the in-person surface (QR code / SMS).
-- Unlike session_create_tokens (single-use, 10-min TTL for the widget), a capture
-- link is a stable entry point printed on signage. Opening it mints a fresh session
-- and attributes it to an optional Target (location / service) via the session's
-- metadata_json (Phase 1 — see context/FEEDBACK_TARGET_DESIGN.md).

CREATE TABLE IF NOT EXISTS capture_links (
  id UUID PRIMARY KEY,
  partner_id UUID NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  token VARCHAR(32) NOT NULL UNIQUE,        -- opaque, stable; lives in the public /c/<token> URL
  target_label TEXT,                        -- human label, e.g. "North Ave — Oil Change"
  target_key TEXT,                          -- normalized identity for dashboard grouping
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_capture_links_token ON capture_links(token);
CREATE INDEX idx_capture_links_partner ON capture_links(partner_id);
