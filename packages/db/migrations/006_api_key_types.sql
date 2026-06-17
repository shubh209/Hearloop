-- api_keys.type: secret (sk-live_) vs public widget embed key (pk-live_)

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'secret';

ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_type_check;
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_type_check CHECK (type IN ('secret', 'public'));

UPDATE api_keys
SET type = 'secret'
WHERE type IS NULL OR type = 'secret';

CREATE INDEX IF NOT EXISTS idx_api_keys_partner_type
  ON api_keys (partner_id, type)
  WHERE revoked_at IS NULL;
