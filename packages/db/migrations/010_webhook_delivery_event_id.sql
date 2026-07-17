-- hearloop/packages/db/migrations/010_webhook_delivery_event_id.sql

-- Stable event id for the JSON payload's `id` field, persisted alongside the
-- delivery row's own `id` so both stay stable across BullMQ retry attempts
-- of the same (partner_id, session_id, event_type) delivery.
alter table webhook_deliveries add column event_id uuid not null default gen_random_uuid();
