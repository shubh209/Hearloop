# Phase 1 — Platform (widget keys + dashboard session)

## What shipped

- **Dashboard auth:** Email/password → `hlps.*` session token (httpOnly cookie). No secret key required for login.
- **Widget embed keys:** `pk-live_…` (`api_keys.type = public`). Secret keys `sk-live_…` optional via Settings → API access.
- **Embed gate:** `create-token` with embed key requires `allowed_origins` configured (Settings → Widget embed).
- **Routes:** `GET/PATCH /v1/partners/me`, `/partners/me/dashboard`, `/partners/me/embed/regenerate`, `/partners/me/secret-keys`
- **Web:** Onboarding (business context), Embed + API settings panels, signup without secret modal.
- **SDK:** `embedKey` prop on `@hearloop/react`.

## Before deploy

1. Run migration on Neon:

```bash
psql "$DATABASE_URL" -f packages/db/migrations/006_api_key_types.sql
```

2. Set on API (EC2 `.env`):

```
PARTNER_SESSION_SECRET=<random 32+ bytes>
```

3. Existing partners: log in → **Widget embed** → add site URL → **Reveal / regenerate embed key**.

4. Legacy dashboard cookies with `apiKey` only: log out and log in again.

## QuickLube demo site

- App: `apps/quicklube-demo` — see [`apps/quicklube-demo/README.md`](../apps/quicklube-demo/README.md)
- Local: port **3002**, env `NEXT_PUBLIC_HEARLOOP_EMBED_KEY`
- Vercel: separate project, root `apps/quicklube-demo`

## Next

- Deploy Phase 1 API + migration `006`
- Vercel env for QuickLube + allow origin in Hearloop embed settings
- Fix `NEXT_PUBLIC_API_URL` for hosted capture (Hearloop web)
