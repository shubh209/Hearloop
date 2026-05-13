# Hearloop — Infrastructure Reference

> Contains live IPs and deployment commands. Do not commit secrets here.

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

| Resource | Type | Details |
|---|---|---|
| EC2 | t3.micro | Elastic IP: 18.223.189.193 — API container on port 3001 |
| RDS | PostgreSQL 16, db.t3.micro | Private subnet. No `sslmode` in connection string. |
| ElastiCache | Valkey 7.2, cache.t3.micro | Private subnet. Set `maxmemory-policy noeviction`. |
| S3 | `hearloop-audio-prod` | Private bucket, CORS enabled for presigned PUT uploads |
| ECR | `hearloop-api` | Docker image repository |

---

## SSH Access

```bash
ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193
```

---

## Deployment (Manual — Current)

From repo root (not `apps/api`):

```bash
# 1. Build image for EC2 (must be linux/amd64)
docker build --platform linux/amd64 -f apps/api/Dockerfile -t hearloop-api .

# 2. Tag for ECR
docker tag hearloop-api:latest <account_id>.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest

# 3. Authenticate Docker to ECR
aws ecr get-login-password --region us-east-2 | docker login --username AWS --password-stdin <account_id>.dkr.ecr.us-east-2.amazonaws.com

# 4. Push
docker push <account_id>.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest

# 5. SSH to EC2 and pull
ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193 \
  "aws ecr get-login-password --region us-east-2 | docker login ... && docker pull ... && docker stop hearloop && docker rm hearloop && docker run -d --name hearloop -p 3001:3001 --env-file /home/ec2-user/.env <image> "
```

**Known CI bug**: `.github/workflows/docker-image.yml` uses build context `./apps/api` which breaks the monorepo Dockerfile. Fix pending (P0 in backlog).

---

## Required Environment Variables (API)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (RDS) |
| `REDIS_URL` | ElastiCache Valkey connection string |
| `AWS_REGION` | us-east-2 |
| `BEDROCK_REGION` | us-east-2 (or override) |
| `S3_BUCKET` | hearloop-audio-prod |
| `GROQ_API_KEY` | Groq API key for Whisper |
| `AWS_ACCESS_KEY_ID` | IAM user with Bedrock + S3 + ECR access |
| `AWS_SECRET_ACCESS_KEY` | IAM secret |

---

## Required Environment Variables (Web)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Points to API (via Vercel proxy or direct) |

`apps/web/.env.local` contains a Vercel OIDC token — do not share or commit.

---

## Vercel Configuration

`apps/web/vercel.json` handles build and routing config.
Next.js API proxy at `apps/web/app/api/[...path]/route.ts` forwards to `http://18.223.189.193:3001/v1/*`.

Deploy web frontend:
```bash
cd apps/web
vercel --prod
```

---

## Database Migrations

Run manually via `psql` against RDS (in VPC or via bastion):

```bash
psql $DATABASE_URL -f packages/db/migrations/001_initial.sql
# After creating 002:
psql $DATABASE_URL -f packages/db/migrations/002_partner_auth.sql
```

Current migration state:
- `001_initial.sql` — applied (base schema, but missing partner auth columns)
- `002_partner_auth.sql` — **not yet created** (P0 backlog item)

---

## Test Credentials

```
API key (test partner): sk-test-hearloop-1234567890abcdef
Partner ID: 7a9e3e2c-07e8-4dae-a133-dd9caa0cad2b
```

---

## GitHub

Repo: https://github.com/shubh209/Hearloop
