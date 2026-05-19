-- Add business_context column to partners table.
-- Partners can set a plain-text description of their business, industry,
-- and services. This is injected into the AI analysis prompt to produce
-- more relevant sentiment/topic classification per partner.

ALTER TABLE partners
  ADD COLUMN business_context TEXT;
