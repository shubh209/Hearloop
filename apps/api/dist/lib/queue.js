"use strict";
// hearloop/apps/api/src/lib/queue.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhookQueue = exports.queue = void 0;
exports.createWorker = createWorker;
exports.enqueueTranscribe = enqueueTranscribe;
exports.enqueueAnalyze = enqueueAnalyze;
exports.enqueueWebhook = enqueueWebhook;
exports.enqueueExpireSession = enqueueExpireSession;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const connection = new ioredis_1.default(process.env.REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
});
// --- Queues ---
exports.queue = new bullmq_1.Queue("hearloop-jobs", {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 2000, // 2s, 4s, 8s
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 }, // keep failed jobs for debugging
    },
});
exports.webhookQueue = new bullmq_1.Queue("hearloop-webhooks", {
    connection,
    defaultJobOptions: {
        attempts: 7, // spec: at-least-once, exponential backoff
        backoff: {
            type: "exponential",
            delay: 5000, // 5s, 10s, 20s ... ~10 min max
        },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 1000 }, // dead-letter — keep all
    },
});
// --- Worker factory ---
function createWorker(jobName, handler) {
    return new bullmq_1.Worker(jobName === "deliver-webhook" ? "hearloop-webhooks" : "hearloop-jobs", async (job) => {
        if (job.name !== jobName)
            return;
        await handler(job);
    }, {
        connection,
        concurrency: jobName === "deliver-webhook" ? 20 : 5,
    });
}
// --- Enqueue helpers ---
async function enqueueTranscribe(payload) {
    await exports.queue.add("transcribe", payload, {
        jobId: `transcribe-${payload.sessionId}`, // deduplication
    });
}
async function enqueueAnalyze(payload) {
    await exports.queue.add("analyze", payload, {
        jobId: `analyze-${payload.sessionId}`,
    });
}
async function enqueueWebhook(payload) {
    await exports.webhookQueue.add("deliver-webhook", payload, {
        jobId: `webhook-${payload.eventType}:${payload.sessionId}`,
    });
}
async function enqueueExpireSession(sessionId, delayMs) {
    await exports.queue.add("expire-session", { sessionId }, {
        jobId: `expire-${sessionId}`,
        delay: delayMs,
    });
}
