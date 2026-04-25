"use strict";
// hearloop/apps/api/src/jobs/analyze.ts
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAnalyzeJob = runAnalyzeJob;
const claude_1 = require("../lib/claude");
const db_1 = require("../lib/db");
async function runAnalyzeJob(payload) {
    const { sessionId, transcript, languageHint } = payload;
    let analysis;
    try {
        // 1. Run Claude classification
        analysis = await (0, claude_1.analyzeTranscript)(transcript, {
            languageHint: languageHint ?? undefined,
        });
    }
    catch (err) {
        await markFailed(sessionId, "analysis_error");
        throw err;
    }
    try {
        // 2. Update the existing analyses row (created by transcribe job)
        await db_1.db
            .updateTable("analyses")
            .set({
            sentiment_label: analysis.sentiment,
            sentiment_score: analysis.sentimentScore,
            topics_json: JSON.stringify(analysis.topics),
            moderation_json: JSON.stringify({
                urgency: analysis.urgency,
                qualityFlags: analysis.qualityFlags,
                moderationFlags: analysis.moderationFlags,
                summary: analysis.summary,
            }),
        })
            .where("session_id", "=", sessionId)
            .execute();
        // 3. Mark session completed
        await db_1.db
            .updateTable("sessions")
            .set({ status: "completed" })
            .where("id", "=", sessionId)
            .execute();
        // 4. Enqueue webhook delivery
        await enqueueWebhookDelivery(sessionId);
    }
    catch (err) {
        await markFailed(sessionId, "post_analysis_error");
        throw err;
    }
}
async function markFailed(sessionId, reason) {
    await db_1.db
        .updateTable("sessions")
        .set({ status: "failed", failure_reason: reason })
        .where("id", "=", sessionId)
        .execute();
}
async function enqueueWebhookDelivery(sessionId) {
    const { queue } = await Promise.resolve().then(() => __importStar(require("../lib/queue")));
    await queue.add("deliver-webhook", { sessionId });
}
