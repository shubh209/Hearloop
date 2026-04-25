"use strict";
// hearloop/apps/api/src/index.ts
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const sessions_1 = require("./routes/sessions");
const public_1 = require("./routes/public");
const db_1 = require("./lib/db");
const queue_1 = require("./lib/queue");
const validate_recording_1 = require("./jobs/validate-recording");
const transcribe_1 = require("./jobs/transcribe");
const analyze_1 = require("./jobs/analyze");
const deliver_webhook_1 = require("./jobs/deliver-webhook");
const app = (0, fastify_1.default)({ logger: true });
// --- Auth decorator ---
app.decorate("authenticate", async (req, reply) => {
    const auth = req.headers["authorization"];
    if (!auth?.startsWith("Bearer ")) {
        return reply.code(401).send({ error: "missing_auth" });
    }
    const token = auth.slice(7);
    const { createHash } = await Promise.resolve().then(() => __importStar(require("crypto")));
    const keyHash = createHash("sha256").update(token).digest("hex");
    const apiKey = await db_1.db
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
    await db_1.db
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
    reply.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    reply.header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    if (req.method === "OPTIONS") {
        return reply.code(204).send();
    }
});
// --- Routes ---
app.register(sessions_1.sessionRoutes, { prefix: "/v1" });
app.register(public_1.publicRoutes, { prefix: "/v1/public" });
// --- Health check ---
app.get("/health", async () => ({ status: "ok", ts: new Date() }));
// --- Workers ---
function startWorkers() {
    const validateWorker = (0, queue_1.createWorker)("validate-recording", async (job) => {
        await (0, validate_recording_1.runValidateRecordingJob)(job.data);
    });
    const transcribeWorker = (0, queue_1.createWorker)("transcribe", async (job) => {
        await (0, transcribe_1.runTranscribeJob)(job.data);
    });
    const analyzeWorker = (0, queue_1.createWorker)("analyze", async (job) => {
        await (0, analyze_1.runAnalyzeJob)(job.data);
    });
    const webhookWorker = (0, queue_1.createWorker)("deliver-webhook", async (job) => {
        await (0, deliver_webhook_1.runDeliverWebhookJob)(job.data);
    });
    // Graceful shutdown
    const shutdown = async () => {
        app.log.info("Shutting down workers...");
        await Promise.all([
            validateWorker.close(),
            transcribeWorker.close(),
            analyzeWorker.close(),
            webhookWorker.close(),
            queue_1.queue.close(),
            queue_1.webhookQueue.close(),
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
    }
    catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};
start();
