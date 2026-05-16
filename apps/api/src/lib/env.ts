// hearloop/apps/api/src/lib/env.ts
// Validates required environment variables at startup.
// Throws immediately if anything is missing so the container fails loudly
// rather than silently misbehaving at runtime.

const REQUIRED: Record<string, string> = {
  DATABASE_URL:              "PostgreSQL connection string",
  REDIS_URL:                 "Redis connection string (Upstash or ElastiCache)",
  BEDROCK_REGION:            "Bedrock region (e.g. us-east-2)",
  GROQ_API_KEY:              "Groq API key for Whisper transcription",
  WEBHOOK_SIGNING_SECRET:    "HMAC secret for signing webhook payloads",
  STORAGE_REGION:            "S3/R2 storage region",
  STORAGE_BUCKET:            "S3/R2 bucket name for audio files",
  STORAGE_ACCESS_KEY_ID:     "S3/R2 access key ID",
  STORAGE_SECRET_ACCESS_KEY: "S3/R2 secret access key",
};

// Bedrock credentials may share the same key as storage or have their own
const ALIASED: Array<[string[], string]> = [
  [["BEDROCK_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", "STORAGE_ACCESS_KEY_ID"], "Bedrock access key ID"],
  [["BEDROCK_SECRET_ACCESS_KEY", "AWS_SECRET_ACCESS_KEY", "STORAGE_SECRET_ACCESS_KEY"], "Bedrock secret access key"],
];

export function validateEnv(): void {
  const missing: string[] = [];

  for (const [key, description] of Object.entries(REQUIRED)) {
    if (!process.env[key]) {
      missing.push(`  ${key.padEnd(30)} — ${description}`);
    }
  }

  for (const [aliases, description] of ALIASED) {
    const found = aliases.some((k) => !!process.env[k]);
    if (!found) {
      missing.push(`  ${aliases[0].padEnd(30)} — ${description} (checked: ${aliases.join(", ")})`);
    }
  }

  if (missing.length > 0) {
    console.error(
      "\n❌  Hearloop API failed to start — missing required environment variables:\n\n" +
      missing.join("\n") +
      "\n\nSet these in /home/ec2-user/.env and restart the container.\n"
    );
    process.exit(1);
  }
}
