"use strict";
// hearloop/apps/api/src/jobs/deliver-webhook.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDeliverWebhookJob = runDeliverWebhookJob;
const db_1 = require("../lib/db");
const crypto_1 = require("crypto");
const crypto_2 = require("crypto");
const MAX_ATTEMPTS = 7;
const WEBHOOK_TIMEOUT_MS = 10000; // 10s
async function runDeliverWebhookJob(payload) {
    const { sessionId, eventType, partnerId } = payload;
    // 1. Fetch partner webhook URL
    const partner = await db_1.db
        .selectFrom("partners")
        .select(["id", "webhook_url"])
        .where("id", "=", partnerId)
        .executeTakeFirst();
    if (!partner?.webhook_url) {
        // No webhook configured — skip silently
        return;
    }
    // 2. Build event payload
    const eventId = (0, crypto_2.randomUUID)();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const eventPayload = await buildEventPayload(sessionId, eventType, eventId);
    // 3. Sign payload with HMAC
    const secret = process.env.WEBHOOK_SIGNING_SECRET;
    const rawBody = JSON.stringify(eventPayload);
    const signature = signPayload(rawBody, timestamp, secret);
    // 4. Upsert delivery record
    const deliveryId = (0, crypto_2.randomUUID)();
    await db_1.db
        .insertInto("webhook_deliveries")
        .values({
        id: deliveryId,
        partner_id: partnerId,
        session_id: sessionId,
        event_type: eventType,
        payload_json: rawBody,
        status: "pending",
        attempt_count: 0,
        response_code: null,
        last_attempted_at: null,
        created_at: new Date(),
    })
        .onConflict((oc) => oc
        .columns(["partner_id", "session_id", "event_type"])
        .doUpdateSet({ status: "pending" }))
        .execute();
    // 5. Attempt delivery
    let responseCode = null;
    let success = false;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);
        const res = await fetch(partner.webhook_url, {
            method: "POST",
            signal: controller.signal,
            headers: {
                "Content-Type": "application/json",
                "X-Hearloop-Event": eventType,
                "X-Hearloop-Delivery": deliveryId,
                "X-Hearloop-Timestamp": timestamp,
                "X-Hearloop-Signature": signature,
            },
            body: rawBody,
        });
        clearTimeout(timeout);
        responseCode = res.status;
        success = res.status >= 200 && res.status < 300;
    }
    catch {
        responseCode = null;
        success = false;
    }
    // 6. Update delivery record
    const currentDelivery = await db_1.db
        .selectFrom("webhook_deliveries")
        .select("attempt_count")
        .where("id", "=", deliveryId)
        .executeTakeFirst();
    const attemptCount = (currentDelivery?.attempt_count ?? 0) + 1;
    const isDead = !success && attemptCount >= MAX_ATTEMPTS;
    await db_1.db
        .updateTable("webhook_deliveries")
        .set({
        status: isDead ? "dead" : success ? "delivered" : "failed",
        attempt_count: attemptCount,
        response_code: responseCode,
        last_attempted_at: new Date(),
    })
        .where("id", "=", deliveryId)
        .execute();
    // 7. Throw on failure so BullMQ retries with backoff
    if (!success && !isDead) {
        throw new Error(`Webhook delivery failed: status=${responseCode ?? "timeout"}`);
    }
}
// --- helpers ---
function signPayload(rawBody, timestamp, secret) {
    const signed = `${timestamp}.${rawBody}`;
    return "sha256=" + (0, crypto_1.createHmac)("sha256", secret).update(signed).digest("hex");
}
async function buildEventPayload(sessionId, eventType, eventId) {
    const base = {
        id: eventId,
        type: eventType,
        sessionId,
        createdAt: new Date().toISOString(),
    };
    // For completed events, include full result
    if (eventType === "session.completed") {
        const [session, recording, analysis] = await Promise.all([
            db_1.db
                .selectFrom("sessions")
                .selectAll()
                .where("id", "=", sessionId)
                .executeTakeFirst(),
            db_1.db
                .selectFrom("recordings")
                .selectAll()
                .where("session_id", "=", sessionId)
                .executeTakeFirst(),
            db_1.db
                .selectFrom("analyses")
                .selectAll()
                .where("session_id", "=", sessionId)
                .executeTakeFirst(),
        ]);
        const moderation = analysis?.moderation_json
            ? JSON.parse(analysis.moderation_json)
            : {};
        return {
            ...base,
            data: {
                status: session?.status,
                externalEventId: session?.external_event_id,
                recording: recording
                    ? {
                        mimeType: recording.mime_type,
                        durationMs: recording.duration_ms,
                        sizeBytes: recording.size_bytes,
                    }
                    : null,
                analysis: analysis
                    ? {
                        transcript: analysis.transcript,
                        detectedLanguage: analysis.detected_language,
                        sentiment: analysis.sentiment_label,
                        sentimentScore: analysis.sentiment_score,
                        topics: analysis.topics_json
                            ? JSON.parse(analysis.topics_json)
                            : [],
                        urgency: moderation.urgency ?? "none",
                        summary: moderation.summary ?? "",
                        qualityFlags: moderation.qualityFlags ?? [],
                        moderationFlags: moderation.moderationFlags ?? [],
                    }
                    : null,
            },
        };
    }
    return { ...base, data: { status: eventType.split(".")[1] } };
}
