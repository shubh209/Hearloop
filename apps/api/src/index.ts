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
import { createWorker } from "./lib/queue";
import { runValidateRecordingJob } from "./jobs/validate-recording";
import { runTranscribeJob } from "./jobs/transcribe";
import { runAnalyzeJob } from "./jobs/analyze";
import { runDeliverWebhookJob } from "./jobs/deliver-webhook";
import { runExpireSessionJob } from "./jobs/expire-session";
import { runImportBusinessContextJob } from "./jobs/import-business-context";
import { Job } from "bullmq";
import rateLimit from "@fastify/rate-limit";
import { rateLimitKey } from "./lib/rate-limit-key";
import { isPublicRoute } from "./lib/is-public-route";
import { partnerRoutes } from "./routes/partners";
import { partnerMeRoutes } from "./routes/partner-me";
import { captureLinkRoutes } from "./routes/capture-links";
import { businessContextImportRoutes } from "./routes/business-context-import";
import { healthRoutes } from "./routes/health";
import {
  authenticatePartner,
  authenticateSecretKey,
} from "./lib/authenticate-partner";

const app = Fastify({ logger: true });

app.decorate("authenticate", authenticateSecretKey);
app.decorate("authenticatePartner", authenticatePartner);

// --- CORS ---
// Wildcard is only for the widget-facing /v1/public/* routes (called from
// arbitrary partner websites; per-partner origin allowlisting happens deeper
// in the call chain — lookup-api-key.ts / authenticate-partner.ts).
// Authenticated/dashboard routes get no default CORS header: the web app
// talks to this API via a same-origin server-side proxy, not the browser, so
// omitting it here means unlisted browser origins are blocked as intended.
app.addHook("onRequest", async (req, reply) => {
  reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  reply.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  if (isPublicRoute(req.url)) {
    reply.header("Access-Control-Allow-Origin", "*");
  }
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

  const importWorker = createWorker("import-business-context", async (job: Job) => {
    workerLog.info({ jobId: job.id, partnerId: job.data.partnerId }, "import job started");
    return runImportBusinessContextJob(job.data);
  });

  const shutdown = async () => {
    app.log.info("Shutting down workers...");
    await Promise.all([
      validateWorker.close(),
      transcribeWorker.close(),
      analyzeWorker.close(),
      webhookWorker.close(),
      expireWorker.close(),
      importWorker.close(),
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
      max: Number(process.env.RATE_LIMIT_MAX ?? 100),
      timeWindow: process.env.RATE_LIMIT_WINDOW_MS
        ? Number(process.env.RATE_LIMIT_WINDOW_MS)
        : "1 minute",
      keyGenerator: rateLimitKey,
      errorResponseBuilder: () => ({
          statusCode: 429,
          error: "Too Many Requests",
          message: "Rate limit exceeded. Max 100 requests per minute.",
        }),
    });

   // 2. Routes AFTER rate limit
      await app.register(sessionRoutes, { prefix: "/v1" });
      await app.register(publicRoutes, { prefix: "/v1" });
      await app.register(partnerRoutes, { prefix: "/v1" });
      await app.register(partnerMeRoutes, { prefix: "/v1" });
      await app.register(captureLinkRoutes, { prefix: "/v1" });
      await app.register(businessContextImportRoutes, { prefix: "/v1" });
      await app.register(healthRoutes);

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