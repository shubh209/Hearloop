"use strict";
// hearloop/apps/api/src/jobs/transcribe.ts
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
exports.runTranscribeJob = runTranscribeJob;
const groq_1 = require("../lib/groq");
const db_1 = require("../lib/db");
async function runTranscribeJob(payload) {
    const { sessionId, storageKey, mimeType, languageHint, promptText } = payload;
    // 1. Mark session as processing
    await db_1.db
        .updateTable("sessions")
        .set({ status: "processing" })
        .where("id", "=", sessionId)
        .execute();
    let transcript;
    try {
        // 2. Fetch audio from storage
        const audioBuffer = await fetchAudioFromStorage(storageKey);
        // 3. Transcribe
        transcript = await (0, groq_1.transcribeAudio)(audioBuffer, {
            mimeType,
            languageHint,
            promptText,
        });
    }
    catch (err) {
        await markFailed(sessionId, "transcription_error");
        throw err;
    }
    try {
        // 4. Store transcript in analyses table
        await db_1.db
            .insertInto("analyses")
            .values({
            session_id: sessionId,
            transcript: transcript.text,
            detected_language: transcript.detectedLanguage,
            confidence: transcript.confidence,
            sentiment_label: null,
            sentiment_score: null,
            topics_json: null,
            moderation_json: null,
        })
            .execute();
        // 5. Enqueue analyze job
        await enqueueAnalyzeJob({
            sessionId,
            transcript: transcript.text,
            languageHint: transcript.detectedLanguage ?? languageHint,
        });
    }
    catch (err) {
        await markFailed(sessionId, "post_transcription_error");
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
// Placeholder — replace with real storage.ts call once built
async function fetchAudioFromStorage(storageKey) {
    const { getAudioBuffer } = await Promise.resolve().then(() => __importStar(require("../lib/storage")));
    return getAudioBuffer(storageKey);
}
// Placeholder — replace with real queue.ts call once built
async function enqueueAnalyzeJob(payload) {
    const { queue } = await Promise.resolve().then(() => __importStar(require("../lib/queue")));
    await queue.add("analyze", payload);
}
