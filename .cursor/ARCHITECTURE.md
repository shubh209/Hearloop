# Hearloop Architecture

## Intended high-level flow

1. Partner creates a session through `POST /v1/sessions` using a secret API key.
2. API creates a session row with a public token and expiry.
3. User opens hosted capture URL or JS widget.
4. Browser records audio with `MediaRecorder`.
5. Browser gets signed upload URL.
6. Browser uploads audio directly to S3/R2.
7. Browser finalizes the session.
8. API queues processing.
9. Worker validates audio, transcribes with Groq, classifies with Bedrock, stores analysis, marks session completed.
10. Webhook worker sends `session.completed` with HMAC signature and retry tracking.

## Actual widget flow

`apps/web/public/widget.js` currently works against authenticated backend routes:

1. Uses partner API key in browser config.
2. Calls `POST /v1/sessions`.
3. Opens public token route.
4. Calls `POST /v1/sessions/:sessionId/upload-url` with Bearer key.
5. Uploads to signed URL.
6. Calls `POST /v1/sessions/:sessionId/finalize` with Bearer key.

Problem: this exposes the partner secret API key in browser code. For a demo it is acceptable; for real users it is not. Real architecture needs either a public key plus scoped session token flow or a partner backend creating sessions server-side.

## Actual hosted capture flow

`apps/web/app/capture/[token]/page.tsx` resolves public config and passes `sessionToken` to `Recorder`.

`apps/web/components/Recorder.tsx` then does the wrong thing:

- Calls `POST /v1/public/session/:token/open` - exists.
- Calls `POST /v1/sessions/:token/upload-url` - wrong because this route requires Bearer auth and uses session ID, not public token.
- Calls `POST /v1/public/session/:token/finalize` - route does not exist.

Hosted capture is therefore not actually wired end-to-end unless there are untracked backend routes in production.

## Database model

Tables in `001_initial.sql`:

- `partners`
- `api_keys`
- `sessions`
- `recordings`
- `analyses`
- `webhook_deliveries`

Schema drift problem: `routes/partners.ts` and `lib/db.ts` expect `partners.email` and `partners.password_hash`, but `001_initial.sql` does not create those columns. Add a migration before trusting register/login.

## Deployment

Current files imply:

- Web deployed on Vercel.
- API deployed on EC2 via Docker/ECR.
- GitHub Action builds/pushes Docker and SSHes into EC2.

Deployment problem: `.github/workflows/docker-image.yml` runs `docker build ... ./apps/api`, but `apps/api/Dockerfile` assumes monorepo root paths such as `apps/api/package*.json` and `packages/db/package*.json`. Build context should be repo root with `-f apps/api/Dockerfile`, or the Dockerfile should be rewritten for `apps/api` context.
