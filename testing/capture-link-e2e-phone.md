# Live QR capture E2E — phone runbook

Automated API proof: `node testing/capture-link-e2e.js`  
This doc is the **manual phone step** that script cannot do (mic + real audio).

## Prerequisites

- Vercel `NEXT_PUBLIC_API_URL` = `https://hearloop.vercel.app/api` (**no** `/v1`)
- Dashboard API calls use `/api/partners/me/...` (proxy adds `/v1` once)
- Production API healthy: `curl https://18-223-189-193.nip.io/health`

## Steps (≈3 min)

1. **Sign in** at https://hearloop.vercel.app/login (or use the throwaway partner from the automated script output).

2. **Capture links tab** → Target label e.g. `Bay 2 — Oil Change` → **New link**.

3. **Copy URL** or **Download QR** → open on your phone (camera app or QR scanner).

4. **Expected:** browser lands on hosted capture (`/capture/<session-token>`), not "Link unavailable."

5. **Allow microphone** → tap record → speak 3–5 seconds → submit.

6. **Dashboard** (desktop): wait ~30s (auto-refresh) or reload → **Overview → By target** should show your label with Sessions ≥ 1.

7. **Sessions tab:** newest row should show the Target label and a transcript after `completed`.

## Failure cheatsheet

| Symptom | Likely cause |
|---|---|
| "Link unavailable" on scan | Inactive link, bad token, or `NEXT_PUBLIC_API_URL` wrong on Vercel |
| Capture page 404 | `NEXT_PUBLIC_API_URL` includes `/v1` (double prefix on server fetch) |
| Dashboard empty / Capture links won't load | Frontend called `/api/v1/...` (double `/v1` on proxy) — fixed in Session 9 |
| Session stuck `processing` | Redis/queue down — check `/health/detailed` |
| By target shows "Unattributed" | Link had no Target label, or session wasn't minted via `/c/<link>` |

## Cleanup

```bash
CLEANUP=1 node testing/capture-link-e2e.js
```

Or deactivate the link in the dashboard. Test partners use `@hearloop-test.invalid` emails.
