-- Add email and password_hash columns to partners table.
-- Partners registered before this migration will have NULL values;
-- they will need to re-register or have credentials set manually.

ALTER TABLE partners
  ADD COLUMN email TEXT UNIQUE,
  ADD COLUMN password_hash TEXT;

CREATE INDEX idx_partners_email ON partners(email);
