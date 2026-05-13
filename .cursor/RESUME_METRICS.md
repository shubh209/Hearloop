# Hearloop Resume Metrics

## What is true from the codebase

This project demonstrates:

- Multi-tenant API with hashed API keys.
- Browser audio capture with MediaRecorder.
- Signed direct-to-object-storage upload flow.
- Async processing with BullMQ workers.
- Speech-to-text integration with Groq Whisper.
- Bedrock Nova Lite classification with fallback path.
- HMAC-signed webhook delivery with retries and persisted delivery state.
- Next.js frontend with landing, docs, login/signup, dashboard, hosted capture page.
- Docker/ECR/EC2 deployment intent.

## Metrics to collect before claiming production impact

Do not claim real-user impact without numbers. Add these counters:

- `sessions_created_total`
- `recordings_uploaded_total`
- `sessions_completed_total`
- `capture_completion_rate = completed / opened`
- `median_audio_to_analysis_ms`
- `p95_audio_to_analysis_ms`
- `webhook_delivery_success_rate`
- `webhook_p95_delivery_latency_ms`
- `stt_error_rate`
- `analysis_parse_error_rate`
- `nova_input_tokens_per_session`
- `nova_output_tokens_per_session`
- `ai_cost_per_completed_session`
- `dashboard_active_partners`

## Resume bullets - strong but honest

Use these only after the broken contract, schema drift, deployment build, and Bedrock telemetry are fixed and tested end-to-end.

1. Built a multi-tenant voice feedback platform using TypeScript, Fastify, PostgreSQL, BullMQ, and S3-compatible signed uploads, turning 5-second browser recordings into structured feedback sessions with an async processing pipeline and partner-scoped API authentication.

2. Integrated Groq Whisper STT and AWS Bedrock Nova Lite classification to convert raw customer audio into JSON insights including transcript, sentiment score, topic taxonomy, urgency, quality flags, and moderation flags, with bounded prompts, token telemetry, and model fallback handling.

3. Implemented HMAC-signed webhook delivery with persisted attempt history, exponential backoff retries, and dead-letter status, enabling partners to receive completed session results asynchronously instead of polling.

## Quantified versions after instrumentation

Replace bracketed values with measured values:

1. Built a multi-tenant voice feedback API that processed `[N]` completed sessions with `[X]%` capture completion and `[Y]ms` median audio-to-insight latency using Fastify, PostgreSQL, BullMQ, S3 signed uploads, Groq Whisper, and AWS Bedrock.

2. Reduced AI classification cost to `$[C]` per completed feedback session by capping transcript context, lowering Nova output limits, skipping low-value model calls, and tracking Bedrock input/output tokens per invocation.

3. Delivered partner results through HMAC-signed webhooks with `[X]%` successful delivery within `[Y]` seconds and automatic retries/dead-lettering for failed endpoints.
