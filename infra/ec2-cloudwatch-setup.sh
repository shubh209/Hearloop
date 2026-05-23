#!/usr/bin/env bash
# infra/ec2-cloudwatch-setup.sh
#
# Run this ONCE on the EC2 instance to add the two CloudWatch env vars
# that lib/cloudwatch.ts and lib/env.ts require at startup.
#
# Prerequisites:
#   - SSH access: ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193
#   - The IAM user must have cloudwatch:PutMetricData permission
#     (see infra/iam-cloudwatch-policy.json — attach to the IAM user first)
#
# Usage (run from your local machine):
#   ssh -i ~/.ssh/hearloop-key.pem ec2-user@18.223.189.193 'bash -s' < infra/ec2-cloudwatch-setup.sh
#
# Or copy-paste the commands below directly into the SSH session.

set -euo pipefail

ENV_FILE="/home/ec2-user/.env"

echo "==> Checking current .env for existing CloudWatch vars..."
if grep -q "CLOUDWATCH_REGION" "$ENV_FILE"; then
  echo "    CLOUDWATCH_REGION already set — skipping"
else
  echo "CLOUDWATCH_REGION=us-east-2" >> "$ENV_FILE"
  echo "    Added CLOUDWATCH_REGION=us-east-2"
fi

if grep -q "CLOUDWATCH_NAMESPACE" "$ENV_FILE"; then
  echo "    CLOUDWATCH_NAMESPACE already set — skipping"
else
  echo "CLOUDWATCH_NAMESPACE=Hearloop/Pipeline" >> "$ENV_FILE"
  echo "    Added CLOUDWATCH_NAMESPACE=Hearloop/Pipeline"
fi

echo ""
echo "==> Current CloudWatch vars in .env:"
grep "CLOUDWATCH" "$ENV_FILE"

echo ""
echo "==> Restarting container with updated env..."
ECR_IMAGE="652892608187.dkr.ecr.us-east-2.amazonaws.com/hearloop-api:latest"

# Authenticate Docker to ECR (uses the instance's IAM role or env creds)
aws ecr get-login-password --region us-east-2 | \
  docker login --username AWS --password-stdin \
  652892608187.dkr.ecr.us-east-2.amazonaws.com

docker stop hearloop-api  || true
docker rm   hearloop-api  || true

docker run -d \
  --name hearloop-api \
  --env-file "$ENV_FILE" \
  -p 3001:3001 \
  --restart unless-stopped \
  "$ECR_IMAGE"

echo ""
echo "==> Waiting 10s for container to start..."
sleep 10

echo "==> Health check..."
curl --fail --silent http://localhost:3001/health && echo "  ✓ Health check passed" \
  || echo "  ✗ Health check FAILED — check: docker logs hearloop-api"

echo ""
echo "Done. Next steps:"
echo "  1. Verify IAM user has cloudwatch:PutMetricData (see infra/iam-cloudwatch-policy.json)"
echo "  2. Submit a real session and check CloudWatch console:"
echo "     https://console.aws.amazon.com/cloudwatch/home?region=us-east-2#metricsV2:namespace=Hearloop/Pipeline"
