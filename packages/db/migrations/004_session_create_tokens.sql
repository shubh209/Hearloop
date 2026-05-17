CREATE TABLE IF NOT EXISTS session_create_tokens (
  id BIGSERIAL PRIMARY KEY,
  partner_id BIGINT NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  token VARCHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_session_create_tokens_token ON session_create_tokens(token);
CREATE INDEX idx_session_create_tokens_partner_expires ON session_create_tokens(partner_id, expires_at);
