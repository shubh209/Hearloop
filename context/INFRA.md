# Hearloop — Infrastructure Reference

> Contains live IPs and deployment commands. Do not commit secrets here.

Last updated: May 16, 2026

---

## Live Endpoints

| Resource | URL |
|---|---|
| Web (Vercel) | https://hearloop.vercel.app |
| API (EC2) | http://18.223.189.193:3001 |
| API Health | http://18.223.189.193:3001/health |
| API via Vercel proxy | https://hearloop.vercel.app/api/* |

---

## AWS Resources (us-east-2)

| Resource | Type | Details | Cost |
|---|---|---|---|
| EC2 | t3.micro | Elastic IP: 18.223.189.193 — API container on port 3001 | ~$8/mo |
| EBS | 20 GB gp3 | EC2 root volume | ~$1.60/mo |
| S3 | `hearloop-audio-prod` | Private bucket, CORS enabled for presigned PUT uploads | ~$0.002/mo |
| ECR | `hearloop-api` | Docker image repository, lifecycle policy active | $0 free tier |

**Deleted (May 16, 2026):** RDS t3.micro, ElastiCache Valkey t3.micro, CloudWatch RDSOSMetrics log group

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

---

## Required Environment Variables (Web — Vercel)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://hearloop.vercel.app/api/v1` (uses Vercel proxy) |

---

## Database Migrations (Neon)

All 3 migrations are applied on Neon. To re-run from scratch:

```bash
NEON_URL="postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require&channel_binding=require"
psql "$NEON_URL" -f packages/db/migrations/001_initial.sql
psql "$NEON_URL" -f packages/db/migrations/002_partner_auth.sql
psql "$NEON_URL" -f packages/db/migrations/003_metrics_columns.sql
```

---

## GitHub

Repo: https://github.com/shubh209/Hearloop
