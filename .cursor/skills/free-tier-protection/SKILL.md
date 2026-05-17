---
name: free-tier-protection
description: Protect free-tier service quotas (Upstash Redis, Neon, Groq, Upstash commands). Use before writing any code that touches a background worker, polling loop, queue configuration, scheduled job, retry logic, or any persistent connection to an external service. Also use when reviewing changes to queue.ts, any jobs/ file, or adding a new integration.
---

# Free Tier Protection

Hearloop runs entirely on free tiers. **Burning quota without shipping value is the primary infra risk.**
Every background process, polling loop, and queue worker must be configured defensively.

## The Rule

> Before writing code that creates a persistent connection, polling loop, retry, or background check — calculate how many requests/commands/calls it generates per day and verify the result fits within the monthly free-tier budget.

## Current Free Tier Limits

| Service | Limit | Current daily budget |
|---------|-------|----------------------|
| Upstash Redis | 500K commands/month | ≤ 15K/day safe ceiling |
| Neon PostgreSQL | 100 hours compute/month | wake on request only, no polling |
| Groq | Free tier STT | per-session only, not in background |
| Vercel | 100GB bandwidth/month | no concern for current traffic |

## BullMQ / Redis Workers — mandatory config

Every `createWorker()` call **must** include these options. Never use BullMQ defaults.

```typescript
// ✅ Required in every Worker
{
  stalledInterval: 600_000,  // 10 min — default 30s burns ~29K commands/day
  lockDuration:    120_000,  // 2 min lock
  concurrency: 2,            // default 1–5 is fine; never set high for demo traffic
}

// ✅ Required on every queue.add() call
{
  removeOnComplete: true,          // delete job from Redis immediately on success
  removeOnFail: { count: 50 },     // keep at most 50 failed jobs for debugging
}
```

### Why the default kills the free tier

BullMQ's default `stalledInterval: 30s` runs a Redis health check every 30 seconds per worker.
With 5 workers: `5 × 2 cmds × 2/min × 1440 min = 28,800 commands/day` → 500K cap hit in **17 days**.
At `stalledInterval: 600s`: `5 × 2 × 0.1/min × 1440 = 1,440 commands/day` → cap hit in **347 days**.

## Before adding any new background process

Answer these three questions. If you can't, do not ship the feature.

1. **Commands/day** — `(calls per minute) × 1440`. Does it fit in the daily budget above?
2. **Can it be triggered instead of polled?** — a webhook beats a cron; an event beats a timer.
3. **Does it need to run when there are no jobs?** — if not, add an idle guard.

## Do not do these things

```typescript
// ❌ New Worker without stalledInterval
new Worker("my-queue", handler, { connection });

// ❌ removeOnFail with a large count
removeOnFail: { count: 1000 }

// ❌ Polling a DB or external API on a tight interval
setInterval(() => db.query("SELECT ..."), 5000);

// ❌ High concurrency for a demo-traffic service
concurrency: 20
```

## When Upstash limit is hit

1. Check logs: `docker logs hearloop-api 2>&1 | grep "max requests"`
2. Stop container immediately to halt the error-retry loop: `docker stop hearloop-api`
3. Create a new Upstash database (new account if needed) and update `/home/ec2-user/.env` — no quotes around the URL value
4. Re-create the container (not `docker start` — that reuses old env): `docker rm hearloop-api && docker run -d --name hearloop-api --env-file /home/ec2-user/.env -p 3001:3001 --restart unless-stopped <image>`
5. Verify clean startup: `docker logs hearloop-api --since 30s`

## When adding a new external service integration

Update the limits table above in this file with the new service's free-tier cap and daily budget ceiling before writing any code.
