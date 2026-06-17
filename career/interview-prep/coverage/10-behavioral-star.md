# Coverage #10 — Behavioral (STAR)

**Status:** draft — batch

## Story: Infrastructure cost cut (recommended)

- **S:** Portfolio on AWS; **~$35/mo** (RDS + ElastiCache + EC2).
- **T:** Cut cost without breaking BullMQ pipeline or API contract.
- **A:** Migrated to **Neon** + **Upstash**; removed RDS/ElastiCache; tuned BullMQ for free tier; re-ran smoke + load tests.
- **R:** **~$9.60/mo** (~72% reduction); E2E pipeline still verified (`METRICS.md`).

## Alt: BullMQ queue split

Shared queue race — jobs marked complete without running handlers. **Fix:** dedicated queue per job type (`DECISIONS.md`).
