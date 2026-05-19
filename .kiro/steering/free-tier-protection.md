---
inclusion: fileMatch
fileMatchPattern: ['apps/api/src/lib/queue.ts', 'apps/api/src/jobs/*.ts', 'apps/api/src/index.ts']
---

# Free Tier Protection

Hearloop runs on free tiers. Burning quota without shipping value is the primary infra risk.

## Mandatory BullMQ worker config

```typescript
// Every createWorker() must have these — never use defaults
{
  stalledInterval: 600_000,   // 10 min (default 30s → 29K Redis cmds/day → cap in 17 days)
  lockDuration:    120_000,
  concurrency: 2,             // raise only for webhook worker if needed
}

// Every queue.add() must have these
{
  removeOnComplete: true,
  removeOnFail: { count: 50 },
}
```

## Before any new background process

Calculate: `(calls per minute) × 1440 = commands/day`. Must fit under **15K/day** (Upstash 500K/month ÷ 30 − headroom).

Prefer event-driven over polling. Never poll Neon or external APIs on a tight loop.

## Free tier limits

| Service | Monthly limit | Safe daily ceiling |
|---------|-------------|---------------------|
| Upstash Redis | 500K commands | 15K/day |
| Neon PostgreSQL | 100 compute-hours | request-only, no polling |
| Groq STT | Free tier | per session only |

See `.cursor/skills/free-tier-protection/SKILL.md` for incident runbook.
