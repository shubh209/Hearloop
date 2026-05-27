# Uptime Monitoring

Tool: **UptimeRobot** (free) or **Better Uptime** (free tier)

## Endpoints to monitor

| Endpoint | Check type | Expected response |
|----------|-----------|-------------------|
| `https://18-223-189-193.nip.io/health` | HTTP keyword | `"status":"ok"` |
| `https://18-223-189-193.nip.io/health/detailed` | HTTP keyword | `"status":"healthy"` |
| `https://hearloop.vercel.app` | HTTP status | 200 |

## Setup (UptimeRobot)

1. Go to https://uptimerobot.com and create a free account
2. Add monitor → HTTP(s)
3. URL: `https://18-223-189-193.nip.io/health`
4. Monitoring interval: 5 minutes
5. Alert contact: your email or Slack webhook
6. Repeat for `/health/detailed` and the Vercel URL

## What to track

- **Uptime %** — target 99.9% (~8h downtime/year) on current t3.micro
- **Response time** — alert if `/health` exceeds 5s (Neon cold start)
- **Downtime incidents** — log root cause in `incidents/` folder below

## Incident log

Create a file `incidents/YYYY-MM-DD.md` for each outage with:
- Start time / end time
- Root cause
- Fix applied
- How to prevent recurrence
