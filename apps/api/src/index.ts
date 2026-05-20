// hearloop/apps/api/src/index.ts

// Load .env from monorepo root in local dev only (Docker passes env vars directly)
if (process.env.NODE_ENV !== "production") {
  const dotenv = require("dotenv");
  const path = require("path");
  dotenv.config({ path: path.join(process.cwd(), "../../.env") });
}

import { validateEnv } from "./lib/env";
validateEnv();

import Fastify from "fastify";
import { jobLogger } from "./lib/logger";
import { sessionRoutes } from "./routes/sessions";
import { publicRoutes } from "./routes/public";
import { db } from "./lib/db";
import { createWorker } from "./lib/queue";
import { runValidateRecordingJob } from "./jobs/validate-recording";
import { runTranscribeJob } from "./jobs/transcribe";
import { runAnalyzeJob } from "./jobs/analyze";
import { runDeliverWebhookJob } from "./jobs/deliver-webhook";
import { runExpireSessionJob } from "./jobs/expire-session";
import { Job } from "bullmq";
import rateLimit from "@fastify/rate-limit";
import { partnerRoutes } from "./routes/partners";

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
      "partners.business_context",
    ])
    .where("api_keys.key_hash", "=", keyHash)
    .where("api_keys.revoked_at", "is", null)
    .where("partners.status", "=", "active")
    .executeTakeFirst();

  if (!apiKey) return reply.code(401).send({ error: "invalid_api_key" });

  await db
    .updateTable("api_keys")
    .set({ last_used_at: new Date() })
    .where("id", "=", apiKey.keyId)
    .execute();

  req.partner = {
    id: apiKey.partnerId,
    name: apiKey.name,
    webhookUrl: apiKey.webhook_url,
    allowedOrigins: apiKey.allowed_origins,
    businessContext: apiKey.business_context ?? null,
  };

  // Per-partner origin enforcement: if the partner has configured allowed_origins,
  // validate the request Origin and override the CORS header to the specific origin.
  const requestOrigin = req.headers["origin"];
  if (apiKey.allowed_origins && requestOrigin) {
    const allowed = apiKey.allowed_origins
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    if (!allowed.includes(requestOrigin)) {
      return reply
        .code(403)
        .send({ error: "origin_not_allowed" });
    }
    // Override the wildcard set by the onRequest hook with the specific allowed origin.
    reply.header("Access-Control-Allow-Origin", requestOrigin);
  }
});

// --- CORS ---
app.addHook("onRequest", async (req, reply) => {
  reply.header("Access-Control-Allow-Origin", "*");
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  reply.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (req.method === "OPTIONS") return reply.code(204).send();
});

// --- Health check ---
app.get("/health", async () => ({ status: "ok", ts: new Date() }));

// --- Workers ---
let workersStarted = false;

function startWorkers() {
  if (workersStarted) {
    app.log.warn("Workers already started, skipping");
    return;
  }
  workersStarted = true;

  const workerLog = jobLogger("worker");

  const transcribeWorker = createWorker("transcribe", async (job: Job) => {
    workerLog.info({ jobId: job.id, sessionId: job.data.sessionId }, "transcribe job started");
    await runTranscribeJob(job.data);
  });

  const analyzeWorker = createWorker("analyze", async (job: Job) => {
    workerLog.info({ jobId: job.id, sessionId: job.data.sessionId }, "analyze job started");
    await runAnalyzeJob(job.data);
  });

  const validateWorker = createWorker("validate-recording", async (job: Job) => {
    workerLog.info({ jobId: job.id, sessionId: job.data.sessionId }, "validate job started");
    await runValidateRecordingJob(job.data);
  });

  const webhookWorker = createWorker("deliver-webhook", async (job: Job) => {
    workerLog.info({ jobId: job.id, sessionId: job.data.sessionId }, "webhook job started");
    await runDeliverWebhookJob(job.data);
  });

  const expireWorker = createWorker("expire-session", async (job: Job) => {
    workerLog.info({ jobId: job.id, sessionId: job.data.sessionId }, "expire job started");
    await runExpireSessionJob(job.data);
  });

  const shutdown = async () => {
    app.log.info("Shutting down workers...");
    await Promise.all([
      validateWorker.close(),
      transcribeWorker.close(),
      analyzeWorker.close(),
      webhookWorker.close(),
      expireWorker.close(),
    ]);
    // Each worker closes its own dedicated connection when worker.close() resolves
    process.exit(0);
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  app.log.info("Workers started");
}

// --- Boot ---
const start = async () => {
  try {
    // 1. Rate limit FIRST
    await app.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute",
      keyGenerator: (req: any) => {
        const auth = req.headers["authorization"] ?? "";
        const token = auth.replace("Bearer ", "");
        return token.slice(0, 16) || req.ip;
      },
      errorResponseBuilder: () => ({
          statusCode: 429,
          error: "Too Many Requests",
          message: "Rate limit exceeded. Max 100 requests per minute.",
        }),
    });

   // 2. Routes AFTER rate limit
      await app.register(sessionRoutes, { prefix: "/v1" });
      await app.register(publicRoutes, { prefix: "/v1" });
      await app.register(partnerRoutes, { prefix: "/v1" }); // ADD THIS

      // 3. Listen
      await app.listen({
        port: Number(process.env.PORT ?? 3001),
        host: "0.0.0.0",
      });

    // 4. Workers
    startWorkers();
      app.log.info(`Hearloop API running on port ${process.env.PORT ?? 3001}`);
    } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();