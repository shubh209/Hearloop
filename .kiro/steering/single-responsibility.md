---
inclusion: always
---

# Single Responsibility per File

Every file in this codebase does **one job**. If you can describe a file with "and", it needs to be split.

## The Rule

| File | Single job |
|------|-----------|
| `lib/logger.ts` | Create and export a Pino logger |
| `lib/db.ts` | Kysely client + table types |
| `jobs/transcribe.ts` | Run transcription pipeline step |
| `routes/partners.ts` | Partner HTTP route handlers |

## What to split

```typescript
// ❌ BAD — one file doing two unrelated things
// lib/utils.ts
export function hashKey(key: string) { ... }   // crypto concern
export function buildS3Key(id: string) { ... } // storage concern

// ✅ GOOD — each concern in its own file
// lib/crypto.ts   → hashing, HMAC, signing
// lib/storage.ts  → S3 key helpers, signed URLs
```

## Helpers belong near their job

```typescript
// ❌ BAD — markFailed() duplicated across three job files
// ✅ GOOD — extract to jobs/helpers/mark-failed.ts if reused across 2+ jobs
```

## When adding code to an existing file, ask

1. Does this new function belong to the same single concern as the rest of this file?
2. If no → create a new file with a name that describes its one job.
3. Filename = one noun + one verb domain (e.g. `validate-recording`, `deliver-webhook`).
