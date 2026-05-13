# Hearloop Known Issues and Fix Priority

## P0 - Breaks real usage

### Hosted capture upload/finalize contract is broken

`Recorder.tsx` uses public token as session ID and calls routes that do not exist or require Bearer auth. Fix by adding scoped public token upload/finalize routes, or change hosted capture to be created and finalized by a partner backend.

### Partner auth schema drift

`routes/partners.ts` inserts `email` and `password_hash`; migration `001_initial.sql` does not create those columns. Add migration `002_partner_auth.sql`.

### Docker build context is wrong

GitHub Actions builds with context `./apps/api`, but Dockerfile assumes monorepo root. Use:

```bash
docker build --platform linux/amd64 -f apps/api/Dockerfile -t IMAGE .
```

or rewrite Dockerfile for app-only context.

### Bedrock Nova quota usage is not instrumented

Current code cannot prove which calls consume tokens. Fix `maxTokens`, add CountTokens, enable CloudWatch invocation metrics/logs, and lower analyze concurrency.

## P1 - Security and reliability

### Browser widget exposes secret API key

`widget.js` expects `apiKey` in browser config. That is not safe for real partners. Introduce public keys and scoped session tokens, or require partner backend session creation.

### Global permissive CORS

API sets `Access-Control-Allow-Origin: *`. For a real partner integration, enforce `partners.allowed_origins` for browser/public routes.

### Validation job is bypassed

`validate-recording.ts` exists but finalize enqueues transcribe directly. Route should enqueue validation, then validation should enqueue transcribe.

### No webhook SSRF protection

Partner webhook URL is fetched directly. Restrict protocol to HTTPS, block localhost/private IP ranges, and add URL validation.

### Dashboard uses localStorage auth

Acceptable for demo, not production. Use httpOnly secure cookies or a proper session token.

## P2 - Maintainability

### Existing `.cursor` docs are stale

They mention Claude direct API, old auth patterns, wrong widget path, and incomplete lifecycle. Replace with this pack.

### Huge inline CSS files

Landing page, docs, dashboard, login, and capture page are large TSX files with inline CSS. This was fast for demo, but it is hard to maintain. Extract design tokens and reusable components.

### Multiple package locks

Root, `apps`, and `apps/api` package-lock files disagree. Keep one root lockfile for workspace installs unless there is a deliberate reason.

### Generated artifacts committed/included

`.next`, `.vercel`, `.obsidian`, `node_modules`, and `.env.local` should not be shipped in context zips or committed.
