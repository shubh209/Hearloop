// hearloop/apps/api/src/lib/cloudwatch.ts
// Single responsibility: CloudWatch client singleton + PutMetricData helpers.
// All configuration is read directly from process.env — no imports from lib/, jobs/, or routes/.

import {
  CloudWatchClient,
  PutMetricDataCommand,
  MetricDatum,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";

// ── Credential resolution ───────────────────────────────────────────────────
// Iterates the alias list and returns the first non-empty value.
// Throws at module load time if none of the aliases resolves to a non-empty value.
function resolveCredential(aliases: string[], label: string): string {
  for (const key of aliases) {
    const val = process.env[key];
    if (val && val.trim() !== "") return val;
  }
  throw new Error(
    `[cloudwatch] Missing credential: ${label}. Checked: ${aliases.join(", ")}`
  );
}

// ── Region validation ───────────────────────────────────────────────────────
// Throws immediately at module load time if CLOUDWATCH_REGION is absent or empty.
const region = process.env.CLOUDWATCH_REGION;
if (!region || region.trim() === "") {
  throw new Error(
    "[cloudwatch] CLOUDWATCH_REGION is required but not set."
  );
}

// ── Credential resolution (priority order per requirements 1.3) ─────────────
// accessKeyId:     BEDROCK_ACCESS_KEY_ID → AWS_ACCESS_KEY_ID → STORAGE_ACCESS_KEY_ID
// secretAccessKey: BEDROCK_SECRET_ACCESS_KEY → AWS_SECRET_ACCESS_KEY → STORAGE_SECRET_ACCESS_KEY
const accessKeyId = resolveCredential(
  ["BEDROCK_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "STORAGE_ACCESS_KEY_ID"],
  "access key ID"
);

const secretAccessKey = resolveCredential(
  ["BEDROCK_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "STORAGE_SECRET_ACCESS_KEY"],
  "secret access key"
);

// ── Singleton CloudWatchClient ──────────────────────────────────────────────
// Constructed once at module load time. No CloudWatch API is called here.
export const cloudWatchClient = new CloudWatchClient({
  region,
  credentials: { accessKeyId, secretAccessKey },
});

// ── Model ID mapping ────────────────────────────────────────────────────────
// Maps the short aliases returned by lib/claude.ts to the full Bedrock model
// identifier strings used as the ModelId CloudWatch dimension value.
const MODEL_ID_MAP: Record<string, string> = {
  "nova-lite":      "us.amazon.nova-lite-v1:0",
  "haiku-fallback": "us.anthropic.claude-haiku-4-5-20251001-v1:0",
};

// ── Input type ──────────────────────────────────────────────────────────────
export interface BedrockInvocationMetric {
  /** Short alias from AnalysisResult.modelUsed — "nova-lite" | "haiku-fallback" */
  modelUsed: "nova-lite" | "haiku-fallback";
  /** Millisecond epoch captured by caller immediately before analyzeTranscript() */
  startTimestamp: number;
  inputTokens: number;
  outputTokens: number;
}

// ── Emit helper ─────────────────────────────────────────────────────────────
// Emits exactly 4 MetricDatum items in a single PutMetricDataCommand.
// Errors propagate to the caller — no retry, no other CloudWatch API calls.
// Does NOT import lib/logger.ts; logging on failure is the caller's responsibility.
export async function emitBedrockInvocation(
  metric: BedrockInvocationMetric
): Promise<void> {
  const namespace = process.env.CLOUDWATCH_NAMESPACE ?? "Hearloop/Pipeline";
  const latencyMs = Date.now() - metric.startTimestamp;
  const modelId = MODEL_ID_MAP[metric.modelUsed];
  const outcome: string = metric.modelUsed === "nova-lite" ? "success" : "fallback";

  const dimensions = [
    { Name: "ModelId", Value: modelId },
    { Name: "Outcome", Value: outcome },
  ];

  const metricData: MetricDatum[] = [
    {
      MetricName: "BedrockLatencyMs",
      Value:      latencyMs,
      Unit:       StandardUnit.Milliseconds,
      Dimensions: dimensions,
    },
    {
      MetricName: "BedrockInputTokens",
      Value:      metric.inputTokens,
      Unit:       StandardUnit.Count,
      Dimensions: dimensions,
    },
    {
      MetricName: "BedrockOutputTokens",
      Value:      metric.outputTokens,
      Unit:       StandardUnit.Count,
      Dimensions: dimensions,
    },
    {
      MetricName: "BedrockInvocationCount",
      Value:      1,
      Unit:       StandardUnit.Count,
      Dimensions: dimensions,
    },
  ];

  await cloudWatchClient.send(
    new PutMetricDataCommand({ Namespace: namespace, MetricData: metricData })
  );
}
