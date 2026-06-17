-- Migration 009: business context import metadata on partners

ALTER TABLE partners
  ADD COLUMN IF NOT EXISTS website_url TEXT,
  ADD COLUMN IF NOT EXISTS business_context_source VARCHAR(20)
    CHECK (
      business_context_source IS NULL
      OR business_context_source IN ('manual', 'template', 'import', 'import_edited')
    );
