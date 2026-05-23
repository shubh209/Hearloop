#!/usr/bin/env bash
# infra/alarms.sh
#
# Creates CloudWatch alarms for the Hearloop EC2 t3.micro instance.
#
# Prerequisites:
#   - AWS CLI configured with credentials that have cloudwatch:PutMetricAlarm permission
#   - INSTANCE_ID  — the EC2 instance ID (e.g. i-0abc1234def56789a)
#   - SNS_TOPIC_ARN — the SNS topic ARN to notify on alarm/ok transitions
#                     (e.g. arn:aws:sns:us-east-2:123456789012:hearloop-alerts)
#
# Usage:
#   INSTANCE_ID=i-0abc1234def56789a \
#   SNS_TOPIC_ARN=arn:aws:sns:us-east-2:123456789012:hearloop-alerts \
#   bash infra/alarms.sh
#
# Both variables are required. The script will exit immediately if either is unset.

set -euo pipefail

# ── Input validation ──────────────────────────────────────────────────────────

: "${INSTANCE_ID:?INSTANCE_ID must be set (e.g. i-0abc1234def56789a)}"
: "${SNS_TOPIC_ARN:?SNS_TOPIC_ARN must be set (e.g. arn:aws:sns:us-east-2:123456789012:hearloop-alerts)}"

REGION="${AWS_DEFAULT_REGION:-us-east-2}"

echo "Creating CloudWatch alarms for instance ${INSTANCE_ID} in ${REGION}..."

# ── CPU alarm ─────────────────────────────────────────────────────────────────
# Namespace:  AWS/EC2 (native EC2 metric — no CloudWatch Agent required)
# Metric:     CPUUtilization
# Threshold:  >= 80% for 2 consecutive 5-minute periods (10 min sustained)
# Statistic:  Average
# Missing:    treated as missing (not breaching) — CPU data is always present
#             when the instance is running; missing data means the instance is
#             stopped, which is not an alarm condition.

aws cloudwatch put-metric-alarm \
  --region "${REGION}" \
  --alarm-name "hearloop-ec2-cpu-high" \
  --alarm-description "EC2 CPU >= 80% for 10 minutes on Hearloop t3.micro" \
  --namespace "AWS/EC2" \
  --metric-name "CPUUtilization" \
  --dimensions "Name=InstanceId,Value=${INSTANCE_ID}" \
  --statistic "Average" \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 80 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --treat-missing-data "missing" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

echo "  ✓ CPU alarm created: hearloop-ec2-cpu-high (>= 80%, 2x5min)"

# ── Memory alarm ──────────────────────────────────────────────────────────────
# Namespace:  CWAgent (requires CloudWatch Agent installed on the EC2 instance)
# Metric:     mem_used_percent
# Threshold:  >= 85% for 2 consecutive 5-minute periods (10 min sustained)
# Statistic:  Average
# Missing:    treated as BREACHING — if the CloudWatch Agent crashes or the
#             instance stops reporting memory, we want to be alerted rather
#             than silently remain in INSUFFICIENT_DATA.
#
# FALLBACK: If the CloudWatch Agent is NOT installed on the EC2 instance,
# change --namespace to "Hearloop/Pipeline" and --metric-name to
# "mem_used_percent" once the API process emits that custom metric via
# lib/cloudwatch.ts. The threshold, periods, and treat-missing-data settings
# remain the same.
#
# To install the CloudWatch Agent on the EC2 instance:
#   sudo yum install -y amazon-cloudwatch-agent
#   sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
#   sudo systemctl enable amazon-cloudwatch-agent
#   sudo systemctl start amazon-cloudwatch-agent

aws cloudwatch put-metric-alarm \
  --region "${REGION}" \
  --alarm-name "hearloop-ec2-memory-high" \
  --alarm-description "EC2 memory >= 85% for 10 minutes on Hearloop t3.micro" \
  --namespace "CWAgent" \
  --metric-name "mem_used_percent" \
  --dimensions "Name=InstanceId,Value=${INSTANCE_ID}" \
  --statistic "Average" \
  --period 300 \
  --evaluation-periods 2 \
  --threshold 85 \
  --comparison-operator "GreaterThanOrEqualToThreshold" \
  --treat-missing-data "breaching" \
  --alarm-actions "${SNS_TOPIC_ARN}" \
  --ok-actions "${SNS_TOPIC_ARN}"

echo "  ✓ Memory alarm created: hearloop-ec2-memory-high (>= 85%, 2x5min, treat-missing=breaching)"
echo ""
echo "Done. Both alarms are active in CloudWatch (region: ${REGION})."
echo "Verify at: https://console.aws.amazon.com/cloudwatch/home?region=${REGION}#alarmsV2:"
