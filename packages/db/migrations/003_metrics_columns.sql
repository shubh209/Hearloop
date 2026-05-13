-- Add AI model telemetry columns to analyses table.
ALTER TABLE analyses
  ADD COLUMN model_used TEXT,
  ADD COLUMN input_tokens INT,
  ADD COLUMN output_tokens INT;

-- Add processing timing columns to sessions table for latency tracking.
ALTER TABLE sessions
  ADD COLUMN processing_started_at TIMESTAMPTZ,
  ADD COLUMN processing_completed_at TIMESTAMPTZ;
