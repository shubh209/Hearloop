# Hearloop Session Bootstrap

Read only these first:

1. `PROJECT_CONTEXT.md`
2. `KNOWN_ISSUES.md`
3. The exact files relevant to the current task

Do not scan `.next`, `node_modules`, package lockfiles, generated build artifacts, or marketing drafts unless explicitly asked.

Project summary: Hearloop is a multi-tenant voice micro-feedback platform. A business embeds a widget or sends users to a hosted capture page. The user records a short voice clip. The API stores audio, transcribes it with Groq Whisper, classifies the transcript with AWS Bedrock Nova Lite, stores structured analysis, and sends a signed webhook.

Current priority order:

1. Fix contract mismatches that break the hosted capture flow.
2. Fix schema/migration drift for partner auth.
3. Fix Bedrock Nova token/quota usage and add telemetry.
4. Make Docker/GitHub Actions deployment actually build from monorepo root.
5. Add end-to-end tests for signup -> session -> upload -> analysis -> dashboard/webhook.
