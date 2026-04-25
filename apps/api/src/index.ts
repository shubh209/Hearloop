// hearloop/apps/api/src/index.ts

import Fastify from "fastify";
import { sessionRoutes } from "./routes/sessions";
import { publicRoutes } from "./routes/public";
import { db } from "./lib/db";
import { queue, webhookQueue, createWorker } from "./lib/queue";
import { runValidateRecordingJob } from "./jobs/validate-recording";
import { runTranscribeJob } from "./jobs/transcribe";
import { runAnalyzeJob } from "./jobs/analyze";
import { runDeliverWebhookJob } from "./jobs/deliver-webhook";
import { Job } from "bullmq";

const app = Fastify({ logger: true });

// --- Auth decorator ---
app.decorate("authenticate", async (req: any, reply: any) => {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "missing_auth" });
  }

  const token = auth.slice(7);
  const { createHash } = await import("crypto");
  const keyHash = createHash("sha256").update(token).digest("hex");

  const apiKey = await db
    .selectFrom("api_keys")
    .innerJoin("partners", "partners.id", "api_keys.partner_id")
    .select([
      "api_keys.id as keyId",
      "api_keys.partner_id",
      "partners.id as partnerId",
      "partners.name",
      "partners.status",
      "partners.webhook_url",
      "partners.allowed_origins",
      "partners.default_config_json",
    ])
    .where("api_keys.key_hash", "=", keyHash)
    .where("api_keys.revoked_at", "is", null)
    .where("partners.status", "=", "active")
    .executeTakeFirst();

  if (!apiKey) {
    return reply.code(401).send({ error: "invalid_api_key" });
  }

  // Update last used
  await db
    .updateTable("api_keys")
    .set({ last_used_at: new Date() })
    .where("id", "=", apiKey.keyId)
    .execute();

  req.partner = {
    id: apiKey.partnerId,
    name: apiKey.name,
    webhookUrl: apiKey.webhook_url,
  };
});

// --- CORS ---
app.addHook("onRequest", async (req, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );
  reply.header(
    "Access-Control-Allow-Methods",
    "GET, POST, DELETE, OPTIONS"
  );
  if (req.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

// --- Routes ---
app.register(sessionRoutes, { prefix: "/v1" });
app.register(publicRoutes, { prefix: "/v1" });

// --- Health check ---
app.get("/health", async () => ({ status: "ok", ts: new Date() }));

// --- Workers ---
function startWorkers() {
  const transcribeWorker = createWorker(
    "transcribe",
    async (job: Job) => {
      console.log("Processing transcribe job:", job.id, job.data);
      await runTranscribeJob(job.data);
    }
  );

  const analyzeWorker = createWorker(
    "analyze",
    async (job: Job) => {
      console.log("Processing analyze job:", job.id, job.data);
      await runAnalyzeJob(job.data);
    }
  );

  const validateWorker = createWorker(
    "validate-recording",
    async (job: Job) => {
      console.log("Processing validate job:", job.id, job.data);
      await runValidateRecordingJob(job.data);
    }
  );

  const webhookWorker = createWorker(
    "deliver-webhook",
    async (job: Job) => {
      console.log("Processing webhook job:", job.id, job.data);
      await runDeliverWebhookJob(job.data);
    }
  );

  // Graceful shutdown
  const shutdown = async () => {
    app.log.info("Shutting down workers...");
    await Promise.all([
      validateWorker.close(),
      transcribeWorker.close(),
      analyzeWorker.close(),
      webhookWorker.close(),
      queue.close(),
      webhookQueue.close(),
    ]);
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  app.log.info("Workers started");
}

// --- Boot ---
const start = async () => {
  try {
    await app.listen({
      port: Number(process.env.PORT ?? 3001),
      host: "0.0.0.0",
    });

    startWorkers();
    app.log.info(`Hearloop API running on port ${process.env.PORT ?? 3001}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();