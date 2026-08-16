# Hearloop — Infrastructure Reference

> Contains live IPs and deployment commands. Do not commit secrets here.

Last updated: August 15, 2026

---

## Live Endpoints

| Resource | URL |
|---|---|
| Web (Vercel) | https://hearloop.vercel.app |
| API (EC2) | https://18-223-189-193.nip.io |
| API Health | https://18-223-189-193.nip.io/health |
| API via Vercel proxy | https://hearloop.vercel.app/api/* |

---

## AWS Resources (us-east-2)

| Resource | Type | Details | Cost |
|---|---|---|---|
| EC2 | t3.micro | Elastic IP: 18.223.189.193 — API container on port 3001 | ~$8/mo |
| EBS | 20 GB gp3 | EC2 root volume | ~$1.60/mo |
| S3 | `hearloop-audio-prod` | Private, versioning enabled (live `get-bucket-versioning` 2026-08-15: `Status=Enabled`), CORS enabled for presigned PUT uploads | ~$0.002/mo plus retained-version storage |
| ECR | `hearloop-api` | Docker image repository, lifecycle policy active | $0 free tier |

**Deleted (May 16, 2026):** RDS t3.micro, ElastiCache Valkey t3.micro, CloudWatch RDSOSMetrics log group

### S3 media evidence capability

- Bucket versioning is enabled (AWS `s3api get-bucket-versioning`,
  2026-08-15, us-east-2, `Status: Enabled`); older pre-versioning objects
  remain legacy null-version objects.
- CORS retains the widget-compatible origin policy and exposes `ETag`,
  `x-amz-version-id`, and `x-amz-checksum-sha256`.
- Application access (`hearloop-s3-user` / `ProgrammaticAccess` v3) includes
  version inspection, exact-version reads, and exact-version deletion under
  `recordings/*`, `phase1-capability-probe/*`, and `phase1-finalize-probe/*`.
- No automatic noncurrent-version lifecycle deletion is configured.
- The August 14 capability probe verified distinct VersionIds, exact-version
  HEAD/GET integrity, browser-visible headers, scoped listing, and exact cleanup.
- Checksum-presigned uploads sign `Content-Type` and keep
  `x-amz-checksum-sha256` signed and unhoisted.

---

## External Services (Free Tier)

| Service | Purpose | Connection |
|---|---|---|
| **Neon** | PostgreSQL 16, serverless, auto-pause | `DATABASE_URL` in .env |
| **Upstash Redis** | BullMQ queues, serverless | `REDIS_URL` in .env |
| **Vercel** | Web frontend hosting | Auto-deploy from GitHub main |
| **Groq** | Whisper STT | `GROQ_API_KEY` in .env |

---

## SSH Access

```bash
ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193
```

---

## CI/CD (Fully Working — May 14, 2026)

Push to `main` → GitHub Actions → build linux/amd64 Docker image → push ECR → SSH to EC2 → pull & restart container → health check.

**GitHub Secrets required:**
- `AWS_ACCESS_KEY_ID` — IAM user credentials
- `AWS_SECRET_ACCESS_KEY` — IAM user credentials
- `EC2_SSH_KEY` — contents of `~/.ssh/hearloop-key.pem`

**Security group:** `sg-0fdee87e11e224206` (hearloop-api-sg)
- Port 22: dynamically opened/closed per CI/CD run (runner IP added before SSH, revoked after)
- Port 3001: open to `0.0.0.0/0`

Workflow file: `.github/workflows/docker-image.yml`

---

## Manual Deployment

From repo root (not `apps/api`):

```bash
# 1. Build image for EC2 (must be linux/amd64)
docker build --platform linux/amd64 -f apps/api/Dockerfile -t hearloop-api .

# 2. Tag for ECR
docker tag hearloop-api:latest 652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest

# 3. Authenticate Docker to ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin 652892608187.dkr.ecr.us-east-2.amazonaws.com

# 4. Push
docker push 652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest

# 5. SSH to EC2 and restart
ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193 \
  "docker stop hearloop-api && docker rm hearloop-api && \
   docker pull 652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest && \
   docker run -d --name hearloop-api --env-file /home/ec2-user/.env -p 3001:3001 \
   --restart unless-stopped 652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest"
```

---

## Required Environment Variables (API — EC2 `/home/ec2-user/.env`)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `REDIS_URL` | Upstash Redis connection string (`rediss://...`) |
| `APP_URL` | `https://hearloop.vercel.app` |
| `PORT` | `3001` |
| `NODE_ENV` | `production` |
| `STORAGE_ENDPOINT` | `https://s3.us-east-2.amazonaws.com` |
| `STORAGE_REGION` | `us-east-2` |
| `STORAGE_ACCESS_KEY_ID` | IAM key with S3 access |
| `STORAGE_SECRET_ACCESS_KEY` | IAM secret |
| `STORAGE_BUCKET` | `hearloop-audio-prod` |
| `GROQ_API_KEY` | Groq API key for Whisper |
| `BEDROCK_REGION` | `us-east-2` |
| `BEDROCK_ACCESS_KEY_ID` | IAM key with Bedrock access |
| `BEDROCK_SECRET_ACCESS_KEY` | IAM secret |
| `WEBHOOK_SIGNING_SECRET` | HMAC secret for webhook signatures |
| `PARTNER_SESSION_SECRET` | HMAC secret for `hlps.*` dashboard session tokens (register/login) — **required**; generate with `openssl rand -base64 32` |

---

## Required Environment Variables (Web — Vercel)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Optional. Prefer omitting — server pages use `/api` proxy via `serverApiBase()`; Recorder defaults to `/api`. If set, use `https://hearloop.vercel.app/api` (**not** `/api/v1`). |

---

## Database migrations (Neon)

Migration files are immutable history and must be applied through an explicit
release gate. File presence does not prove production application.

Production Neon (`divine-cherry-94715192`, default branch `production`,
`br-green-poetry-aj1e0o9v`), applied 2026-08-15 via Neon MCP (`010` then `011`):

| Migration | Production default branch |
|---|---|
| `009_business_context_import.sql` | Applied (`partners.website_url`, `business_context_source`) |
| `010_webhook_delivery_event_id.sql` | Applied (`webhook_deliveries.event_id` uuid NOT NULL, 1/1 rows populated) |
| `011_media_evidence_pinning.sql` | Applied (`sessions.upload_protocol`, `upload_grants`, `finalize_receipts`, recordings version columns) |

Post-apply verification: 1882/1882 sessions `legacy-v0`, 0 `versioned-v1`, 32 recordings
with version columns still null, 0 `upload_grants`, 0 `finalize_receipts`. New Sessions
still default to `legacy-v0`. Rollback remains the commented block at the bottom of
`011` only while `versioned-v1` count is 0; page before running it.

To initialize a new database, apply every migration in numeric order rather
than copying only the original three commands from this document:

```bash
NEON_URL="postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require&channel_binding=require"
for migration in packages/db/migrations/*.sql; do
  psql "$NEON_URL" -f "$migration"
done
```

---

## GitHub

Repo: https://github.com/shubh209/Hearloop
