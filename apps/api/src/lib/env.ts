// hearloop/apps/api/src/lib/env.ts
// Validates required environment variables at startup.
// Throws immediately if anything is missing so the container fails loudly
// rather than silently misbehaving at runtime.

const REQUIRED: Record<string, string> = {
  DATABASE_URL:              "PostgreSQL connection string (RDS)",
  REDIS_URL:                 "ElastiCache Valkey connection string",
  AWS_REGION:                "AWS region (e.g. us-east-2)",
  BEDROCK_REGION:            "Bedrock region (e.g. us-east-2)",
  S3_BUCKET:                 "S3 bucket name for audio files",
  GROQ_API_KEY:              "Groq API key for Whisper transcription",
  WEBHOOK_SIGNING_SECRET:    "HMAC secret for signing webhook payloads",
};

// These are needed but may use aliased names on EC2
const ALIASED: Array<[string[], string]> = [
  [["AWS_ACCESS_KEY_ID", "BEDROCK_ACCESS_KEY_ID", "STORAGE_ACCESS_KEY_ID"], "AWS access key ID"],
  [["AWS_SECRET_ACCESS_KEY", "BEDROCK_SECRET_ACCESS_KEY", "STORAGE_SECRET_ACCESS_KEY"], "AWS secret access key"],
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
