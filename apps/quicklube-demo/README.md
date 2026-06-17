# QuickLube Demo — Partner demo site

Fictional automotive quick-service site with **@hearloop/react** embedded. Used to test the full flow: End user records → S3 → pipeline → QuickLube dashboard on Hearloop.

## Local dev

1. Sign up / log in on [Hearloop](https://hearloop.vercel.app).
2. **Settings → Widget embed** — add `http://localhost:3002`, reveal embed key.
3. Copy `.env.example` → `.env.local` and set `NEXT_PUBLIC_HEARLOOP_EMBED_KEY`.
4. From repo root:

```bash
npm run build --workspace=@hearloop/react
npm run dev --workspace=quicklube-demo
```

Open http://localhost:3002 — use the floating feedback widget.

## Vercel (separate project)

1. New Vercel project, **root directory** `apps/quicklube-demo` (or import monorepo and set root).
2. Env vars: `NEXT_PUBLIC_HEARLOOP_EMBED_KEY`, `NEXT_PUBLIC_HEARLOOP_API_BASE_URL`.
3. In Hearloop embed settings, allow `https://<your-quicklube>.vercel.app`.

## Hearloop dashboard

Partner login: https://hearloop.vercel.app/login (same QuickLube account).
