# Coverage #6 — Observability & ops

**Status:** draft — batch

## 30-second

- **Structured Pino JSON** logs from API + all job workers.
- **Health:** `/health` + detailed health (DB/Redis) — in k6 smoke.
- **Uptime:** Better Uptime monitors (API, detailed health, Vercel).
- **CI/CD:** push `main` → GitHub Actions → Docker amd64 → ECR → SSH EC2 → **~2 min** deploy + health curl.
- **Dashboard:** Partner stats — latency, tokens, models, completion; web auto-refresh 30s.
